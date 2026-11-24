// Render 무료 플랜의 재시작을 흉내 냅니다: 서버를 끄고 '빈 로컬 디스크(DATA_DIR)'로 다시 켜도
// PostgreSQL + Supabase Storage에 있는 게스트·일기·영상·공개 소원이 그대로 남는지 확인.
// 실행: TEST_DATABASE_URL=postgres://... npm test   (없으면 건너뜀)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io as ioc } from 'socket.io-client';
import { startMockStorage } from './mock-supabase-storage.js';

const PG = process.env.TEST_DATABASE_URL || '';

async function startServer(port, env) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'haru-ephemeral-'));
  const proc = spawn(process.execPath, ['--no-warnings=ExperimentalWarning', 'server/index.js'], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, OPENROUTER_API_KEY: '', ADMIN_KEY: '', ...env }, stdio: ['ignore', 'ignore', 'inherit'],
  });
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) break; } catch { /* 기동 중 */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  return { stop: async () => { proc.kill(); await new Promise((r) => proc.once('exit', r)); fs.rmSync(dataDir, { recursive: true, force: true }); } };
}

test('재시작(로컬 디스크 초기화) 후에도 기록이 남는다', { skip: !PG && 'TEST_DATABASE_URL 없음' }, async () => {
  const storage = await startMockStorage();
  const env = { DATABASE_URL: PG, SUPABASE_URL: storage.url, SUPABASE_SECRET_KEY: storage.secret };
  const port = 3990 + Math.floor(Math.random() * 9);
  const BASE = `http://127.0.0.1:${port}`;
  const today = new Date().toISOString().slice(0, 10);

  let srv = await startServer(port, env);
  const g = await fetch(`${BASE}/api/guest`, { method: 'POST' });
  const cookie = g.headers.get('set-cookie').split(';')[0];
  const call = async (p, opts = {}) => (await fetch(BASE + p, { ...opts, headers: { cookie, 'Content-Type': 'application/json' } })).json();
  const v = await call('/api/videos/sample', { method: 'POST', body: JSON.stringify({ sampleId: 'rain' }) });
  await call(`/api/diary/day/${today}`, { method: 'PUT', body: JSON.stringify({ sentence: '재시작 뒤에도 남아야 하는 문장', videoId: v.videoId }) });
  // 공개 소원은 공원에 있어야 걸 수 있음
  const s = await new Promise((r) => { const so = ioc(BASE, { extraHeaders: { cookie }, transports: ['websocket'] }); so.on('connect', () => r(so)); });
  await new Promise((r) => s.emit('join', { place: 'park' }, r));
  await call('/api/wishes/tree', { method: 'POST', body: JSON.stringify({ text: '재시작 뒤에도 남는 소원' }) });
  s.close();
  await srv.stop();

  // 같은 쿠키로, 새 빈 디스크의 서버에 다시 접속
  srv = await startServer(port, env);
  try {
    const me = await call('/api/me');
    assert.ok(me.user, '게스트 계정이 남아 있어야 함');
    const month = await call(`/api/diary/month/${today.slice(0, 7)}`);
    assert.equal(month.entries[0].sentence, '재시작 뒤에도 남아야 하는 문장');
    const vid = await fetch(BASE + month.entries[0].videoUrl, { headers: { cookie, Range: 'bytes=0-99' } });
    assert.equal(vid.status, 206, '영상이 Range 재생 가능해야 함');
    assert.equal((await vid.arrayBuffer()).byteLength, 100);
    const tree = await call('/api/wishes/tree');
    assert.ok(tree.wishes.some((w) => w.text === '재시작 뒤에도 남는 소원'));
    // 버킷은 비공개여야 함
    assert.equal([...storage.buckets.values()][0].public, false);
  } finally {
    await srv.stop();
    storage.close();
  }
});
