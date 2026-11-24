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

export function startMockOpenRouter(port = 0, logFile) {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const parsed = JSON.parse(body || '{}');
      if (logFile) fs.appendFileSync(logFile, JSON.stringify({ url: req.url, auth: req.headers.authorization ? 'present' : 'missing', body: parsed }) + '\n');
      if (req.url.startsWith('/fail')) { res.writeHead(503, { 'Content-Type': 'application/json' }); return res.end('{"error":{"message":"mock outage"}}'); }
      const user = parsed.messages.find((m) => m.role === 'user').content;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ model: 'mock/agent', choices: [{ message: { role: 'assistant', content: JSON.stringify(decide(user)) } }] }));
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const s = await startMockOpenRouter(Number(process.argv[2] || 3300), process.argv[3]);
  console.log(`mock openrouter on ${s.url}`);
}
