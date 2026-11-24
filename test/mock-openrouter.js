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

// AI DJ(도구 호출) 흉내: 요청 → search_tracks 호출 → 결과가 요청의 핵심에 맞으면 고르고, 아니면 조건을 줄여 한 번 더, 그래도 없으면 null
const DJ_RULES = [
  { when: /밤.*산책|산책.*밤/, first: { scenes: ['밤'], moods: ['따뜻한', '평화로운', '아늑한'], avoid_moods: ['쓸쓸한'] }, second: { scenes: ['밤'], avoid_moods: ['쓸쓸한'] },
    fits: (t) => t.scenes.includes('밤') && !t.moods.includes('쓸쓸한') },
  { when: /고토/, first: { instruments: ['고토'], tempo: '느림' }, second: { instruments: ['고토'] },
    fits: (t, round) => t.instruments.includes('고토') && (round === 2 || t.tempo === '느림') },
  { when: /메탈|헤비/, first: { moods: ['신나는'], tempo: '빠름' }, second: { moods: ['신나는'] }, fits: () => false },
];
export function djTurn(messages) {
  const text = messages.find((m) => m.role === 'user').content;
  const rule = DJ_RULES.find((r) => r.when.test(text)) || { first: { moods: ['편안한'] }, second: { moods: ['차분한'] }, fits: () => true };
  const toolMsgs = messages.filter((m) => m.role === 'tool');
  const call = (args, n) => ({ role: 'assistant', content: '', tool_calls: [{ id: `call_${n}`, type: 'function', function: { name: 'search_tracks', arguments: JSON.stringify(args) } }] });
  if (!toolMsgs.length) return call(rule.first, 1);
  const last = JSON.parse(toolMsgs[toolMsgs.length - 1].content);
  const hit = (last.results || []).find((t) => rule.fits(t, toolMsgs.length));
  if (hit) return { role: 'assistant', content: JSON.stringify({ track_id: hit.id, reason: `${hit.moods.slice(0, 2).join('·')} 분위기의 곡이라 요청에 어울려요.` }) };
  if (toolMsgs.length < 2) return call(rule.second, 2);
  return { role: 'assistant', content: JSON.stringify({ track_id: null, reason: '조건을 바꿔도 맞는 곡이 없어요.' }) };
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
      if (parsed.tools) return res.end(JSON.stringify({ model: 'mock/dj', choices: [{ message: djTurn(parsed.messages) }] }));
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
