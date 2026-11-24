import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../server/config.js';
import { retrieve, parseDateRange, exampleRecords, buildAgentPayload, memorySearch, parseDecision } from '../server/rag.js';
import { startMockOpenRouter } from './mock-openrouter.js';

const TODAY = '2026-11-24';
const ex = exampleRecords(TODAY);
let mock;
before(async () => { mock = await startMockOpenRouter(); });
after(() => mock.close());
const useAi = (path = '/api/v1', key = 'test-key') => { config.openrouter.apiKey = key; config.openrouter.baseUrl = mock.url + path; };

test('날짜 표현을 범위로 바꾼다', () => {
  assert.deepEqual(parseDateRange('이번 달에 웃은 날', TODAY).range, { from: '2026-11-01', to: '2026-11-30', label: '이번 달' });
  assert.deepEqual(parseDateRange('지난달 기록', TODAY).range, { from: '2026-10-01', to: '2026-10-31', label: '지난달' });
  assert.equal(parseDateRange('어제 뭐 했지', TODAY).range.from, '2026-11-23');
  assert.equal(parseDateRange('1월에 뭐 했지', TODAY).range.from, '2026-01-01');
});

test('1차 검색은 질문의 낱말과 기간으로만 찾는다', () => {
  assert.equal(retrieve('이번 달에 친구랑 웃었던 날이 언제였지?', ex, TODAY).results[0].id, 'ex-1');
  // '비'·'창밖'·'찍'은 예시 문장에 그대로 없으므로 1차 검색에서는 못 찾음 → AI가 단서를 바꿔 재검색해야 하는 경우
  assert.equal(retrieve('지난달에 비 오는 날 창밖을 찍었던 게 언제였지?', ex, TODAY).results.length, 0);
  assert.equal(retrieve('바다에서 수영한 날이 언제였지?', ex, TODAY).results.length, 0);
});

test('경우 1: 첫 검색에서 찾음 → AI가 answer', async () => {
  useAi();
  const r = await memorySearch({ question: '이번 달에 친구랑 웃었던 날이 언제였지?', docs: ex, today: TODAY });
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.sources.map((s) => s.id), ['ex-1']);
  assert.deepEqual(r.trace.map((t) => `${t.kind}:${t.action || t.found}`), ['search:1', 'ai:answer']);
  assert.match(r.answer, /11월 24일/);
});

test('경우 2: 검색어를 바꿔 찾음 → 지정한 기간(지난달)은 재검색에도 유지', async () => {
  useAi();
  const r = await memorySearch({ question: '지난달에 비 오는 날 창밖을 찍었던 게 언제였지?', docs: ex, today: TODAY });
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.sources.map((s) => s.id), ['ex-2']);
  const [s1, a1, s2, a2] = r.trace;
  assert.equal(s1.found, 0);
  assert.equal(a1.action, 'retry');
  assert.ok(a1.keywords.includes('빗소리'));
  assert.deepEqual(s2.range, s1.range);
  assert.equal(s2.range.label, '지난달');
  assert.ok(s2.dates.every((d) => d.startsWith('2026-10')));
  assert.equal(a2.action, 'answer');
});

test('경우 3: 다시 찾아도 근거 없음 → 관련된 기록을 찾지 못했어요', async () => {
  useAi();
  const r = await memorySearch({ question: '바다에서 수영한 날이 언제였지?', docs: ex, today: TODAY });
  assert.equal(r.status, 'not_found');
  assert.equal(r.message, '관련된 기록을 찾지 못했어요.');
  assert.deepEqual(r.trace.map((t) => t.kind + ':' + (t.action || t.found)), ['search:0', 'ai:retry', 'search:0', 'ai:not_found']);
});

test('API 실패·키 없음: 상태를 알리고 찾은 기록은 열어볼 수 있게', async () => {
  useAi('/fail/api/v1');
  const f = await memorySearch({ question: '이번 달에 친구랑 웃었던 날이 언제였지?', docs: ex, today: TODAY });
  assert.equal(f.status, 'api_error');
  assert.deepEqual(f.candidates.map((s) => s.id), ['ex-1']);
  useAi('/api/v1', '');
  const k = await memorySearch({ question: '이번 달에 친구랑 웃었던 날이 언제였지?', docs: ex, today: TODAY });
  assert.equal(k.status, 'no_key');
  assert.equal(k.candidates.length, 1);
});

test('기간 안에 기록이 없으면 AI를 부르지 않는다', async () => {
  useAi();
  const r = await memorySearch({ question: '작년에 웃은 날', docs: ex, today: TODAY });
  assert.equal(r.status, 'empty_range');
  assert.equal(r.sentToAi.length, 0);
});

test('외부로 보내는 내용은 질문과 날짜·문장뿐', () => {
  const recs = [{ id: 'secret-id', date: '2026-11-24', sentence: '웃었다', videoUrl: '/api/videos/abc', nickname: '비밀 닉네임' }];
  const body = JSON.stringify(buildAgentPayload('웃은 날?', recs, true));
  assert.ok(body.includes('2026-11-24') && body.includes('웃었다'));
  for (const leak of ['secret-id', '/api/videos', '비밀 닉네임']) assert.ok(!body.includes(leak), leak);
});

test('AI 응답 형식이 어긋나면 안전하게 처리', () => {
  assert.equal(parseDecision('그냥 문장', 2, true).action, 'not_found');
  assert.equal(parseDecision('{"action":"retry","keywords":[]}', 0, true).action, 'not_found');
  assert.equal(parseDecision('{"action":"retry","keywords":["우산"]}', 0, false).action, 'not_found'); // 재검색은 한 번만
  assert.deepEqual(parseDecision('```json\n{"action":"answer","answer":"x","used":[9]}\n```', 2, false).used, [1]);
});
