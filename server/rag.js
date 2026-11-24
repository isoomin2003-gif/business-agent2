// '기억 찾기' — 검색 결과를 보고 AI가 다음 행동을 고르는 RAG (최대 2회 검색)
//
//   1차 검색(Retrieval)  : 본인 일기 중 질문의 기간(이번 달·지난달 등) 안에서, 질문의 낱말로 한국어 문자 n-gram BM25 검색 (최대 3개)
//   AI 판단(Augmentation): 질문 + 검색된 일기의 '날짜·문장'만 OpenRouter로 보내고, AI가 JSON으로 행동을 고름
//                           answer(근거 충분) / retry(질문 뜻을 유지한 다른 단서로 재검색) / not_found
//   2차 검색             : AI가 고른 단서로, '같은 기간' 안에서 다시 검색
//   최종 판단(Generation): 2차 결과(+1차 결과)를 보고 answer 또는 not_found. 답변은 실제 문장에만 근거하고 영상 내용은 추측하지 않음
//
// 영상 파일·영상 주소·닉네임·계정 정보·기록 ID는 외부로 보내지 않습니다.
import { config } from './config.js';

export const TOP_K = 3;
export const MAX_KEYWORDS = 4;

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
  '에', '에서', '은', '는', '이랑', '랑', '하고', '적', '있어', '있나', '있었나', '했던', '거', '것', '게', '건', '몇', '일', '며칠']);
const SUFFIXES = ['이었던', '었었던', '했었던', '이랑', '하고', '에서', '에게', '한테', '으로', '었던', '았던', '였던', '했던', '었지', '았지', '였지', '했지',
  '었다', '았다', '였다', '했다', '이었', '랑', '과', '와', '을', '를', '은', '는', '이', '가', '도', '의', '에', '로', '던', '지', '다', '고', '며', '서', '들'];
const ONE_CHAR_NOUNS = new Set(['비', '눈', '밤', '꿈', '잠', '밥', '책', '별', '달', '해', '산', '강', '차', '집', '옷', '빵', '술', '춤', '글', '시', '봄', '빛', '숲', '물']);
const REQUEST_VERB = /^(보여|알려|찾아|말해|정리|요약|궁금|기억나)/;

const clean = (s) => s.normalize('NFC').toLowerCase().replace(/[^0-9a-z가-힣\s]/g, ' ');

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

/** 검색 문장(또는 AI가 고른 단서) → 실제로 쓴 검색어(어간)와 n-gram 토큰 */
export function queryTerms(text) {
  const words = [];
  const grams = new Set();
  for (const raw of clean(text).split(/\s+/).filter(Boolean)) {
    if (STOP.has(raw) || REQUEST_VERB.test(raw)) continue;
    const s = stem(raw);
    if (!s || STOP.has(s)) continue;
    if (!words.includes(s)) words.push(s);
    if (s.length === 1) grams.add(s);
    else for (let i = 0; i < s.length - 1; i++) grams.add(s.slice(i, i + 2));
  }
  return { words, grams: [...grams] };
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

/** 기간 안의 기록(pool)에서 n-gram BM25로 최대 k개. 내용어가 없으면 최근 순 */
export function searchPool(pool, grams, k = TOP_K) {
  if (!pool.length) return [];
  if (!grams.length) return pool.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, k).map((d) => ({ ...d, score: 0 }));
  const N = pool.length;
  const toks = pool.map((d) => docTokens(d.sentence));
  const avgLen = toks.reduce((s, t) => s + [...t.values()].reduce((a, b) => a + b, 0), 0) / N || 1;
  return pool.map((d, i) => {
    const tf = toks[i];
    const len = [...tf.values()].reduce((a, b) => a + b, 0);
    let score = 0;
    for (const g of grams) {
      const f = tf.get(g) || 0;
      if (!f) continue;
      const df = toks.filter((t) => t.has(g)).length;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      score += idf * ((f * 2.2) / (f + 1.2 * (0.25 + 0.75 * (len / avgLen))));
    }
    return { ...d, score: Math.round(score * 1000) / 1000 };
  }).filter((d) => d.score > 0.05).sort((a, b) => b.score - a.score || b.date.localeCompare(a.date)).slice(0, k);
}

