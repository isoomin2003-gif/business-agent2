// '기억 찾기' — RAG(검색 → 근거 전달 → 답변 생성)
// 1) Retrieval: 사용자의 일기만 대상으로, 날짜 조건을 먼저 적용한 뒤 한국어 문자 n-gram BM25로 최대 3개 검색 (서버 안에서만 수행)
// 2) Augmentation: 질문 + 검색된 일기의 날짜·문장만 OpenRouter로 전송 (영상·영상 주소·닉네임·계정 정보 제외)
// 3) Generation: 근거에 기반한 한국어 한두 문장 답변
import { config } from './config.js';

export const TOP_K = 3;

// ───────────── 날짜 조건 ─────────────
const pad = (n) => String(n).padStart(2, '0');
const fmt = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parseDay = (s) => new Date(`${s}T00:00:00Z`);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const monthRange = (y, m) => ({ from: fmt(new Date(Date.UTC(y, m, 1))), to: fmt(new Date(Date.UTC(y, m + 1, 0))) });

/** 질문에서 날짜 표현을 찾아 범위로 바꾸고, 해당 표현을 지운 질문을 돌려줍니다. */
export function parseDateRange(question, today) {
  const t = /^\d{4}-\d{2}-\d{2}$/.test(today || '') ? parseDay(today) : parseDay(fmt(new Date()));
  const y = t.getUTCFullYear(), m = t.getUTCMonth();
  const rules = [
    [/(이번\s*달|이달|이번\s*월)/, () => ({ ...monthRange(y, m), label: '이번 달' })],
    [/(지난\s*달|저번\s*달|전\s*달)/, () => ({ ...monthRange(y, m - 1), label: '지난달' })],
    [/(그저께|그제)/, () => ({ from: fmt(addDays(t, -2)), to: fmt(addDays(t, -2)), label: '그저께' })],
    [/어제/, () => ({ from: fmt(addDays(t, -1)), to: fmt(addDays(t, -1)), label: '어제' })],
    [/오늘/, () => ({ from: fmt(t), to: fmt(t), label: '오늘' })],
    [/(이번\s*주|금주)/, () => { const mon = addDays(t, -((t.getUTCDay() + 6) % 7)); return { from: fmt(mon), to: fmt(addDays(mon, 6)), label: '이번 주' }; }],
    [/(지난\s*주|저번\s*주)/, () => { const mon = addDays(t, -((t.getUTCDay() + 6) % 7) - 7); return { from: fmt(mon), to: fmt(addDays(mon, 6)), label: '지난주' }; }],
    [/(작년|지난\s*해)/, () => ({ from: `${y - 1}-01-01`, to: `${y - 1}-12-31`, label: '작년' })],
    [/(올해|금년)/, () => ({ from: `${y}-01-01`, to: `${y}-12-31`, label: '올해' })],
    [/(1[0-2]|[1-9])\s*월/, (mm) => { const n = Number(mm[1]) - 1; const yy = n > m ? y - 1 : y; return { ...monthRange(yy, n), label: `${n + 1}월` }; }],
  ];
  for (const [re, fn] of rules) {
    const mm = question.match(re);
    if (mm) return { range: fn(mm), rest: question.replace(re, ' ') };
  }
  return { range: null, rest: question };
}

// ───────────── 토큰화 ─────────────
const STOP = new Set(['언제', '언제야', '언제였지', '언제지', '날', '날이', '날은', '날을', '때', '무엇', '뭐', '뭘', '뭐였지', '어떤', '어디',
  '기록', '일기', '나', '내가', '내', '제가', '저', '그', '이', '있었', '있었지', '있었던', '했지', '였지', '이었지', '알려줘', '찾아줘', '줘', '좀',
  '에', '에서', '은', '는', '이랑', '랑', '하고', '적', '있어', '있나', '있었나', '했던', '거', '것', '몇', '일', '며칠']);
const SUFFIXES = ['이었던', '었었던', '했었던', '이랑', '하고', '에서', '에게', '한테', '으로', '었던', '았던', '였던', '했던', '었지', '았지', '였지', '했지',
  '었다', '았다', '였다', '했다', '이었', '랑', '과', '와', '을', '를', '은', '는', '이', '가', '도', '의', '에', '로', '던', '지', '다', '고', '며', '서', '들'];
