// 테스트용 Supabase Storage 모의 서버 (실제 키 없이 비공개 버킷 업로드·서명 주소·Range 재생 경로를 확인)
import http from 'node:http';
import crypto from 'node:crypto';

export function startMockStorage(port = 0, secret = 'sb_secret_test') {
  const buckets = new Map(); // id → { public, objects: Map(key → {body, type}) }
  const signed = new Map(); // token → { bucket, key, exp }
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const url = new URL(req.url, 'http://x');
      const p = decodeURIComponent(url.pathname);
      const json = (status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
      // 서명 주소로 받는 요청은 키 없이 허용 (Range 지원)
      let m = p.match(/^\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/);
      if (req.method === 'GET' && m) {
        const s = signed.get(url.searchParams.get('token'));
        if (!s || s.exp < Date.now() || s.bucket !== m[1] || s.key !== m[2]) return json(400, { error: 'invalid signature' });
        const obj = buckets.get(s.bucket)?.objects.get(s.key);
        if (!obj) return json(404, { error: 'not found' });
        const range = req.headers.range?.match(/bytes=(\d+)-(\d*)/);
        if (range) {
          const start = Number(range[1]), end = range[2] ? Number(range[2]) : obj.body.length - 1;
          res.writeHead(206, { 'Content-Type': obj.type, 'Content-Range': `bytes ${start}-${end}/${obj.body.length}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
          return res.end(obj.body.subarray(start, end + 1));
        }
        res.writeHead(200, { 'Content-Type': obj.type, 'Content-Length': obj.body.length, 'Accept-Ranges': 'bytes' });
        return res.end(obj.body);
      }
      if (req.headers.apikey !== secret) return json(401, { error: 'unauthorized' });
      if (req.method === 'GET' && (m = p.match(/^\/storage\/v1\/bucket\/([^/]+)$/))) {
        const b = buckets.get(m[1]);
        return b ? json(200, { id: m[1], public: b.public }) : json(404, { error: 'Bucket not found' });
      }
      if (req.method === 'POST' && p === '/storage/v1/bucket') {
        const { id, public: pub } = JSON.parse(body.toString());
        if (buckets.has(id)) return json(409, { error: 'The resource already exists' });
        buckets.set(id, { public: !!pub, objects: new Map() });
        return json(200, { name: id });
      }
      if (req.method === 'POST' && (m = p.match(/^\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/))) {
        if (!buckets.get(m[1])?.objects.has(m[2])) return json(404, { error: 'not found' });
        const token = crypto.randomBytes(12).toString('hex');
        signed.set(token, { bucket: m[1], key: m[2], exp: Date.now() + JSON.parse(body.toString()).expiresIn * 1000 });
        return json(200, { signedURL: `/object/sign/${m[1]}/${m[2]}?token=${token}` });
      }
      if (req.method === 'POST' && (m = p.match(/^\/storage\/v1\/object\/([^/]+)\/(.+)$/))) {
        const b = buckets.get(m[1]);
        if (!b) return json(404, { error: 'Bucket not found' });
        b.objects.set(m[2], { body, type: req.headers['content-type'] });
        return json(200, { Key: `${m[1]}/${m[2]}` });
      }
      if (req.method === 'DELETE' && (m = p.match(/^\/storage\/v1\/object\/([^/]+)$/))) {
        const b = buckets.get(m[1]);
        for (const k of JSON.parse(body.toString()).prefixes || []) b?.objects.delete(k);
        return json(200, []);
      }
      // 버킷 없이 공개 주소로 접근하는 경우 등 → 거부
      json(400, { error: 'unsupported' });
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({
    url: `http://127.0.0.1:${server.address().port}`, secret, buckets, close: () => server.close(),
  })));
}
