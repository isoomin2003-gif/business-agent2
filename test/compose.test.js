// 오늘의 단어로 작곡하기: 악보 검사·길이·합성, 거절, 미리 듣기 권한, 신청 → 라디오 재생 정보
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io as ioc } from 'socket.io-client';
import { normalizeScore, render, toWav, plan, SAMPLE_RATE, MIN_SEC, MAX_SEC } from '../server/synth.js';
import { startMockOpenRouter, composeTurn } from './mock-openrouter.js';

let orr;
before(async () => { orr = await startMockOpenRouter(); });
after(() => orr.close());

const scoreOf = (text) => JSON.parse(composeTurn(text).replace(/^[^{]*/, ''));

test('악보 정리: 구간마다 정확히 4마디, 잘못된 값은 기본값', () => {
  const s = normalizeScore({ ...scoreOf('잔잔'), bpm: 999, key: 'H', lead: 'violin', sections: { A: { chords: [9, 'x'], melody: [[3, 100], [20, 2]] } } });
  assert.equal(s.bpm, 140); assert.equal(s.key, 'C'); assert.equal(s.lead, 'square');
  assert.deepEqual(s.sections.A.chords, [7, 1, 1, 1]);
  assert.equal(s.sections.A.melody.reduce((a, [, l]) => a + l, 0), 64);
  assert.throws(() => normalizeScore({ sections: { A: { melody: [[0, 64]] } } }));
});

test('길이: 빠르기와 상관없이 30초~1분, 실제 샘플 길이와 일치', () => {
  for (const bpm of [60, 76, 100, 120, 140]) {
    const s = normalizeScore({ ...scoreOf('잔잔'), bpm });
    const sec = render(s).length / SAMPLE_RATE;
    assert.ok(sec >= MIN_SEC && sec <= MAX_SEC, `${bpm}bpm → ${sec}s`);
    assert.ok(Math.abs(sec - plan(s).seconds) < 0.01);
  }
  const wav = toWav(render(normalizeScore(scoreOf('신나는'))));
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.readUInt32LE(24), SAMPLE_RATE);
});

test('작곡 → 나만 미리 듣기 → 신청 → 라디오 재생 정보', async () => {
  const PORT = 4150 + Math.floor(Math.random() * 50);
  const BASE = `http://127.0.0.1:${PORT}`;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'haru-comp-'));
  const log = path.join(dataDir, 'or.log');
  const orr2 = await startMockOpenRouter(0, log);
  const proc = spawn(process.execPath, ['--no-warnings=ExperimentalWarning', 'server/index.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, DATABASE_URL: '', SUPABASE_URL: '', OPENROUTER_API_KEY: 'k', OPENROUTER_BASE_URL: `${orr2.url}/api/v1`, ADMIN_KEY: '' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  try {
    for (let i = 0; i < 80; i++) { try { if ((await fetch(`${BASE}/healthz`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 100)); }
    const guest = async (nickname) => (await fetch(`${BASE}/api/guest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nickname }) })).headers.get('set-cookie').split(';')[0];
    const post = (cookie, text) => fetch(`${BASE}/api/compose`, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }).then((r) => r.json());
    const [ca, cb] = [await guest('작곡러'), await guest('듣는이')];
    assert.equal((await (await fetch(`${BASE}/api/radio/tracks`)).json()).features.compose, true);

    // 거절: 특정 곡 따라 하기 (서버 규칙 / AI 판단 둘 다)
    assert.equal((await post(ca, '아이유 좋은 날 멜로디 그대로 만들어줘')).status, 'refused');
    assert.equal((await post(ca, '거절해야 하는 요청')).status, 'refused');
    // 형식이 깨진 답이 계속되면 실패 상태 (다시 시도 가능)
    assert.equal((await post(ca, '엉망인 답')).status, 'bad_score');

    const r = await post(ca, '첫눈 오는 골목, 따뜻한 코코아');
    assert.equal(r.status, 'ok');
    const d = r.draft;
    assert.ok(d.durationSec >= 30 && d.durationSec <= 60);
    // AI에게는 사용자의 문장만 (닉네임 등 없음)
    const sent = fs.readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((x) => /AI 작곡가/.test(x.body.messages[0].content));
    assert.ok(sent.length >= 1);
    for (const x of sent) { const u = x.body.messages.filter((m) => m.role === 'user'); assert.equal(u.length, 1); assert.ok(!JSON.stringify(x.body).includes('작곡러')); }
    assert.ok(sent.some((x) => x.body.messages[1].content === '첫눈 오는 골목, 따뜻한 코코아'));

    // 미리 듣기: 만든 사람만
    const mine = await fetch(`${BASE}${d.previewUrl}`, { headers: { cookie: ca, Range: 'bytes=0-99' } });
    assert.equal(mine.status, 206); assert.match(mine.headers.get('content-type'), /audio\/wav/);
    assert.equal((await fetch(`${BASE}${d.previewUrl}`, { headers: { cookie: cb } })).status, 404);
    assert.equal((await fetch(`${BASE}/api/radio/audio/${d.id}`)).status, 404); // 신청 전에는 공개 주소 없음

    const sock = (cookie) => new Promise((res) => { const s = ioc(BASE, { extraHeaders: { cookie }, transports: ['websocket'] }); s.on('connect', () => res(s)); });
    const emit = (s, ev, data) => new Promise((res) => s.emit(ev, data, res));
    const [a, b] = [await sock(ca), await sock(cb)];
    await emit(a, 'join', { place: 'rooftop' }); await emit(b, 'join', { place: 'rooftop' });
    assert.equal((await emit(b, 'radio:request', { trackId: d.id })).ok, false); // 남이 만든 곡은 신청 불가
    const ok = await emit(a, 'radio:request', { trackId: d.id });
    assert.equal(ok.ok, true);
    const info = await (await fetch(`${BASE}/api/radio/tracks`)).json();
    const t = info.added.find((x) => x.id === d.id);
    assert.equal(t.kind, 'generated'); assert.equal(t.file, `/api/radio/audio/${d.id}`);
    assert.ok(!t.attribution.includes('코코아')); // 공개 정보에 사용자가 쓴 문장을 그대로 싣지 않음
    const pub = await fetch(`${BASE}${t.file}`, { headers: { Range: 'bytes=0-99' } });
    assert.equal(pub.status, 206); // 신청 후에는 누구나 재생
    // 기본 방송이 끝나면 신청곡으로
    const st = await (await fetch(`${BASE}/api/radio/tracks`)).json();
    assert.ok(st.added.length === 1);
    a.close(); b.close();
  } finally { proc.kill(); orr2.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
});
