// 테스트용 OpenRouter 모의 서버: 실제 키 없이 '검색 → AI 행동 선택 → 재검색 → 답변' 경로를 끝까지 확인합니다.
// 실제 모델 대신 정해진 규칙으로 JSON 행동(answer / retry / not_found)을 돌려줍니다.
// 사용: node test/mock-openrouter.js 3300 [요청 기록 파일]  →  OPENROUTER_BASE_URL=http://localhost:3300/api/v1
// /fail/api/v1 로 요청하면 503을 돌려 'API 연결 실패' 상황을 재현합니다.
import http from 'node:http';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// 질문 주제 → (근거로 인정할 문장 패턴, 재검색 단서)
const TOPICS = [
  { q: /웃|재밌/, ok: /웃|재밌|즐거/, retry: ['재밌', '즐거웠', '신나'] },
  { q: /비 |비가|빗|우산|비오|비 오/, ok: /빗|우산|비 /, retry: ['빗소리', '우산', '빗방울'] },
  { q: /노을|해질/, ok: /노을|해질/, retry: ['석양', '해질녘'] },
  { q: /바다|수영|해변/, ok: /바다|해변|파도|수영/, retry: ['해변', '파도', '물놀이'] },
];

export function decide(userContent) {
  const question = (userContent.match(/질문: (.*)/) || [])[1] || '';
  const allowRetry = /재검색 가능: 예/.test(userContent);
  const records = [...userContent.matchAll(/\[(\d+)\] (\d{4})-(\d{2})-(\d{2}) — (.+)/g)].map((m) => ({ n: Number(m[1]), month: Number(m[3]), day: Number(m[4]), text: m[5] }));
  const topic = TOPICS.find((t) => t.q.test(question));
  const hit = records.find((r) => (topic ? topic.ok.test(r.text) : true));
  if (hit) return { action: 'answer', answer: `${hit.month}월 ${hit.day}일이에요. 그날 “${hit.text}”라고 적었어요.`, used: [hit.n] };
  if (allowRetry) return { action: 'retry', keywords: topic ? topic.retry : ['기억'], reason: '첫 검색에서 질문과 맞는 문장을 찾지 못함' };
  return { action: 'not_found' };
}

// 새 노래 추천(도구 호출) 흉내: 요청 → search_music → 결과에서 최대 3곡 선택(이유 포함), 0곡이면 검색어를 바꿔 1회 더, 그래도 없으면 빈 목록
export function discoverTurn(messages) {
  const text = messages.find((m) => m.role === 'user').content;
  const toolMsgs = messages.filter((m) => m.role === 'tool');
  const call = (query, n) => ({ role: 'assistant', content: '', tool_calls: [{ id: `call_${n}`, type: 'function', function: { name: 'search_music', arguments: JSON.stringify({ queries: query.split(' / ') }) } }] });
  if (!toolMsgs.length) return call(/없는|zzz/.test(text) ? 'zzz / nothing' : 'rain guitar / calm guitar', 1);
  const last = JSON.parse(toolMsgs[toolMsgs.length - 1].content);
  const results = last.results || [];
  if (!results.length && toolMsgs.length < 2) return call(/없는|zzz/.test(text) ? 'nothing / still' : 'soft guitar', 2);
  // 요청에 '설명만'이 있으면 첫 최종 답을 형식 없는 설명으로 → 서버가 형식을 짚어 다시 물으면 JSON으로 답함
  if (/설명만/.test(text) && !messages.some((m) => m.role === 'user' && /JSON 하나만/.test(m.content))) return { role: 'assistant', content: '비 오는 밤에는 기타 곡이 좋아요. 몇 곡을 골라 볼게요.' };
  // 'ov:made-up' 처럼 후보에 없는 id를 하나 섞어 서버가 걸러내는지 확인
  const picks = [{ id: 'ov:made-up', reason: '지어낸 곡' }, ...results.slice(0, 4).map((r) => ({ id: r.id, reason: `${(r.tags || []).slice(0, 2).join('·')} 태그라 요청에 어울려요.` }))];
  return { role: 'assistant', content: JSON.stringify({ picks }) };
}

// AI 작곡 흉내: 문장에 따라 정해진 악보(JSON). '거절'이 있으면 refuse, '엉망'이 있으면 형식이 깨진 답
export function composeTurn(text) {
  if (/거절/.test(text)) return '{"refuse": true}';
  if (/엉망/.test(text)) return '악보를 쓰는 중이에요...';
  const fast = /신나|빠른/.test(text);
  return 'JSON입니다\n' + JSON.stringify({
    title: fast ? '옥상 점프' : '첫눈 골목', mood: fast ? '신나는 8비트' : '따뜻하고 느린 오르골', bpm: fast ? 132 : 76, key: 'F', scale: 'major',
    lead: fast ? 'square' : 'musicbox', pad: 'sine', bass: 'triangle', drums: fast ? 'beat' : 'soft',
    sections: {
      A: { chords: [1, 5, 6, 4], melody: [[5, 4], [6, 2], [5, 2], [3, 4], [1, 4], [2, 4], [3, 2], [5, 2], [4, 8], [3, 4], [5, 4], [8, 8], [7, 4], [6, 4], [5, 8]] },
      B: { chords: [4, 1, 5, 1], melody: [[6, 4], [8, 4], [7, 4], [6, 4], [5, 8], [3, 8], [4, 4], [5, 4], [6, 4], [7, 4], [8, 30]] }, // 길이 합 초과 → 서버가 잘라 맞춤
    },
    form: ['A', 'A', 'B', 'A'],
  });
}

