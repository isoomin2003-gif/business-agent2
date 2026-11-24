// 테스트용 Openverse 모의 서버: 라이선스·길이·재생 가능 여부가 섞인 결과를 돌려 서버의 걸러내기를 확인합니다.
// 오디오 주소는 이 서버 자신(/audio/:id)으로, Range 요청에 206 audio/mpeg로 답합니다(404인 곡도 하나 포함).
import http from 'node:http';

const SECOND = 1000;
export function startMockOpenverse(port = 0) {
  let base = '';
  const items = () => [
    { id: 'g1', title: 'Rainy Window Guitar', creator: 'Ana', license: 'by', license_version: '4.0', duration: 150 * SECOND, genres: ['acoustic'], tags: ['guitar', 'calm', 'rain'] },
    { id: 'g2', title: 'Night Drizzle', creator: 'Bo', license: 'cc0', license_version: '1.0', duration: 120 * SECOND, genres: ['ambient'], tags: ['guitar', 'night', 'soft'] },
    { id: 'g3', title: 'Puddle Steps', creator: 'Cy', license: 'by-sa', license_version: '3.0', duration: 200 * SECOND, genres: ['folk'], tags: ['acoustic guitar', 'gentle'] },
    { id: 'g4', title: 'Storm Lullaby', creator: 'Di', license: 'by', license_version: '3.0', duration: 180 * SECOND, genres: ['instrumental'], tags: ['guitar', 'slow'] },
    { id: 'g5', title: 'Dripping Strings', creator: 'Ed', license: 'by', license_version: '3.0', duration: 170 * SECOND, genres: ['acoustic'], tags: ['guitar'] },
    { id: 'nc1', title: 'NC Only Song', creator: 'Fi', license: 'by-nc', license_version: '3.0', duration: 150 * SECOND, genres: [], tags: ['guitar'] }, // 비영리 조건 → 제외
    { id: 'short', title: 'Tiny Jingle', creator: 'Gu', license: 'cc0', duration: 8 * SECOND, genres: [], tags: [] }, // 너무 짧음 → 제외
    { id: 'dead', title: 'Broken Link Ballad', creator: 'Ha', license: 'by', license_version: '4.0', duration: 140 * SECOND, genres: ['acoustic'], tags: ['guitar', 'rain'] }, // 404 → 재생 확인에서 제외
    { id: 'base', title: 'Lofi again', creator: 'omfgdude', license: 'cc0', duration: 88 * SECOND, genres: ['lofi'], tags: [] }, // 기본 수록곡 → 제외
    { id: 'g1dup', title: 'Rainy Window Guitar', creator: 'Ana', license: 'by', license_version: '4.0', duration: 150 * SECOND, genres: ['acoustic'], tags: ['guitar'] }, // 중복
  ].map((x) => ({
    ...x, source: 'jamendo', url: `${base}/audio/${x.id}.mp3`, foreign_landing_url: `https://example.org/track/${x.id}`,
    license_url: `https://creativecommons.org/licenses/${x.license}/${x.license_version || '1.0'}/`, attribution: `"${x.title}" by ${x.creator} is licensed under CC ${x.license.toUpperCase()}.`,
    tags: x.tags.map((name) => ({ name })),
  }));
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname.startsWith('/audio/')) {
      if (u.pathname.includes('dead')) { res.writeHead(404); return res.end(); }
      res.writeHead(206, { 'Content-Type': 'audio/mpeg', 'Content-Range': 'bytes 0-2047/99999', 'Accept-Ranges': 'bytes' });
      return res.end(Buffer.alloc(2048));
    }
    if (u.pathname === '/v1/audio/') {
      const q = (u.searchParams.get('q') || '').toLowerCase();
      const results = /nothing|zzz/.test(q) ? [] : items();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ result_count: results.length, results }));
    }
    res.writeHead(404); res.end();
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => {
    base = `http://127.0.0.1:${server.address().port}`;
    resolve({ url: `${base}/v1`, close: () => server.close() });
  }));
}
