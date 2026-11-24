// 실제 서버를 임시 데이터 폴더로 띄워 개인정보 격리·좌석 선점·라디오 신청 규칙을 확인합니다.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io as ioc } from 'socket.io-client';

const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'haru-test-'));
let proc;

before(async () => {
  proc = spawn(process.execPath, ['--no-warnings=ExperimentalWarning', 'server/index.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, ADMIN_KEY: 'k', OPENROUTER_API_KEY: '' }, stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${BASE}/healthz`)).ok) return; } catch { /* 기동 중 */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
});
after(() => { proc?.kill(); fs.rmSync(dataDir, { recursive: true, force: true }); });

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

test('라디오: 등록된 곡만, 한 사람당 대기 1곡, 채팅 50자 제한', async () => {
  const a = await guest();
  const s = await sock(a.cookie);
  assert.equal((await emit(s, 'radio:request', { trackId: 'lofi-again' })).ok, false); // 옥상 밖
  await emit(s, 'join', { place: 'rooftop' });
  assert.equal((await emit(s, 'radio:request', { trackId: 'https://example.com/a.mp3' })).ok, false);
  assert.equal((await emit(s, 'radio:request', { trackId: 'lofi-again' })).ok, true);
  assert.equal((await emit(s, 'radio:request', { trackId: 'november-snow' })).ok, false);
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
  assert.equal(r.body.sources[0].id, 'ex-1');
  const none = await a.call('/api/memory/search', { method: 'POST', body: JSON.stringify({ question: '바다에 놀러 간 날', mode: 'example', today }) });
  assert.equal(none.body.status, 'no_results');
  assert.equal(none.body.sentToAi, null);
});
