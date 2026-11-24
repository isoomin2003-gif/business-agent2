// 테스트용 OpenRouter 모의 서버: 실제 키 없이 '근거 전달 → 답변 생성' 경로를 끝까지 확인합니다.
// 사용: node test/mock-openrouter.js 3300  →  OPENROUTER_BASE_URL=http://localhost:3300/api/v1
// /fail/api/v1 로 요청하면 503을 돌려 'API 연결 실패' 상황을 재현합니다.
import http from 'node:http';
import fs from 'node:fs';

const port = Number(process.argv[2] || 3300);
const logFile = process.argv[3];
http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    if (logFile) fs.appendFileSync(logFile, JSON.stringify({ url: req.url, auth: req.headers.authorization ? 'present' : 'missing', body: JSON.parse(body || '{}') }) + '\n');
    if (req.url.startsWith('/fail')) { res.writeHead(503, { 'Content-Type': 'application/json' }); return res.end('{"error":{"message":"mock outage"}}'); }
    const user = JSON.parse(body).messages.find((m) => m.role === 'user').content;
    const first = user.match(/\[1\] (\d{4})-(\d{2})-(\d{2}) — (.+)/);
    const content = first ? `${Number(first[2])}월 ${Number(first[3])}일이에요. 그날 “${first[4]}”라고 적었어요.` : 'NO_ANSWER';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ model: 'mock/model', choices: [{ message: { role: 'assistant', content } }] }));
  });
}).listen(port, () => console.log(`mock openrouter on ${port}`));