// 대화 질문·주간신문 흉내 (시스템 프롬프트 첫머리의 표시로 구분)
const TOPICS_MOCK = [['요즘 듣는 소리', '요즘 자주 듣는 노래나 소리가 있어?'], ['찍어 둔 사진', '최근에 찍은 사진 중 기억에 남는 게 있어?'], ['손으로 만든 것', '요즘 손으로 만들어 본 게 있어?']];
export function diaryTurn(system, user) {
  if (system.startsWith('[대화-첫질문]')) {
    const pick = TOPICS_MOCK.find(([t]) => !user.includes(t)) || TOPICS_MOCK[0];
    return { topic: pick[0], greeting: '안녕, 오늘도 와 줘서 반가워!', question: pick[1] };
  }
  if (system.startsWith('[대화-이어가기]')) {
    const answers = [...user.matchAll(/답: (.+)/g)].map((m) => m[1]).filter((a) => !a.includes('아직 답하지'));
    const last = answers.at(-1) || '';
    if (/그냥/.test(last)) return { greeting: '', question: '그때 눈에 들어온 게 있었어?' };
    return { greeting: user.includes('1번째') ? '다시 왔네!' : '', question: `"${last.slice(0, 12)}" 이야기, 그때 어떤 기억이 떠올랐어?` };
  }
  if (system.startsWith('[신문-계획]')) {
    const answers = [...user.matchAll(/답: (.+)/g)].map((m) => m[1]).join(' ');
    if (/출처없음/.test(answers)) return { skip: false, evidence: '아무도 모르는 것', question: '알 수 없는 것은?', queries_ko: ['zzzz 없는 말'], query_en: 'zzzz' };
    if (/불빛|번졌/.test(answers)) return { skip: false, evidence: '밤 호수 사진의 번진 불빛', question: '밤에 찍은 호수 사진에서 불빛은 왜 번질까?', queries_ko: ['보케', '야경 사진'], query_en: 'bokeh' };
    if (/노래/.test(answers)) return { skip: false, evidence: '할머니 집에서 듣던 옛날 노래', question: '옛날 가요는 어떻게 사랑받았을까?', queries_ko: ['트로트'], query_en: 'trot music' };
    return { skip: true, reason: '관심사를 특정하기 어려움' };
  }
  if (system.startsWith('[신문-기사]')) {
    const titles = [...user.matchAll(/\[(\d+)\] (.+?) \(/g)].map((m) => m[2]);
    return { title: `${titles[0]} 이야기`, body: `${titles[0]}에 대해 출처에서 확인한 내용입니다.\n\n두 번째 문단입니다.`, reason: '지난주 사진 이야기에서 시작했어요.', used: [1] };
  }
  return null;
}

export function startMockOpenRouter(port = 0, logFile) {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const parsed = JSON.parse(body || '{}');
      if (logFile) fs.appendFileSync(logFile, JSON.stringify({ url: req.url, auth: req.headers.authorization ? 'present' : 'missing', body: parsed }) + '\n');
      if (req.url.startsWith('/fail')) { res.writeHead(503, { 'Content-Type': 'application/json' }); return res.end('{"error":{"message":"mock outage"}}'); }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      const sys0 = parsed.messages?.[0]?.content || '';
      if (/^\[(대화|신문)-/.test(sys0)) return res.end(JSON.stringify({ model: 'mock/diary', choices: [{ message: { role: 'assistant', content: JSON.stringify(diaryTurn(sys0, parsed.messages.find((m) => m.role === 'user').content)) } }] }));
      if (/AI 작곡가/.test(parsed.messages?.[0]?.content || '')) return res.end(JSON.stringify({ model: 'mock/compose', choices: [{ message: { role: 'assistant', content: composeTurn(parsed.messages.find((m) => m.role === 'user').content) } }] }));
      if (parsed.tools) return res.end(JSON.stringify({ model: 'mock/discover', choices: [{ message: discoverTurn(parsed.messages) }] }));
      const user = parsed.messages.find((m) => m.role === 'user').content;
      res.end(JSON.stringify({ model: 'mock/agent', choices: [{ message: { role: 'assistant', content: JSON.stringify(decide(user)) } }] }));
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const s = await startMockOpenRouter(Number(process.argv[2] || 3300), process.argv[3]);
  console.log(`mock openrouter on ${s.url}`);
}