/** 1회 검색 (테스트·기존 호출 호환용) */
export function retrieve(question, docs, today, k = TOP_K) {
  const { range, rest } = parseDateRange(String(question), today);
  const pool = range ? docs.filter((d) => d.date >= range.from && d.date <= range.to) : docs.slice();
  const q = queryTerms(rest);
  if (!pool.length) return { range, terms: q.words, results: [], reason: range ? 'empty_range' : 'no_records' };
  const results = searchPool(pool, q.grams, k);
  return { range, terms: q.words, results, reason: results.length ? (q.grams.length ? 'matched' : 'recent') : 'no_match' };
}

// ───────────── OpenRouter: 다음 행동 고르기 ─────────────
export const AGENT_PROMPT = `너는 개인 영상 다이어리 서비스 '하루 한 장'의 '기억 찾기' 도우미야.
사용자의 질문과, 서버가 그 사용자의 일기에서 검색해 온 기록(번호, 날짜, 일기 문장)이 주어져.
기록을 보고 다음 중 하나만 골라 JSON 객체 하나로만 출력해. 다른 글은 쓰지 마.

1) 질문에 대한 근거가 기록에 있으면:
   {"action":"answer","answer":"한국어 한두 문장","used":[근거 기록 번호]}
2) 근거가 없거나 부족하고, '재검색 가능: 예'이면:
   {"action":"retry","keywords":["단서1","단서2"],"reason":"짧은 이유"}
   - keywords는 최대 4개. 질문의 뜻은 그대로 두고, 일기 문장에 실제로 쓰였을 법한 다른 낱말을 골라
     (유의어, 함께 떠올릴 사물·소리·장소, 다른 표현. 예: 비 → 빗소리, 우산, 빗방울).
   - '이번 달', '지난달' 같은 기간 표현은 넣지 마. 기간은 서버가 그대로 지켜.
3) 근거가 없고 '재검색 가능: 아니오'이면:
   {"action":"not_found"}

규칙:
- answer는 주어진 일기 문장에 실제로 적힌 내용만 근거로 해. 날짜는 'M월 D일'로 말해.
- 영상에 무엇이 찍혔는지는 문장에 적혀 있지 않으면 추측하지 마.
- 질문의 핵심과 맞지 않는 기록(일부 낱말만 겹치는 기록)은 근거로 쓰지 마.`;

/** OpenRouter로 보낼 메시지 (질문 + 날짜·문장만) */
export function buildAgentPayload(question, records, allowRetry) {
  const lines = records.length ? records.map((r, i) => `[${i + 1}] ${r.date} — ${r.sentence}`).join('\n') : '(검색된 기록 없음)';
  return {
    model: config.openrouter.model,
    temperature: 0.1,
    max_tokens: 300,
    messages: [
      { role: 'system', content: AGENT_PROMPT },
      { role: 'user', content: `질문: ${question}\n재검색 가능: ${allowRetry ? '예' : '아니오'}\n\n검색된 일기:\n${lines}` },
    ],
  };
}

async function callOpenRouter(payload) {
  if (!config.openrouter.apiKey) return { ok: false, status: 'no_key', message: 'AI에 연결하지 못했어요(서버에 OpenRouter API 키가 없음).' };
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
      return { ok: false, status: 'api_error', message: `AI 연결에 실패했어요(응답 코드 ${res.status}).` };
    }
    const data = await res.json();
    return { ok: true, content: String(data?.choices?.[0]?.message?.content ?? '').trim(), model: data.model || payload.model };
  } catch (e) {
    const timeout = e.name === 'AbortError';
    console.warn(`[rag] OpenRouter ${timeout ? 'timeout' : 'error'}: ${e.message}`);
    return { ok: false, status: 'api_error', message: timeout ? 'AI 응답이 너무 늦어 연결을 멈췄어요.' : 'AI 서비스에 연결하지 못했어요.' };
  } finally {
    clearTimeout(timer);
  }
}

