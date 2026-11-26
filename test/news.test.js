// AI와 나누는 짧은 대화 + 나만의 주간신문: 주차(한국 시간 일~토), 하루 질문 수, 건너뛰기, 일요일 18시 발행, 빠진 호 복구, 월별 배치
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startMockOpenRouter } from './mock-openrouter.js';
import { startMockWiki } from './mock-wiki.js';
import { weekStartOf, issueDateOf, publishAtOf, kstDate } from '../server/kst.js';

const PORT = 4500 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'haru-news-'));
const orLog = path.join(dataDir, 'or.log');
let proc, orr, wiki;

before(async () => {
  orr = await startMockOpenRouter(0, orLog);
  wiki = await startMockWiki();
  proc = spawn(process.execPath, ['--no-warnings=ExperimentalWarning', 'server/index.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, ADMIN_KEY: '', DATABASE_URL: '', SUPABASE_URL: '', OPENROUTER_API_KEY: 'k', OPENROUTER_BASE_URL: `${orr.url}/api/v1`, WIKI_API_KO: wiki.url, WIKI_API_EN: wiki.url, ALLOW_TEST_CLOCK: '1' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`${BASE}/healthz`)).ok) return; } catch { /* */ } await new Promise((r) => setTimeout(r, 100)); }
  throw new Error('server did not start');
});
after(() => { proc?.kill(); orr?.close(); wiki?.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

const clock = (at) => fetch(`${BASE}/api/test/clock`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ at }) });
async function guest(nickname) {
  const r = await fetch(`${BASE}/api/guest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nickname ? { nickname } : {}) });
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const call = async (p, method = 'GET', body) => { const x = await fetch(BASE + p, { method, headers: { cookie, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: x.status, body: await x.json() }; };
  return { call, today: () => call('/api/chat/today'), answer: (text) => call('/api/chat/answer', 'POST', { text }), more: () => call('/api/chat/more', 'POST'), skip: () => call('/api/chat/skip', 'POST'), news: () => call('/api/news?wait=20000') };
}
/** 그 시각(KST)에 대화 한 번: 질문 받고 답하기 */
async function talk(g, kst, answer) { await clock(`${kst}+09:00`); const q = await g.today(); assert.equal(q.body.status, 'ask'); return g.answer(answer); }

test('주차 계산: 한국 시간 일요일 0시 경계, 발행일과 월호', () => {
  assert.equal(weekStartOf(Date.parse('2026-11-28T23:59:00+09:00')), '2026-11-22'); // 토요일 밤
  assert.equal(weekStartOf(Date.parse('2026-11-29T00:00:00+09:00')), '2026-11-29'); // 일요일 0시 = 새 주
  assert.equal(weekStartOf(Date.parse('2026-11-29T17:59:00+09:00')), '2026-11-29'); // 일요일 18시 전 대화도 새 주(다음 호)
  assert.equal(kstDate(Date.parse('2026-11-28T15:30:00Z')), '2026-11-29'); // UTC 토요일 오후 = KST 일요일
  assert.equal(issueDateOf('2026-11-22'), '2026-11-29');
  assert.equal(new Date(publishAtOf('2026-11-22')).toISOString(), '2026-11-29T09:00:00.000Z'); // 일요일 18:00 KST
  assert.equal(issueDateOf('2024-11-24'), '2024-12-01'); // 토요일 11월 30일 → 다음 날 12월 1일 발행 = 12월호
});

test('대화: 그 주 첫 질문, 하루 최대 2개, 같은 날 다시 와도 상태 유지, 다음 질문은 내 말에서 이어짐', async () => {
  const a = await guest('하늘');
  await clock('2026-11-25T20:00:00+09:00'); // 수요일 처음 방문 → 수요일에 그 주 첫 질문
  const q1 = (await a.today()).body;
  assert.equal(q1.status, 'ask'); assert.equal(q1.weekStart, '2026-11-22'); assert.ok(q1.turns[0].greeting); assert.equal(q1.turns.length, 1);
  assert.equal((await a.more()).status, 409); // 답하기 전엔 두 번째 질문 없음
  const r1 = (await a.answer('할머니 집에서 듣던 옛날 노래가 생각나')).body;
  assert.equal(r1.status, 'answered');
  // 새로고침·책상 다시 누르기: 같은 질문과 답 그대로, 새 질문 생기지 않음
  const again = (await a.today()).body;
  assert.deepEqual(again.turns.map((t) => [t.seq, t.question, t.answer]), r1.turns.map((t) => [t.seq, t.question, t.answer]));
  const q2 = (await a.more()).body;
  assert.equal(q2.status, 'ask'); assert.equal(q2.turns.length, 2); assert.equal(q2.turns[1].greeting, '');
  assert.match(q2.turns[1].question, /할머니 집에서/); // 내가 한 말에서 이어지는 질문
  assert.equal((await a.answer('밤에 호수에 비친 불빛을 찍었는데 사진에서는 다 번졌어')).body.status, 'done');
  assert.equal((await a.more()).status, 409); // 하루 최대 2개
  assert.equal((await a.today()).body.turns.length, 2);
  // 다음 날: 그 주의 대화에서 이어짐 (새 주제를 만들지 않음)
  await clock('2026-11-26T09:00:00+09:00');
  const next = (await a.today()).body;
  assert.match(next.turns[0].question, /밤에 호수에 비|할머니/);
});

test('오늘은 바로 쓰기: 건너뛰면 다시 와도 바로 다이어리, 그 주를 모두 건너뛰면 기사 없음', async () => {
  const b = await guest();
  await clock('2026-11-24T21:00:00+09:00');
  assert.equal((await b.today()).body.status, 'ask');
  assert.equal((await b.skip()).body.status, 'done');
  assert.equal((await b.today()).body.status, 'done');
  assert.equal((await b.answer('늦은 답')).status, 409);
  await clock('2026-11-29T18:00:00+09:00');
  assert.equal((await b.news()).body.total, 0);
});

test('토요일 밤과 일요일 아침 대화는 다른 주, 새 주의 첫 질문은 지난 주제와 다른 주제', async () => {
  const c = await guest();
  await talk(c, '2026-11-28T23:50:00', '밤에 호수에 비친 불빛을 찍었는데 사진에서는 다 번졌어');
  await clock('2026-11-29T08:00:00+09:00');
  const sun = (await c.today()).body;
  assert.equal(sun.weekStart, '2026-11-29');
  const firsts = fs.readFileSync(orLog, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((x) => /^\[대화-첫질문\]/.test(x.body.messages?.[0]?.content || ''));
  const lastCall = firsts.at(-1).body.messages[1].content;
  assert.match(lastCall, /최근 주제와 질문:\n- /); // 지난주 주제를 참고해서
  assert.equal(firsts.length >= 2, true); // 일요일 아침에 새 주의 첫 질문을 새로 만듦
});

test('발행: 일요일 17:59에는 안 보이고 18:00부터 보임, 출처·이유 포함, 다른 사람은 볼 수 없음, 검색어에 개인 정보 없음', async () => {
  const d = await guest('비밀닉네임');
  await talk(d, '2026-11-23T21:00:00', '밤에 호수에 비친 불빛을 찍었는데 사진에서는 다 번졌어');
  await clock('2026-11-29T17:59:00+09:00');
  assert.equal((await d.news()).body.total, 0);
  await clock('2026-11-29T18:00:00+09:00');
  const n = (await d.news()).body;
  assert.equal(n.total, 1);
  const art = n.months[11][0];
  assert.equal(art.issueDate, '2026-11-29'); assert.equal(art.year, 2026);
  assert.ok(art.title && art.body && art.reason);
  assert.ok(art.sources.length >= 1 && art.sources.every((s) => /^https:\/\/(ko|en)\.wikipedia\.org\/wiki\//.test(s.url)));
  const e = await guest();
  assert.equal((await e.news()).body.total, 0);
  assert.ok(wiki.queries.length && wiki.queries.every((q) => !q.includes('비밀닉네임') && !q.includes('호수에 비친 불빛을 찍었는데')));
});

test('발행 시각에 접속하지 않은 사용자: 나중에 처음 들어왔을 때 읽을 수 있고, 여러 번 들어와도 한 번만 생김', async () => {
  const f = await guest();
  await talk(f, '2026-11-24T10:00:00', '할머니 집에서 듣던 옛날 노래가 생각나');
  await clock('2026-12-03T12:00:00+09:00'); // 발행 시각(11/29 18시)이 한참 지나서 처음 접속
  const [x, y] = await Promise.all([f.news(), f.news()]);
  assert.equal(x.body.total, 1); assert.equal(y.body.total, 1);
  await fetch(`${BASE}/api/test/catch-up`, { method: 'POST' });
  assert.equal((await f.news()).body.total, 1);
  assert.equal((await f.news()).body.months[11].length, 1);
});

test('관심사가 모호하거나 출처가 없으면 그 주는 건너뜀', async () => {
  const g = await guest();
  await talk(g, '2026-11-25T10:00:00', '그냥 산책했어');
  const h = await guest();
  await talk(h, '2026-11-25T10:00:00', '출처없음 이야기');
  await clock('2026-11-29T18:00:00+09:00');
  assert.equal((await g.news()).body.total, 0);
  assert.equal((await h.news()).body.total, 0);
});

test('월호 배치: 다섯 번째 일요일, 월말(11/29 주 → 12월호), 여러 해의 같은 달은 같은 칸', async () => {
  const m = await guest();
  // 2026년 11월 일요일: 1, 8, 15, 22, 29 → 다섯 호 모두 11월
  for (const wed of ['2026-10-28', '2026-11-04', '2026-11-11', '2026-11-18', '2026-11-25']) await talk(m, `${wed}T20:00:00`, '밤에 호수에 비친 불빛을 찍었는데 사진에서는 다 번졌어');
  await talk(m, '2026-12-02T20:00:00', '밤에 호수에 비친 불빛을 찍었는데 사진에서는 다 번졌어'); // 11/29 주 → 12/6 발행 = 12월호
  await talk(m, '2025-11-12T20:00:00', '할머니 집에서 듣던 옛날 노래가 생각나'); // 2025년 11월 16일 발행
  await clock('2026-11-29T18:00:00+09:00');
  let n = (await m.news()).body;
  assert.deepEqual(n.months[11].map((a) => a.issueDate), ['2026-11-29', '2026-11-22', '2026-11-15', '2026-11-08', '2026-11-01', '2025-11-16']);
  assert.equal(n.months[12].length, 0); // 12월 6일 18시 전
  await clock('2026-12-06T18:00:00+09:00');
  n = (await m.news()).body;
  assert.deepEqual(n.months[12].map((a) => a.issueDate), ['2026-12-06']);
});