const SYNONYMS = {
  웃: ['웃', '재밌', '재미', '즐거', '신나', '행복', '깔깔'],
  재밌: ['재밌', '재미', '웃', '즐거', '신나'],
  친구: ['친구', '동기', '동아리', '선배', '후배', '같이'],
  비: ['비', '우산', '장마', '빗'],
  산책: ['산책', '걷', '걸었', '걸으'],
  노을: ['노을', '해질', '석양', '저녁놀'],
  슬프: ['슬프', '슬펐', '울', '우울', '속상'],
  맛있: ['맛있', '먹', '밥', '카페'],
  먹: ['먹', '맛있', '밥', '식당'],
};

const clean = (s) => s.normalize('NFC').toLowerCase().replace(/[^0-9a-z가-힣\s]/g, ' ');

const ONE_CHAR_NOUNS = new Set(['비', '눈', '밤', '꿈', '잠', '밥', '책', '별', '달', '해', '산', '강', '차', '집', '옷', '빵', '술', '춤', '글', '시', '봄', '빛', '숲', '물']);
const REQUEST_VERB = /^(보여|알려|찾아|말해|정리|요약|궁금|기억나)/;

function stem(word) {
  let w = word;
  for (let i = 0; i < 2; i++) {
    const suf = SUFFIXES.find((s) => w.length > s.length && w.endsWith(s));
    if (!suf) break;
    const next = w.slice(0, -suf.length);
    // '노을'→'노'처럼 명사가 조사 제거로 1글자가 되는 경우는 막고, '비에'→'비' 같은 1글자 명사는 허용
    if (next.length === 1 && suf.length === 1 && !ONE_CHAR_NOUNS.has(next)) break;
    w = next;
  }
  return w;
}

/** 질문 → [{token, weight}] (어간의 문자 2-gram, 1글자 어간은 1-gram, 동의어 확장은 가중치 0.6) */
export function queryTerms(text) {
  const out = new Map();
  const add = (tok, w) => out.set(tok, Math.max(out.get(tok) || 0, w));
  for (const raw of clean(text).split(/\s+/).filter(Boolean)) {
    if (STOP.has(raw) || REQUEST_VERB.test(raw)) continue;
    const s = stem(raw);
    if (!s || STOP.has(s)) continue;
    const grams = s.length === 1 ? [s] : Array.from({ length: s.length - 1 }, (_, i) => s.slice(i, i + 2));
    grams.forEach((g) => add(g, 1));
    for (const [key, syns] of Object.entries(SYNONYMS)) {
      if (s.startsWith(key) || s === key) syns.forEach((syn) => (syn.length <= 2 ? add(syn, 0.6) : add(syn.slice(0, 2), 0.6)));
    }
  }
  return [...out].map(([token, weight]) => ({ token, weight }));
}

function docTokens(text) {
  const counts = new Map();
  for (const w of clean(text).split(/\s+/).filter(Boolean)) {
    for (let i = 0; i < w.length; i++) {
      counts.set(w[i], (counts.get(w[i]) || 0) + 1);
      if (i + 1 < w.length) { const g = w.slice(i, i + 2); counts.set(g, (counts.get(g) || 0) + 1); }
    }
  }
  return counts;
}

/**
 * docs: [{id, date, sentence, ...}] → 관련도 순 최대 k개
 * 날짜 범위를 먼저 적용하고, 내용어가 없는 질문(예: '이번 달 기록 보여줘')은 최근 순으로 고릅니다.
 */
export function retrieve(question, docs, today, k = TOP_K) {
  const { range, rest } = parseDateRange(String(question), today);
  const pool = range ? docs.filter((d) => d.date >= range.from && d.date <= range.to) : docs.slice();
  const terms = queryTerms(rest);
  if (pool.length === 0) return { range, terms, results: [], reason: range ? 'empty_range' : 'no_records' };
  if (terms.length === 0) {
    const results = pool.sort((a, b) => b.date.localeCompare(a.date)).slice(0, k).map((d) => ({ ...d, score: 0 }));
    return { range, terms, results, reason: range ? 'range_only' : 'recent' };
  }
  const N = pool.length;
  const toks = pool.map((d) => docTokens(d.sentence));
  const avgLen = toks.reduce((s, t) => s + [...t.values()].reduce((a, b) => a + b, 0), 0) / N || 1;
  const scored = pool.map((d, i) => {
    const tf = toks[i];
    const len = [...tf.values()].reduce((a, b) => a + b, 0);
    let score = 0;
    for (const { token, weight } of terms) {
      const f = tf.get(token) || 0;
      if (!f) continue;
      const df = toks.filter((t) => t.has(token)).length;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      score += weight * idf * ((f * 2.2) / (f + 1.2 * (0.25 + 0.75 * (len / avgLen))));
    }
    return { ...d, score: Math.round(score * 1000) / 1000 };
  });
  const results = scored.filter((d) => d.score > 0.05)
    .sort((a, b) => b.score - a.score || b.date.localeCompare(a.date)).slice(0, k);
  return { range, terms, results, reason: results.length ? 'matched' : 'no_match' };
}

