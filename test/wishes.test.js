// 소원 나무: 7일 동안 공개, 나뭇가지에는 만료되지 않은 최근 25개, 모아보기는 최근 7일 전체
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io as ioc } from 'socket.io-client';

const PORT = 4300 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'haru-wish-'));
let proc;
before(async () => {
  proc = spawn(process.execPath, ['--no-warnings=ExperimentalWarning', 'server/index.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, ADMIN_KEY: '', OPENROUTER_API_KEY: '', DATABASE_URL: '', SUPABASE_URL: '' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`${BASE}/healthz`)).ok) return; } catch { /* */ } await new Promise((r) => setTimeout(r, 100)); }
  throw new Error('server did not start');
});
after(() => { proc?.kill(); fs.rmSync(dataDir, { recursive: true, force: true }); });

async function guest() {
  const r = await fetch(`${BASE}/api/guest`, { method: 'POST' });
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const call = async (p, opts = {}) => { const x = await fetch(BASE + p, { ...opts, headers: { cookie, 'Content-Type': 'application/json' } }); return { status: x.status, body: await x.json().catch(() => null) }; };
  const s = await new Promise((res) => { const so = ioc(BASE, { extraHeaders: { cookie }, transports: ['websocket'] }); so.on('connect', () => res(so)); });
  await new Promise((res) => s.emit('join', { place: 'park' }, res));
  return { call, s };
}

test('소원 나무: 7일 공개, 나무엔 최근 25개(26번째는 가장 오래된 쪽지 자리), 모아보기는 내려간 쪽지 포함', async () => {
  const a = await guest(), b = await guest();
  const ids = [];
  for (let i = 1; i <= 28; i++) {
    const r = await a.call('/api/wishes/tree', { method: 'POST', body: JSON.stringify({ text: `소원 ${i}` }) });
    assert.equal(r.status, 200);
    ids.push(r.body.wish.id);
    assert.equal(r.body.wish.treeSeq, i);
  }
  // 가장 오래된 2개를 8일 전으로 (만료)
  const { DatabaseSync } = await import('node:sqlite');
  const d = new DatabaseSync(path.join(dataDir, 'haru.sqlite'));
  const old = new Date(Date.now() - 8 * 24 * 3600_000).toISOString();
  d.prepare("UPDATE wishes SET created_at = ? WHERE text IN ('소원 1', '소원 2')").run(old);
  d.close();

  const tree = (await b.call('/api/wishes/tree')).body;
  assert.equal(tree.wishes.length, 25);
  assert.equal(tree.total, 26); // 만료되지 않은 공개 나무 소원
  assert.deepEqual(tree.wishes.map((w) => w.text).slice(0, 2), ['소원 28', '소원 27']);
  assert.ok(!tree.wishes.some((w) => w.text === '소원 3')); // 26번째로 오래된 것은 나무에서 내려감
  // 쪽지 자리: 26번째(28)는 3번 소원 자리(=(28-1)%25 = 2)
  assert.equal((tree.wishes[0].treeSeq - 1) % 25, (3 - 1) % 25);

  const all = (await b.call('/api/wishes/tree/all')).body.wishes;
  assert.equal(all.length, 26); // 내려간 쪽지(소원 3)까지, 만료된 1·2는 제외
  assert.ok(all.find((w) => w.text === '소원 3' && !w.onBranch));
  assert.ok(all.find((w) => w.text === '소원 28' && w.onBranch));
  assert.ok(all.every((w) => Date.parse(w.expiresAt) > Date.now()));

  // 내려간 쪽지에도 응원 가능, 만료된 소원은 불가
  const s3 = all.find((w) => w.text === '소원 3');
  assert.equal((await b.call(`/api/wishes/${s3.id}/react`, { method: 'POST', body: JSON.stringify({ kind: 'cheer' }) })).status, 200);
  assert.equal((await b.call(`/api/wishes/${ids[0]}/react`, { method: 'POST', body: JSON.stringify({ kind: 'cheer' }) })).status, 410);
  assert.equal((await b.call(`/api/wishes/${ids[0]}`)).status, 404);
  // 작성자는 '내 소원'에서 계속 볼 수 있음 (내려갔다는 표시와 함께)
  const mine = (await a.call('/api/wishes/mine')).body.wishes;
  assert.ok(mine.find((w) => w.text === '소원 1' && w.expired));
  a.s.close(); b.s.close();
});