/** AI 응답(JSON)을 읽어 행동으로 바꿉니다. 형식이 어긋나면 안전한 쪽(not_found)으로 */
export function parseDecision(content, recordsCount, allowRetry) {
  let obj = null;
  const m = String(content).match(/\{[\s\S]*\}/);
  if (m) { try { obj = JSON.parse(m[0]); } catch { /* 형식 오류 */ } }
  if (!obj || typeof obj !== 'object') return { action: 'not_found', note: 'AI 응답 형식을 읽지 못함' };
  const action = String(obj.action || '');
  if (action === 'answer' && recordsCount > 0) {
    const used = [...new Set((Array.isArray(obj.used) ? obj.used : []).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= recordsCount))];
    return { action: 'answer', answer: String(obj.answer || '').trim().slice(0, 300), used: used.length ? used : [1] };
  }
  if (action === 'retry' && allowRetry) {
    const keywords = [...new Set((Array.isArray(obj.keywords) ? obj.keywords : [])
      .map((k) => String(k).replace(/[^0-9a-zA-Z가-힣\s]/g, '').trim().slice(0, 12)).filter(Boolean))].slice(0, MAX_KEYWORDS);
    if (keywords.length) return { action: 'retry', keywords, reason: String(obj.reason || '').slice(0, 120) };
  }
  return { action: 'not_found' };
}

/** 답변에 나온 'M월 D일'이 실제 근거 기록 날짜와 맞는지 확인 (맞지 않으면 답변 문장을 쓰지 않음) */
function answerMatchesSources(answer, sources) {
  const dates = new Set(sources.map((s) => `${Number(s.date.slice(5, 7))}월 ${Number(s.date.slice(8, 10))}일`));
  const mentioned = [...String(answer).matchAll(/(\d{1,2})월\s*(\d{1,2})일/g)].map((x) => `${Number(x[1])}월 ${Number(x[2])}일`);
  return mentioned.every((d) => dates.has(d));
}

const NOT_FOUND = '관련된 기록을 찾지 못했어요.';
const pub = (r) => ({ id: r.id, date: r.date, sentence: r.sentence, example: !!r.example });

/**
 * 기억 찾기 전체 흐름. docs는 '이 사용자의' 기록만 넘깁니다.
 * 반환: { status, answer?, message, range, sources, candidates, trace, sentToAi }
 */
