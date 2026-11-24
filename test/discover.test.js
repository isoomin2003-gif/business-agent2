// 새 노래 추천받기: Openverse·OpenRouter 모의 서버로 검색 → 선택 → 재생 확인 → 신청까지
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io as ioc } from 'socket.io-client';
import { startMockOpenverse } from './mock-openverse.js';
import { startMockOpenRouter } from './mock-openrouter.js';

let ov, orr, discover, config;
before(async () => {
  ov = await startMockOpenverse();
  orr = await startMockOpenRouter();
  process.env.OPENVERSE_BASE_URL = ov.url;
  ({ discover } = await import('../server/discover.js'));
  ({ config } = await import('../server/config.js'));
  config.openrouter.apiKey = 'k'; config.openrouter.baseUrl = `${orr.url}/api/v1`;
});
after(() => { ov.close(); orr.close(); });

test('추천: 조건에 맞고 실제 재생되는 서로 다른 곡 최대 3개, 지어낸 id는 버림', async () => {
  const r = await discover('비 오는 밤에 어울리는 잔잔한 기타곡', new Set());
  assert.equal(r.status, 'ok');
  assert.ok(r.picks.length >= 1 && r.picks.length <= 3);
  const ids = r.picks.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  // 기본 설정: CC0·퍼블릭 도메인만 (CC BY 'g1', CC BY-SA 'g3'도 제외)
  for (const bad of ['ov:made-up', 'ov:nc1', 'ov:short', 'ov:dead', 'ov:base', 'ov:g1dup', 'ov:g1', 'ov:g3']) assert.ok(!ids.includes(bad), bad);
  for (const p of r.picks) { assert.ok(['cc0', 'pdm'].includes(p.license)); assert.ok(p.reason); }
});

test('다른 곡 보기: 이번에 보여 준 곡과 라디오에 있는 곡은 제외', async () => {
  const first = await discover('비 오는 밤 기타', new Set());
  const exclude = new Set(first.picks.map((p) => p.id));
  const second = await discover('비 오는 밤 기타', exclude);
  assert.ok(second.picks.every((p) => !exclude.has(p.id)));
});

test('AI 답 읽기: 설명·코드 블록이 붙거나 끊긴 답에서도 완성된 항목만 살림', async () => {
  const { parsePicks } = await import('../server/discover.js');
  assert.deepEqual(parsePicks('{"picks":[{"id":"ov:a","reason":"좋아요"}]}'), [{ id: 'ov:a', reason: '좋아요' }]);
  const cut = parsePicks('설명\n```json\n{"picks":[{"id":"ov:a","reason":"하나"},{"id":"ov:b","reason":"둘"},{"id":"ov:c","reason":"끊');
  assert.deepEqual(cut.map((p) => p.id), ['ov:a', 'ov:b']);
  assert.deepEqual(parsePicks('잘 모르겠어요'), []);
});

test('AI가 형식 없이 설명만 하면 한 번 더 물어 곡을 받음', async () => {
  const r = await discover('설명만 하는 비 오는 밤 기타', new Set());
  assert.equal(r.status, 'ok');
  assert.ok(r.picks.length >= 1);
});

test('찾지 못하면 none, 검색 실패·키 없음은 상태로 알림', async () => {
  assert.equal((await discover('없는 장르 zzz', new Set())).status, 'none');
  config.openrouter.apiKey = '';
  assert.equal((await discover('기타', new Set())).status, 'no_key');
  config.openrouter.apiKey = 'k';
});

test('신청: 추천받은 곡만, 두 사람이 같은 곡을 동시에 신청하면 한 번만 등록', async () => {
  const PORT = 4100 + Math.floor(Math.random() * 50);
  const BASE = `http://127.0.0.1:${PORT}`;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'haru-disc-'));
  const proc = spawn(process.execPath, ['--no-warnings=ExperimentalWarning', 'server/index.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, DATABASE_URL: '', SUPABASE_URL: '', OPENVERSE_BASE_URL: ov.url, OPENROUTER_API_KEY: 'k', OPENROUTER_BASE_URL: `${orr.url}/api/v1`, ADMIN_KEY: '' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  try {
    for (let i = 0; i < 80; i++) { try { if ((await fetch(`${BASE}/healthz`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 100)); }
    const guest = async () => (await fetch(`${BASE}/api/guest`, { method: 'POST' })).headers.get('set-cookie').split(';')[0];
    const sock = (cookie) => new Promise((r) => { const s = ioc(BASE, { extraHeaders: { cookie }, transports: ['websocket'] }); s.on('connect', () => r(s)); });
    const emit = (s, ev, d) => new Promise((r) => s.emit(ev, d, r));
    const [ca, cb] = [await guest(), await guest()];
    const [a, b] = [await sock(ca), await sock(cb)];
    await emit(a, 'join', { place: 'rooftop' }); await emit(b, 'join', { place: 'rooftop' });
    // 추천받지 않은 임의 id는 신청 불가
    assert.equal((await emit(a, 'radio:request', { trackId: 'ov:g2' })).ok, false);
    const ra = await emit(a, 'radio:discover', { text: '비 오는 밤 기타' });
    const rb = await emit(b, 'radio:discover', { text: '비 오는 밤 기타' });
    assert.equal(ra.status, 'ok');
    assert.equal(ra.trace, undefined); // 시연 키 없으면 과정 정보 없음
    const common = ra.picks.map((p) => p.id).find((id) => rb.picks.some((p) => p.id === id));
    assert.ok(common);
    const before = (await (await fetch(`${BASE}/api/radio/tracks`)).json()).added.length;
    const [x, y] = await Promise.all([emit(a, 'radio:request', { trackId: common }), emit(b, 'radio:request', { trackId: common })]);
    assert.equal([x, y].filter((r) => r.ok).length, 1);
    assert.equal([x, y].find((r) => !r.ok).code, 'already');
    const info = await (await fetch(`${BASE}/api/radio/tracks`)).json();
    assert.equal(info.added.length, before + 1);
    assert.ok(info.added[0].attribution && info.added[0].license);
    // 이미 라디오에 추가된 곡은 다시 추천하지 않음
    const again = await emit(b, 'radio:discover', { text: '비 오는 밤 기타' });
    assert.ok(again.picks.every((p) => p.id !== common));
    a.close(); b.close();
  } finally { proc.kill(); fs.rmSync(dataDir, { recursive: true, force: true }); }
});
