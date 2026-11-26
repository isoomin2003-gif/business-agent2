// 정식 계정(게스트 → 계정 전환, 로그인, 로그아웃)과 전체 접속자 수
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io as ioc } from 'socket.io-client';

const PORT = 4200 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'haru-acct-'));
const OLD_TOKEN = crypto.randomBytes(32).toString('base64url');
let proc;

before(async () => {
  // 이번 변경 전(마이그레이션 001·002까지)의 DB에 게스트 1명과 일기가 있는 상태를 만들어,
  // 새 버전 서버가 시작될 때 기존 쿠키 그대로 같은 사람으로 인식하는지 확인
  const { DatabaseSync } = await import('node:sqlite');
  const d = new DatabaseSync(path.join(dataDir, 'haru.sqlite'));
  d.exec('CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  for (const f of ['001_init.sql', '002_radio_tracks.sql']) {
    d.exec(fs.readFileSync(path.join('migrations/sqlite', f), 'utf8'));
    d.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(f, new Date().toISOString());
  }
  const hash = crypto.createHash('sha256').update(OLD_TOKEN).digest('hex');
  const t = new Date().toISOString();
  d.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)').run('old-user', hash, '예전 게스트', 2, t, t);
  d.prepare("INSERT INTO videos VALUES ('v-old', 'old-user', 'sample:rain', 'video/mp4', 1, 'sample', ?)").run(t);
  d.prepare("INSERT INTO diary_entries VALUES ('e-old', 'old-user', '2026-11-01', '예전에 쓴 일기', 'v-old', ?, ?)").run(t, t);
  d.close();
  proc = spawn(process.execPath, ['--no-warnings=ExperimentalWarning', 'server/index.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, ADMIN_KEY: '', OPENROUTER_API_KEY: '', DATABASE_URL: '', SUPABASE_URL: '', SUPABASE_SECRET_KEY: '', PRESENCE_GRACE_MS: '400' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`${BASE}/healthz`)).ok) return; } catch { /* */ } await new Promise((r) => setTimeout(r, 100)); }
  throw new Error('server did not start');
});
after(() => { proc?.kill(); fs.rmSync(dataDir, { recursive: true, force: true }); });

const jar = (cookie = '') => {
  const c = { cookie };
  c.call = async (p, { method = 'GET', body } = {}) => {
    const r = await fetch(BASE + p, { method, headers: { cookie: c.cookie, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const set = r.headers.get('set-cookie');
    if (set) c.cookie = /haru_guest=;/.test(set) ? '' : set.split(';')[0];
    return { status: r.status, body: await r.json().catch(() => null), headers: r.headers };
  };
  return c;
};
const TODAY = new Date().toISOString().slice(0, 10);
const month = (c, m = '2026-11') => c.call(`/api/diary/month/${m}`).then((r) => r.body?.entries || []);

test('기존 게스트: 업데이트 후에도 예전 쿠키로 같은 방, 비밀번호를 정하면 일기 그대로 정식 계정', async () => {
  const a = jar(`haru_guest=${OLD_TOKEN}`);
  const me = await a.call('/api/me');
  assert.equal(me.body.user.id, 'old-user');
  assert.equal(me.body.user.registered, false);
  assert.equal(me.headers.get('cache-control'), 'no-store');
  // 닉네임을 바꿔 쓰던 사람도 그대로
  assert.equal((await a.call('/api/me', { method: 'PATCH', body: { nickname: '바꾼 이름' } })).status, 200);
  const r = await a.call('/api/account/register', { method: 'POST', body: { nickname: '하루기록', password: 'pass-word-1', passwordConfirm: 'pass-word-1' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.id, 'old-user');
  assert.equal(r.body.user.registered, true);
  assert.deepEqual((await month(a)).map((e) => e.sentence), ['예전에 쓴 일기']);
  // 비밀번호는 해시로만 저장
  const { DatabaseSync } = await import('node:sqlite');
  const d = new DatabaseSync(path.join(dataDir, 'haru.sqlite'), { readOnly: true });
  const row = d.prepare("SELECT password_hash FROM users WHERE id = 'old-user'").get();
  d.close();
  assert.match(row.password_hash, /^scrypt:/);
  assert.ok(!row.password_hash.includes('pass-word-1'));
});

test('새 게스트 → 계정 전환: 일기 유지, 정식 닉네임은 한 계정만, 임시 닉네임은 겹쳐도 됨', async () => {
  const b = jar();
  await b.call('/api/guest', { method: 'POST', body: { nickname: '하루기록' } }); // 임시 닉네임은 정식 닉네임과 같아도 됨
  const v = await b.call('/api/videos/sample', { method: 'POST', body: { sampleId: 'sunset' } });
  await b.call(`/api/diary/day/${TODAY}`, { method: 'PUT', body: { sentence: 'B의 일기', videoId: v.body.videoId } });
  const taken = await b.call('/api/account/register', { method: 'POST', body: { nickname: '하루기록', password: 'another-pw', passwordConfirm: 'another-pw' } });
  assert.equal(taken.status, 409);
  assert.equal(taken.body.message, '이미 사용 중인 닉네임이에요');
  // 대소문자·공백만 다른 이름도 같은 이름
  await b.call('/api/account/register', { method: 'POST', body: { nickname: 'Moon Light', password: 'another-pw', passwordConfirm: 'another-pw' } });
  const c = jar(); await c.call('/api/guest', { method: 'POST' });
  assert.equal((await c.call('/api/account/register', { method: 'POST', body: { nickname: 'moon  light', password: 'xxxxxxxx', passwordConfirm: 'xxxxxxxx' } })).status, 409);
  // 비밀번호 규칙
  assert.equal((await c.call('/api/account/register', { method: 'POST', body: { nickname: '새이름', password: 'short', passwordConfirm: 'short' } })).status, 400);
  assert.equal((await c.call('/api/account/register', { method: 'POST', body: { nickname: '새이름', password: 'longenough1', passwordConfirm: 'different1' } })).status, 400);
  assert.deepEqual((await month(b, TODAY.slice(0, 7))).map((e) => e.sentence), ['B의 일기']);
  // 정식 계정은 다른 정식 계정의 이름으로 바꿀 수 없음
  assert.equal((await b.call('/api/me', { method: 'PATCH', body: { nickname: '하루기록' } })).status, 409);
});

test('다른 브라우저에서 로그인: 닉네임·비밀번호가 모두 맞아야 같은 방, 로그아웃하면 기록 접근 불가', async () => {
  const other = jar();
  assert.equal((await other.call('/api/account/login', { method: 'POST', body: { nickname: '하루기록', password: '' } })).status, 400);
  const wrong = await other.call('/api/account/login', { method: 'POST', body: { nickname: '하루기록', password: 'wrong-password' } });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.body.message, '닉네임 또는 비밀번호가 맞지 않아요.');
  assert.equal((await other.call('/api/account/login', { method: 'POST', body: { nickname: '없는사람', password: 'pass-word-1' } })).body.message, '닉네임 또는 비밀번호가 맞지 않아요.');
  assert.equal(other.cookie, '');
  const ok = await other.call('/api/account/login', { method: 'POST', body: { nickname: '하루기록', password: 'pass-word-1' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.id, 'old-user');
  assert.deepEqual((await month(other)).map((e) => e.sentence), ['예전에 쓴 일기']);
  // 로그아웃: 이 브라우저의 세션만 끝남 (원래 브라우저는 그대로)
  const before = other.cookie;
  await other.call('/api/account/logout', { method: 'POST' });
  assert.equal(other.cookie, '');
  assert.equal((await jar(before).call('/api/diary/month/2026-11')).status, 401);
  assert.equal((await jar(`haru_guest=${OLD_TOKEN}`).call('/api/me')).body.user.id, 'old-user');
});

test('전체 접속자 수: 같은 계정 여러 탭·브라우저는 1명, 다른 계정은 따로, 첫 방문자도 포함, 끊기면 잠시 뒤 빠짐', async () => {
  const conn = (cookie, visitor) => new Promise((resolve) => {
    const s = ioc(BASE, { extraHeaders: cookie ? { cookie } : {}, auth: visitor ? { visitor } : {}, transports: ['websocket'], forceNew: true });
    s.last = null; s.on('online', ({ count }) => { s.last = count; });
    s.on('connect', () => resolve(s));
  });
  const settle = () => new Promise((r) => setTimeout(r, 150));
  const online = async () => (await (await fetch(`${BASE}/api/places`)).json()).online;
  const base = await online();
  const a1 = await conn(`haru_guest=${OLD_TOKEN}`, 'visitorAAAA1');
  const a2 = await conn(`haru_guest=${OLD_TOKEN}`, 'visitorAAAA1'); // 같은 브라우저 다른 탭
  const login = jar(); await login.call('/api/account/login', { method: 'POST', body: { nickname: '하루기록', password: 'pass-word-1' } });
  const a3 = await conn(login.cookie, 'visitorBBBB2'); // 같은 계정, 다른 브라우저
  await settle();
  assert.equal(await online(), base + 1);
  const g = jar(); await g.call('/api/guest', { method: 'POST' });
  const b1 = await conn(g.cookie, 'visitorCCCC3'); // 다른 사람(게스트)
  const v1 = await conn('', 'visitorDDDD4'); const v2 = await conn('', 'visitorDDDD4'); // 아직 입장 전인 첫 방문자 (탭 2개)
  await settle();
  assert.equal(await online(), base + 3);
  assert.equal(v1.last, base + 3);
  // 첫 방문자가 입장(게스트 생성)하면 방문자 대신 계정으로 셈 → 늘지 않음
  const nv = jar(); await nv.call('/api/guest', { method: 'POST' });
  const v3 = await conn(nv.cookie, 'visitorDDDD4');
  await settle();
  assert.equal(await online(), base + 3);
  // 새로고침처럼 잠깐 끊겼다 다시 붙으면 숫자 변화 없음
  b1.close(); const b2 = await conn(g.cookie, 'visitorCCCC3'); await settle();
  assert.equal(await online(), base + 3);
  // 완전히 나가면 유예 시간 뒤에 빠짐
  b2.close(); await settle();
  assert.equal(await online(), base + 3);
  await new Promise((r) => setTimeout(r, 600));
  assert.equal(await online(), base + 2);
  [a1, a2, a3, v1, v2, v3].forEach((s) => s.close());
  await new Promise((r) => setTimeout(r, 700));
  assert.equal(await online(), base);
});

test('아바타 꾸미기: 고르기 전엔 기본(null), 저장하면 계정에 남아 다른 브라우저 로그인에서도 같음, 옥상의 다른 사람에게 바로 반영, 잘못된 값 거절', async () => {
  const { validAvatar, avatarOf, HAIRS, TOPS, BOTTOMS } = await import('../public/js/shared/avatar.js');
  assert.equal(HAIRS.length * TOPS.length * BOTTOMS.length, 72);
  assert.deepEqual(avatarOf(null), { hair: 0, top: 0, bottom: 0 }); // 짧은 가르마 + 연보라 + 짙은 긴바지
  assert.equal(validAvatar({ hair: 6, top: 0, bottom: 0 }), null);
  assert.equal(validAvatar({ hair: 1, top: 2 }), null);
  const a = jar();
  await a.call('/api/guest', { method: 'POST', body: {} });
  assert.equal((await a.call('/api/me')).body.user.avatar, null);
  await a.call('/api/account/register', { method: 'POST', body: { nickname: '묶음머리', password: 'pass-word-9', passwordConfirm: 'pass-word-9' } });
  assert.equal((await a.call('/api/me/avatar', { method: 'PUT', body: { hair: 9, top: 0, bottom: 0 } })).status, 400);
  // 옥상에 다른 사람(b)이 있는 동안 a가 옥상에 들어가 있다가 모습을 바꿈
  const b = jar(); await b.call('/api/guest', { method: 'POST', body: {} });
  const sa = ioc(BASE, { extraHeaders: { cookie: a.cookie }, transports: ['websocket'] });
  const sb = ioc(BASE, { extraHeaders: { cookie: b.cookie }, transports: ['websocket'] });
  await Promise.all([new Promise((r) => sa.on('connect', r)), new Promise((r) => sb.on('connect', r))]);
  await new Promise((r) => sb.emit('join', { place: 'rooftop' }, r));
  const joined = new Promise((r) => sb.on('player:join', r));
  await new Promise((r) => sa.emit('join', { place: 'rooftop' }, r));
  assert.equal((await joined).avatar, null);
  const changed = new Promise((r) => sb.on('player:avatar', r));
  const saved = await a.call('/api/me/avatar', { method: 'PUT', body: { hair: 5, top: 0, bottom: 1 } });
  assert.deepEqual(saved.body.user.avatar, { hair: 5, top: 0, bottom: 1 });
  assert.deepEqual((await changed).avatar, { hair: 5, top: 0, bottom: 1 });
  sa.close(); sb.close();
  // 다른 브라우저에서 로그인해도 같은 모습
  const c = jar();
  const li = await c.call('/api/account/login', { method: 'POST', body: { nickname: '묶음머리', password: 'pass-word-9' } });
  assert.equal(li.status, 200, JSON.stringify(li.body));
  assert.deepEqual((await c.call('/api/me')).body.user.avatar, { hair: 5, top: 0, bottom: 1 });
});

test('비밀번호를 계속 틀리면 잠시 막음', async () => {
  const x = jar();
  let last;
  for (let i = 0; i < 11; i++) last = await x.call('/api/account/login', { method: 'POST', body: { nickname: 'Moon Light', password: `nope-${i}-xxxx` } });
  assert.equal(last.status, 429);
});
