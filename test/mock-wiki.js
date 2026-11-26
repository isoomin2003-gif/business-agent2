// 테스트용 위키백과 API 모의 서버: 검색(list=search)과 원문(prop=extracts). 'zzzz'는 결과 없음. 받은 검색어를 기록
import http from 'node:http';

const PAGES = {
  보케: '보케는 사진에서 초점이 맞지 않은 부분의 빛이 둥글게 번져 보이는 흐림의 미적 특성을 말한다. 조리개 모양과 렌즈 설계에 따라 달라진다. 밤에 먼 불빛을 찍을 때 두드러진다.',
  '야경 사진': '야경 사진은 밤의 풍경을 찍은 사진이다. 빛이 적어 노출 시간이 길어지고, 손떨림이나 렌즈의 빛 번짐 때문에 불빛이 번져 보일 수 있다. 삼각대를 쓰면 흔들림을 줄일 수 있다.',
  Bokeh: 'In photography, bokeh is the aesthetic quality of the blur produced in out-of-focus parts of an image, especially points of light. It depends on aperture shape and lens design.',
  트로트: '트로트는 한국의 대중가요 장르로, 일정한 리듬과 꺾는 창법이 특징이다. 20세기 초반부터 오랫동안 여러 세대에게 사랑받았다.',
  'Trot (music)': 'Trot is a genre of Korean popular music, known for its repetitive rhythm and emotional vocal style. It is one of the oldest forms of Korean pop music.',
};
const SEARCH = { 보케: ['보케'], '야경 사진': ['야경 사진'], bokeh: ['Bokeh'], 트로트: ['트로트'], 'trot music': ['Trot (music)'] };

export function startMockWiki(port = 0) {
  const queries = [];
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const p = u.searchParams;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (p.get('list') === 'search') {
      const q = p.get('srsearch') || '';
      queries.push(q);
      return res.end(JSON.stringify({ query: { search: (SEARCH[q] || []).map((title) => ({ title })) } }));
    }
    if (p.get('prop') === 'extracts') {
      const pages = (p.get('titles') || '').split('|').filter((t) => PAGES[t]).map((t) => ({ title: t, extract: PAGES[t] + ' '.repeat(10) + PAGES[t] }));
      return res.end(JSON.stringify({ query: { pages } }));
    }
    res.end('{}');
  });
  return new Promise((r) => server.listen(port, '127.0.0.1', () => r({ url: `http://127.0.0.1:${server.address().port}/w/api.php`, queries, close: () => server.close() })));
}