// ───────────── OpenRouter 호출 ─────────────
const SYSTEM_PROMPT = `너는 개인 영상 다이어리 서비스 '하루 한 장'의 '기억 찾기' 도우미야.
반드시 사용자 메시지에 주어진 일기 기록만 근거로 한국어 한두 문장으로 답해.
날짜는 'M월 D일' 형식으로 말하고, 기록에 없는 내용은 추측하거나 지어내지 마.
주어진 기록으로 질문에 답할 수 없으면 다른 말 없이 정확히 NO_ANSWER 라고만 출력해.`;

/** 외부로 나가는 내용 그대로를 만들어 둡니다(화면에서도 확인 가능). */
export function buildPayload(question, records, today) {
  const lines = records.map((r, i) => `[${i + 1}] ${r.date} — ${r.sentence}`).join('\n');
  return {
    model: config.openrouter.model,
    temperature: 0.2,
    max_tokens: 200,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `오늘 날짜: ${today}\n질문: ${question}\n\n일기 기록:\n${lines}` },
    ],
  };
}

export async function generateAnswer(question, records, today) {
  const payload = buildPayload(question, records, today);
  if (!config.openrouter.apiKey) {
    return { status: 'no_key', message: 'AI 답변을 만들지 못했어요. 서버에 OpenRouter API 키가 설정되어 있지 않아요. 찾은 기록은 아래에서 바로 열어볼 수 있어요.' };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.openrouter.timeoutMs);
  try {
    const res = await fetch(`${config.openrouter.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${config.openrouter.apiKey}`,
        'Content-Type': 'application/json',
        ...(config.publicUrl ? { 'HTTP-Referer': config.publicUrl } : {}),
        'X-Title': 'Haru Hanjang Memory Search',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[rag] OpenRouter HTTP ${res.status}: ${body.slice(0, 200)}`);
      return { status: 'api_error', message: `AI 연결에 실패했어요(응답 코드 ${res.status}). 찾은 기록은 아래에서 열어볼 수 있어요.` };
    }
    const data = await res.json();
    const text = String(data?.choices?.[0]?.message?.content ?? '').trim();
    if (!text) return { status: 'api_error', message: 'AI가 빈 답변을 돌려줬어요. 찾은 기록은 아래에서 열어볼 수 있어요.' };
    if (/NO_ANSWER/.test(text)) return { status: 'no_answer', message: '기록에서 질문에 대한 답을 찾지 못했어요.', model: data.model };
    return { status: 'ok', answer: text.slice(0, 400), model: data.model || payload.model };
  } catch (e) {
    const timeout = e.name === 'AbortError';
    console.warn(`[rag] OpenRouter ${timeout ? 'timeout' : 'error'}: ${e.message}`);
    return { status: 'api_error', message: timeout ? 'AI 응답이 너무 늦어 연결을 멈췄어요. 찾은 기록은 아래에서 열어볼 수 있어요.' : 'AI 서비스에 연결하지 못했어요. 찾은 기록은 아래에서 열어볼 수 있어요.' };
  } finally {
    clearTimeout(timer);
  }
}

/** 예시 기록 3개 — 개인 기록과 분리. 날짜는 질문 시점(오늘) 기준으로 만듭니다. */
export function exampleRecords(today) {
  const t = /^\d{4}-\d{2}-\d{2}$/.test(today || '') ? parseDay(today) : parseDay(fmt(new Date()));
  const y = t.getUTCFullYear(), m = t.getUTCMonth();
  const last = (d) => fmt(new Date(Date.UTC(y, m - 1, d)));
  return [
    { id: 'ex-1', date: fmt(t), sentence: '동아리 친구들이랑 불꽃놀이를 보다가 배가 아플 때까지 웃었다.', videoUrl: '/media/samples/sample-fireworks.mp4', poster: '/media/samples/sample-fireworks.jpg', example: true },
    { id: 'ex-2', date: last(12), sentence: '우산 없이 정류장까지 뛰었는데 비 냄새가 생각보다 좋았다.', videoUrl: '/media/samples/sample-rain.mp4', poster: '/media/samples/sample-rain.jpg', example: true },
    { id: 'ex-3', date: last(25), sentence: '혼자 창가에 앉아 고양이랑 노을이 다 질 때까지 멍하니 있었다.', videoUrl: '/media/samples/sample-sunset.mp4', poster: '/media/samples/sample-sunset.jpg', example: true },
  ];
}
