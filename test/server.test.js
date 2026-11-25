// 실제 서버를 임시 데이터 폴더로 띄워 개인정보 격리·좌석 선점·라디오 신청 규칙을 확인합니다.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io as ioc } from 'socket.io-client';
import { startMockStorage } from './mock-supabase-storage.js';

// TEST_DATABASE_URL을 주면 PostgreSQL + Supabase Storage(모의 서버) 모드로, 없으면 SQLite + 로컬 디스크로 실행
const PG = process.env.TEST_DATABASE_URL || '';
const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'haru-test-'));
let proc;
let storage;

before(async () => {
  const extra = {};
  if (PG) {
    storage = await startMockStorage();
    Object.assign(extra, { DATABASE_URL: PG, SUPABASE_URL: storage.url, SUPABASE_SECRET_KEY: storage.secret });
  }
  proc = spawn(process.execPath, ['--no-warnings=ExperimentalWarning', 'server/index.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, ADMIN_KEY: 'k', OPENROUTER_API_KEY: '', DATABASE_URL: '', SUPABASE_URL: '', SUPABASE_SECRET_KEY: '', ...extra },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  for (let i = 0; i < 80; i++) {
    try {
      const h = await (await fetch(`${BASE}/healthz`)).json();
      assert.equal(h.db, PG ? 'postgres' : 'sqlite');
      return;
    } catch (e) { if (e.code === 'ERR_ASSERTION') throw e; }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
});
after(() => { proc?.kill(); storage?.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

async function guest() {
  const res = await fetch(`${BASE}/api/guest`, { method: 'POST' });
  const cookie = res.headers.get('set-cookie').split(';')[0];
  const { user } = await res.json();
  const call = async (p, opts = {}) => {
    const r = await fetch(BASE + p, { ...opts, headers: { cookie, 'Content-Type': 'application/json', ...opts.headers } });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  return { user, cookie, call };
}
const today = new Date().toISOString().slice(0, 10);
const sock = (cookie) => new Promise((resolve) => { const s = ioc(BASE, { extraHeaders: { cookie }, transports: ['websocket'] }); s.on('connect', () => resolve(s)); });
const emit = (s, ev, data) => new Promise((r) => s.emit(ev, data, r));

test('다이어리와 영상은 작성자만 볼 수 있다', async () => {
  const a = await guest(), b = await guest();
  const v = await a.call('/api/videos/sample', { method: 'POST', body: JSON.stringify({ sampleId: 'sunset' }) });
  assert.equal(v.status, 200);
  const saved = await a.call(`/api/diary/day/${today}`, { method: 'PUT', body: JSON.stringify({ sentence: '비밀 문장', videoId: v.body.videoId }) });
  assert.equal(saved.status, 200);
  assert.equal((await a.call(`/api/diary/month/${today.slice(0, 7)}`)).body.entries.length, 1);
  assert.equal((await b.call(`/api/diary/month/${today.slice(0, 7)}`)).body.entries.length, 0);
  assert.equal((await fetch(BASE + v.body.url, { headers: { cookie: a.cookie } })).status, 200);
  assert.equal((await fetch(BASE + v.body.url, { headers: { cookie: b.cookie } })).status, 404);
  assert.equal((await fetch(BASE + v.body.url)).status, 401);
  // 다른 사람의 영상 ID로 저장 시도도 거부
  const steal = await b.call(`/api/diary/day/${today}`, { method: 'PUT', body: JSON.stringify({ sentence: 'x', videoId: v.body.videoId }) });
  assert.equal(steal.status, 400);
});

test('하루 한 페이지: 같은 날 다시 저장하면 수정된다', async () => {
  const a = await guest();
  const v = await a.call('/api/videos/sample', { method: 'POST', body: JSON.stringify({ sampleId: 'rain' }) });
  const first = await a.call(`/api/diary/day/${today}`, { method: 'PUT', body: JSON.stringify({ sentence: '첫 문장', videoId: v.body.videoId }) });
  const second = await a.call(`/api/diary/day/${today}`, { method: 'PUT', body: JSON.stringify({ sentence: '고친 문장', videoId: v.body.videoId }) });
  assert.equal(first.body.created, true);
  assert.equal(second.body.created, false);
  assert.equal((await a.call('/api/diary/months')).body.months[0].count, 1);
});

test('같은 좌석을 동시에 누르면 한 명만 앉는다 / 방 인원은 세지 않는다', async () => {
  const a = await guest(), b = await guest();
  const sa = await sock(a.cookie), sb = await sock(b.cookie);
  assert.deepEqual((await (await fetch(`${BASE}/api/places`)).json()).counts, { rooftop: 0, park: 0 });
  await emit(sa, 'join', { place: 'rooftop' }); await emit(sb, 'join', { place: 'rooftop' });
  assert.equal((await (await fetch(`${BASE}/api/places`)).json()).counts.rooftop, 2);
  const [ra, rb] = await Promise.all([emit(sa, 'sit', { seat: 'A1' }), emit(sb, 'sit', { seat: 'A1' })]);
  assert.equal([ra.ok, rb.ok].filter(Boolean).length, 1);
  await emit(sb, 'join', { place: 'park' });
  assert.deepEqual((await (await fetch(`${BASE}/api/places`)).json()).counts, { rooftop: 1, park: 1 });
  sa.close(); sb.close();
});

test('라디오: 등록된 곡만, 한 사람당 한 번에 한 곡(대기·재생 중), 끝나면 다시 신청, 채팅 50자 제한', async () => {
  const a = await guest();
  const s = await sock(a.cookie);
  assert.equal((await emit(s, 'radio:request', { trackId: 'lofi-again' })).ok, false); // 옥상 밖
  await emit(s, 'join', { place: 'rooftop' });
  assert.equal((await emit(s, 'radio:request', { trackId: 'https://example.com/a.mp3' })).ok, false);
  // 연속으로 눌러도 한 건만
  const burst = await Promise.all([1, 2, 3].map(() => emit(s, 'radio:request', { trackId: 'lofi-again' })));
  assert.equal(burst.filter((r) => r.ok).length, 1);
  const again = await emit(s, 'radio:request', { trackId: 'november-snow' });
  assert.equal(again.ok, false);
  assert.equal(again.message, '이미 곡을 신청하셨어요. 신청한 곡이 끝날 때까지 기다려 주세요!');
  // 내 곡이 재생 중일 때도 신청 불가, 끝나면 다시 가능
  const ff = async () => (await (await fetch(`${BASE}/api/admin/radio/fast-forward`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Key': 'k' }, body: JSON.stringify({ secondsLeft: 3 }) })).json()).radio;
  let playingMine = false;
  for (let i = 0; i < 6 && !playingMine; i++) {
    await ff(); await new Promise((r) => setTimeout(r, 3500));
    const snap = await ff();
    playingMine = snap.current.trackId === 'lofi-again' && snap.current.requestedBy === a.user.nickname;
    if (playingMine) {
      assert.equal((await emit(s, 'radio:request', { trackId: 'november-snow' })).code, 'mine');
      await new Promise((r) => setTimeout(r, 3500));
    }
  }
  assert.ok(playingMine);
  assert.equal((await emit(s, 'radio:request', { trackId: 'november-snow' })).ok, true);
  assert.equal((await emit(s, 'chat', { text: '가'.repeat(50) })).ok, true);
  await new Promise((r) => setTimeout(r, 800));
  assert.equal((await emit(s, 'chat', { text: '가'.repeat(51) })).ok, false);
  s.close();
});

test('비공개 소원은 작성자만, 공개 소원 반응은 다른 사람만', async () => {
  const a = await guest(), b = await guest();
  const sa = await sock(a.cookie), sb = await sock(b.cookie);
  await emit(sa, 'join', { place: 'park' }); await emit(sb, 'join', { place: 'park' });
  const star = new Promise((r) => sa.once('star', r));
  await fetch(`${BASE}/api/admin/star`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Key': 'k' }, body: JSON.stringify({ place: 'park' }) });
  const ev = await star;
  const priv = await a.call('/api/wishes/star', { method: 'POST', body: JSON.stringify({ starId: ev.id, text: '비밀 소원', isPublic: false }) });
  assert.equal((await b.call(`/api/wishes/${priv.body.wish.id}`)).status, 404);
  assert.equal((await a.call(`/api/wishes/${priv.body.wish.id}`)).status, 200);
  const pub = await a.call('/api/wishes/star', { method: 'POST', body: JSON.stringify({ starId: ev.id, text: '공개 소원', isPublic: true, alsoTree: true }) });
  assert.equal(pub.body.wish.onTree, true);
  assert.ok((await b.call('/api/wishes/tree')).body.wishes.some((w) => w.text === '공개 소원'));
  assert.equal((await a.call(`/api/wishes/${pub.body.wish.id}/react`, { method: 'POST', body: JSON.stringify({ kind: 'cheer' }) })).status, 400);
  assert.equal((await b.call(`/api/wishes/${pub.body.wish.id}/react`, { method: 'POST', body: JSON.stringify({ kind: 'cheer' }) })).body.wish.cheer, 1);
  // 시연 API는 키 없이는 거부
  assert.equal((await fetch(`${BASE}/api/admin/star`, { method: 'POST' })).status, 403);
  sa.close(); sb.close();
});

test('기억 찾기: 키가 없으면 no_key 상태로 검색 결과만 돌려준다', async () => {
  const a = await guest();
  const r = await a.call('/api/memory/search', { method: 'POST', body: JSON.stringify({ question: '이번 달에 친구랑 웃었던 날이 언제였지?', mode: 'example', today }) });
  assert.equal(r.body.status, 'no_key');
  assert.equal(r.body.candidates[0].id, 'ex-1'); // 검색으로 찾은 기록은 직접 열어볼 수 있음
  // 일반 응답에는 검색어·AI 판단·전송 JSON이 없음
  for (const k of ['trace', 'sentToAi', 'range']) assert.equal(r.body[k], undefined, k);
  // 시연 키가 있으면 검색 과정이 함께 옴
  const demo = await a.call('/api/memory/search', { method: 'POST', headers: { 'X-Admin-Key': 'k' }, body: JSON.stringify({ question: '이번 달에 친구랑 웃었던 날이 언제였지?', mode: 'example', today }) });
  assert.equal(demo.body.trace[0].kind, 'search');
  const wrongKey = await a.call('/api/memory/search', { method: 'POST', headers: { 'X-Admin-Key': 'nope' }, body: JSON.stringify({ question: '웃은 날', mode: 'example', today }) });
  assert.equal(wrongKey.body.trace, undefined);
  const mine = await a.call('/api/memory/search', { method: 'POST', body: JSON.stringify({ question: '웃은 날', mode: 'mine', today }) });
  assert.equal(mine.body.status, 'no_records'); // 기록이 없으면 AI를 부르지 않음
  assert.equal(mine.body.sentToAi, undefined);
});

test('삭제: 내 일기·소원만 지울 수 있고, 일기를 지우면 영상도 열리지 않는다', async () => {
  const a = await guest(), b = await guest();
  const v = await a.call('/api/videos/sample', { method: 'POST', body: JSON.stringify({ sampleId: 'fireworks' }) });
  const saved = await a.call(`/api/diary/day/${today}`, { method: 'PUT', body: JSON.stringify({ sentence: '지울 문장', videoId: v.body.videoId }) });
  const id = saved.body.entry.id;
  // 다른 사람은 지울 수 없음
  assert.equal((await b.call(`/api/diary/entry/${id}`, { method: 'DELETE' })).status, 404);
  assert.equal((await a.call(`/api/diary/month/${today.slice(0, 7)}`)).body.entries.length, 1);
  // 본인은 지울 수 있고, 영상도 사라짐
  assert.equal((await a.call(`/api/diary/entry/${id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await a.call(`/api/diary/month/${today.slice(0, 7)}`)).body.entries.length, 0);
  assert.equal((await fetch(BASE + v.body.url, { headers: { cookie: a.cookie }, redirect: 'manual' })).status, 404);
  assert.deepEqual((await a.call('/api/diary/months')).body.months, []);
  // 같은 날 다시 쓸 수 있음
  const v2 = await a.call('/api/videos/sample', { method: 'POST', body: JSON.stringify({ sampleId: 'rain' }) });
  assert.equal((await a.call(`/api/diary/day/${today}`, { method: 'PUT', body: JSON.stringify({ sentence: '다시 쓴 문장', videoId: v2.body.videoId }) })).body.created, true);

  // 소원: 공원에서 나무에 건 뒤, 다른 사람의 응원이 있어도 작성자는 지울 수 있음
  const sa = await sock(a.cookie);
  await emit(sa, 'join', { place: 'park' });
  const w = (await a.call('/api/wishes/tree', { method: 'POST', body: JSON.stringify({ text: '지울 소원' }) })).body.wish;
  await b.call(`/api/wishes/${w.id}/react`, { method: 'POST', body: JSON.stringify({ kind: 'cheer' }) });
  assert.equal((await b.call(`/api/wishes/${w.id}`, { method: 'DELETE' })).status, 404);
  assert.equal((await a.call(`/api/wishes/${w.id}`, { method: 'DELETE' })).status, 200);
  assert.ok(!(await b.call('/api/wishes/tree')).body.wishes.some((x) => x.id === w.id));
  assert.equal((await b.call(`/api/wishes/${w.id}`)).status, 404);
  sa.close();
});

test('닉네임: 현재 게스트 이름만 바뀌고 일기는 그대로, 옥상의 다른 사람에게 반영', async () => {
  // 첫 방문자가 입장 전에 고른 닉네임으로 계정 생성
  const res = await fetch(`${BASE}/api/guest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nickname: '  새벽 산책자  ' }) });
  assert.equal((await res.json()).user.nickname, '새벽 산책자');
  const a = await guest(), b = await guest();
  const v = await a.call('/api/videos/sample', { method: 'POST', body: JSON.stringify({ sampleId: 'sunset' }) });
  await a.call(`/api/diary/day/${today}`, { method: 'PUT', body: JSON.stringify({ sentence: '이름이 바뀌어도 남는 일기', videoId: v.body.videoId }) });
  const sa = await sock(a.cookie), sb = await sock(b.cookie);
  await emit(sa, 'join', { place: 'rooftop' });
  const joined = await emit(sb, 'join', { place: 'rooftop' });
  const renamed = new Promise((r) => sb.once('player:rename', r));
  const r = await a.call('/api/me', { method: 'PATCH', body: JSON.stringify({ nickname: '아주아주긴닉네임열두글자' }) });
  assert.equal(r.status, 200);
  const ev = await renamed;
  assert.equal(ev.nickname, '아주아주긴닉네임열두글자');
  assert.ok(joined.players.some((p) => p.sid === ev.sid));
  assert.equal((await a.call('/api/me')).body.user.nickname, '아주아주긴닉네임열두글자');
  assert.equal((await a.call(`/api/diary/month/${today.slice(0, 7)}`)).body.entries[0].sentence, '이름이 바뀌어도 남는 일기');
  // 다른 사람 이름은 그대로, 잘못된 이름은 거절
  assert.notEqual((await b.call('/api/me')).body.user.nickname, '아주아주긴닉네임열두글자');
  assert.equal((await a.call('/api/me', { method: 'PATCH', body: JSON.stringify({ nickname: '열세글자가넘는아주긴닉네임' }) })).status, 400);
  assert.equal((await a.call('/api/me', { method: 'PATCH', body: JSON.stringify({ nickname: '   ' }) })).status, 400);
  assert.equal((await a.call('/api/me', { method: 'PATCH', body: JSON.stringify({ nickname: '<b>x</b>' }) })).status, 400);
  assert.equal((await fetch(`${BASE}/api/me`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{"nickname":"x"}' })).status, 401);
  sa.close(); sb.close();
});