export async function memorySearch({ question, docs, today }) {
  const { range, rest } = parseDateRange(String(question), today);
  const pool = range ? docs.filter((d) => d.date >= range.from && d.date <= range.to) : docs.slice();
  const trace = [];
  const sentToAi = [];
  const base = { range, trace, sentToAi };

  if (!docs.length) return { ...base, status: 'no_records', message: '아직 검색할 기록이 없어요. 책상에서 오늘의 한 장을 먼저 남겨 보세요.', sources: [], candidates: [] };
  if (!pool.length) {
    trace.push({ kind: 'search', round: 1, terms: [], range, found: 0 });
    trace.push({ kind: 'end', note: '기간 안에 기록 없음 · 검색 종료 (AI 호출 안 함)' });
    return { ...base, status: 'empty_range', message: `${range.label}(${range.from} ~ ${range.to})에는 남긴 기록이 없어요.`, sources: [], candidates: [] };
  }

  // 1차 검색
  const q1 = queryTerms(rest);
  const r1 = searchPool(pool, q1.grams);
  trace.push({ kind: 'search', round: 1, terms: q1.words.length ? q1.words : ['(내용어 없음 → 기간 안 최근 기록)'], range, found: r1.length, dates: r1.map((r) => r.date) });

  const decide = async (round, records, allowRetry) => {
    const payload = buildAgentPayload(question, records, allowRetry);
    sentToAi.push({ round, question, records: records.map((r) => ({ date: r.date, sentence: r.sentence })) });
    const res = await callOpenRouter(payload);
    if (!res.ok) { trace.push({ kind: 'ai', round, action: 'error', note: res.message }); return { error: res }; }
    const d = parseDecision(res.content, records.length, allowRetry);
    trace.push({ kind: 'ai', round, action: d.action, ...(d.keywords ? { keywords: d.keywords, reason: d.reason } : {}), ...(d.note ? { note: d.note } : {}), model: res.model });
    return { decision: d };
  };
  const failed = (err, candidates) => ({
    ...base, status: err.status, sources: [], candidates: candidates.map(pub),
    message: `${err.message} ${candidates.length ? '검색으로 찾은 기록은 아래에서 직접 열어볼 수 있어요.' : '검색으로 찾은 기록도 없어요.'}`,
  });
  const answered = (d, records) => {
    const sources = d.used.map((n) => records[n - 1]).filter(Boolean);
    const okText = d.answer && answerMatchesSources(d.answer, sources);
    if (!okText) trace.push({ kind: 'check', note: 'AI 답변의 날짜가 근거 기록과 맞지 않아 답변 문장 대신 기록만 표시' });
    return { ...base, status: 'ok', answer: okText ? d.answer : '질문과 관련된 기록을 찾았어요. 아래에서 날짜와 실제 문장을 확인해 보세요.', sources: sources.map(pub), candidates: records.map(pub) };
  };

  const a1 = await decide(1, r1, true);
  if (a1.error) return failed(a1.error, r1);
  if (a1.decision.action === 'answer') return answered(a1.decision, r1);
  if (a1.decision.action !== 'retry') {
    trace.push({ kind: 'end', note: 'AI가 근거 없음으로 판단 · 검색 종료' });
    return { ...base, status: 'not_found', message: NOT_FOUND, sources: [], candidates: r1.map(pub) };
  }

  // 2차 검색: AI가 고른 단서로, 같은 기간 안에서
  const q2 = queryTerms(a1.decision.keywords.join(' '));
  const r2 = searchPool(pool, q2.grams);
  trace.push({ kind: 'search', round: 2, terms: q2.words, range, found: r2.length, dates: r2.map((r) => r.date) });
  const merged = [...r2, ...r1.filter((x) => !r2.some((y) => y.id === x.id))].slice(0, TOP_K);
  if (!merged.length) {
    trace.push({ kind: 'end', note: '재검색 결과 없음 · 검색 종료' });
    return { ...base, status: 'not_found', message: NOT_FOUND, sources: [], candidates: [] };
  }
  const a2 = await decide(2, merged, false);
  if (a2.error) return failed(a2.error, merged);
  if (a2.decision.action === 'answer') return answered(a2.decision, merged);
  trace.push({ kind: 'end', note: 'AI가 근거 없음으로 판단 · 검색 종료' });
  return { ...base, status: 'not_found', message: NOT_FOUND, sources: [], candidates: merged.map(pub) };
}

/** 예시 기록 3개 — 개인 기록과 분리. 날짜는 질문 시점(오늘) 기준으로 만듭니다. */
export function exampleRecords(today) {
  const t = /^\d{4}-\d{2}-\d{2}$/.test(today || '') ? parseDay(today) : parseDay(fmt(new Date()));
  const y = t.getUTCFullYear(), m = t.getUTCMonth();
  const last = (d) => fmt(new Date(Date.UTC(y, m - 1, d)));
  return [
    { id: 'ex-1', date: fmt(t), sentence: '동아리 친구들이랑 불꽃놀이를 보다가 배가 아플 때까지 웃었다.', videoUrl: '/media/samples/sample-fireworks.mp4', poster: '/media/samples/sample-fireworks.jpg', example: true },
    { id: 'ex-2', date: last(12), sentence: '창가에 앉아 빗소리를 들으며 우산 쓴 사람들이 지나가는 모습을 영상으로 남겼다.', videoUrl: '/media/samples/sample-rain.mp4', poster: '/media/samples/sample-rain.jpg', example: true },
    { id: 'ex-3', date: last(25), sentence: '혼자 창가에 앉아 고양이랑 노을이 다 질 때까지 멍하니 있었다.', videoUrl: '/media/samples/sample-sunset.mp4', poster: '/media/samples/sample-sunset.jpg', example: true },
  ];
}
