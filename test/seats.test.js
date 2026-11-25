// 벤치 좌석: 옥상 벤치 2개 × 4자리, 공원 벤치 1개 × 4자리. 네 번째 자리까지 앉고, 모든 화면에 같은 자리, 일어나면 다른 사람이 앉음
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io as ioc } from 'socket.io-client';
import { PLACES } from '../public/js/shared/places.js';

const PORT = 4400 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'haru-seat-'));
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

const emit = (s, ev, d) => new Promise((r) => s.emit(ev, d, r));
async function person(place) {
  const res = await fetch(`${BASE}/api/guest`, { method: 'POST' });
  const cookie = res.headers.get('set-cookie').split(';')[0];
  const s = await new Promise((r) => { const so = ioc(BASE, { extraHeaders: { cookie }, transports: ['websocket'], forceNew: true }); so.on('connect', () => r(so)); });
  s.seats = new Map(); // 이 사람 화면에서 본 각 사람의 자리
  s.on('player:move', (m) => s.seats.set(m.sid, m.seat));
  const j = await emit(s, 'join', { place });
  j.players.forEach((p) => s.seats.set(p.sid, p.seat));
  s.on('player:join', (p) => s.seats.set(p.sid, p.seat));
  s.sid = j.you;
  return s;
}

test('좌석 배치: 벤치마다 4자리가 좌판 안에 고르게, 서로 겹치지 않음', () => {
  const benches = { rooftop: [['A1', 'A2', 'A3', 'A4'], ['B1', 'B2', 'B3', 'B4']], park: [['P1', 'P2', 'P3', 'P4']] };
  for (const [place, groups] of Object.entries(benches)) {
    assert.equal(Object.keys(PLACES[place].seats).length, groups.flat().length);
    for (const g of groups) {
      const xs = g.map((id) => PLACES[place].seats[id].x);
      const gaps = xs.slice(1).map((x, i) => x - xs[i]);
      assert.ok(gaps.every((d) => d === gaps[0]), `${place} 간격이 고름`);
      assert.ok(gaps[0] >= 12, `${place} 아바타 폭(10)보다 넓은 간격`);
    }
  }
});

for (const [place, ids] of [['rooftop', ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4']], ['park', ['P1', 'P2', 'P3', 'P4']]]) {
  test(`${place}: ${ids.length}명이 모든 자리(네 번째 자리 포함)에 앉고, 모든 화면에 같은 자리, 일어난 자리에 다른 사람`, async () => {
    const people = [];
    for (const id of ids) {
      const s = await person(place);
      const r = await emit(s, 'sit', { seat: id });
      assert.equal(r.ok, true, `${id} 앉기`);
      people.push(s);
    }
    await new Promise((r) => setTimeout(r, 300));
    for (const viewer of people) for (const [i, p] of people.entries()) assert.equal(viewer.seats.get(p.sid), ids[i], `${ids[i]}가 모든 화면에 같은 자리`);
    // 자리가 다 찼으면 더 앉을 수 없음
    const extra = await person(place);
    assert.equal((await emit(extra, 'sit', { seat: ids[3] })).ok, false);
    // 네 번째 자리 사람이 일어나면(다른 곳으로 걸어감) 새 사람이 그 자리에 앉음
    await emit(people[3], 'move', { x: 100, y: 170 });
    await new Promise((r) => setTimeout(r, 100));
    assert.equal((await emit(extra, 'sit', { seat: ids[3] })).ok, true);
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(people[0].seats.get(extra.sid), ids[3]);
    [...people, extra].forEach((s) => s.close());
  });
}
