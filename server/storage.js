// 영상 저장소 어댑터
// - SUPABASE_URL + SUPABASE_SECRET_KEY 가 있으면 Supabase Storage의 '비공개' 버킷 (배포용, 재시작 후에도 보존)
// - 없으면 DATA_DIR/videos 로컬 디스크 (로컬 개발용)
// 어느 쪽이든 영상은 서버가 소유자를 확인한 뒤에만 열어 줍니다.
import fs from 'node:fs';
import path from 'node:path';
import { config, PATHS } from './config.js';

const SIGNED_URL_SEC = 300;

function localStorage() {
  fs.mkdirSync(PATHS.videos, { recursive: true });
  return {
    kind: 'local',
    async init() {},
    async put(key, srcPath) {
      const dest = path.join(PATHS.videos, key);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      await fs.promises.copyFile(srcPath, dest);
    },
    async remove(key) { await fs.promises.rm(path.join(PATHS.videos, key), { force: true }); },
    /** Express 응답으로 영상 전송 (Range 지원) */
    async serve(res, key, mime) {
      res.type(mime);
      res.sendFile(path.join(PATHS.videos, key), { acceptRanges: true });
    },
  };
}

function supabaseStorage({ url, secretKey, bucket }) {
  const base = `${url}/storage/v1`;
  // 새 형식의 secret key(sb_secret_...)는 apikey 헤더로, 예전 service_role(JWT)은 Authorization에도 넣습니다.
  const headers = (extra = {}) => ({
    apikey: secretKey,
    ...(secretKey.startsWith('eyJ') ? { Authorization: `Bearer ${secretKey}` } : {}),
    ...extra,
  });
  const enc = (key) => key.split('/').map(encodeURIComponent).join('/');
  async function call(method, p, { body, json, contentType } = {}) {
    const res = await fetch(`${base}${p}`, {
      method,
      headers: headers(json ? { 'Content-Type': 'application/json' } : contentType ? { 'Content-Type': contentType } : {}),
      body: json ? JSON.stringify(json) : body,
    });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { data = text; }
    return { ok: res.ok, status: res.status, data };
  }
  return {
    kind: 'supabase',
    async init() {
      // 비공개 버킷이 없으면 만듭니다 (이미 있으면 그대로 사용)
      const got = await call('GET', `/bucket/${bucket}`);
      if (got.ok) {
        if (got.data?.public) console.warn(`[storage] 경고: 버킷 '${bucket}'이 공개(public)로 설정되어 있어요. Supabase에서 비공개로 바꿔 주세요.`);
        return;
      }
      const made = await call('POST', '/bucket', { json: { id: bucket, name: bucket, public: false, file_size_limit: config.maxVideoMb * 1024 * 1024 } });
      if (!made.ok && !/exist/i.test(JSON.stringify(made.data))) {
        throw new Error(`Supabase 버킷 준비 실패 (HTTP ${made.status}): ${JSON.stringify(made.data).slice(0, 200)}`);
      }
      console.log(`[storage] 비공개 버킷 생성: ${bucket}`);
    },
    async put(key, srcPath, mime) {
      const body = await fs.promises.readFile(srcPath);
      const r = await call('POST', `/object/${bucket}/${enc(key)}`, { body, contentType: mime });
      if (!r.ok) throw new Error(`Supabase 업로드 실패 (HTTP ${r.status}): ${JSON.stringify(r.data).slice(0, 200)}`);
    },
    async remove(key) {
      await call('DELETE', `/object/${bucket}`, { json: { prefixes: [key] } });
    },
    /** 소유자 확인이 끝난 요청에만 5분짜리 서명 주소를 만들어 그쪽으로 보냅니다 (Range 재생은 Supabase가 처리) */
    async serve(res, key) {
      const r = await call('POST', `/object/sign/${bucket}/${enc(key)}`, { json: { expiresIn: SIGNED_URL_SEC } });
      const signed = r.data?.signedURL || r.data?.signedUrl;
      if (!r.ok || !signed) {
        console.error(`[storage] 서명 주소 생성 실패 HTTP ${r.status}`);
        return res.status(502).json({ error: 'storage', message: '영상 저장소에 연결하지 못했어요.' });
      }
      res.redirect(302, signed.startsWith('http') ? signed : `${base}${signed}`);
    },
  };
}

let storage = null;

export async function initStorage() {
  if (storage) return storage;
  const { url, secretKey } = config.supabase;
  storage = url && secretKey ? supabaseStorage(config.supabase) : localStorage();
  await storage.init();
  return storage;
}

export function getStorage() {
  if (!storage) throw new Error('storage not initialized');
  return storage;
}
