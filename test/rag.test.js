import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retrieve, parseDateRange, exampleRecords, buildPayload } from '../server/rag.js';

const TODAY = '2026-11-24';
const ex = exampleRecords(TODAY);

test('날짜 표현을 범위로 바꾼다', () => {
  assert.deepEqual(parseDateRange('이번 달에 웃은 날', TODAY).range, { from: '2026-11-01', to: '2026-11-30', label: '이번 달' });
  assert.deepEqual(parseDateRange('지난달 기록', TODAY).range, { from: '2026-10-01', to: '2026-10-31', label: '지난달' });
  assert.equal(parseDateRange('어제 뭐 했지', TODAY).range.from, '2026-11-23');
  assert.equal(parseDateRange('1월에 뭐 했지', TODAY).range.from, '2026-01-01');
});

test('근거가 있는 질문은 관련 일기를 찾는다', () => {
  const r = retrieve('이번 달에 친구랑 웃었던 날이 언제였지?', ex, TODAY);
  assert.equal(r.results[0].id, 'ex-1');
  assert.ok(r.results.length <= 3);
  assert.equal(retrieve('지난달에 노을 본 날은?', ex, TODAY).results[0].id, 'ex-3');
});

test('날짜 범위를 먼저 적용한다', () => {
  // 비 오는 기록은 지난달이므로 '이번 달' 질문에서는 나오지 않음
  assert.equal(retrieve('이번 달에 비 온 날?', ex, TODAY).results.length, 0);
  assert.equal(retrieve('지난달에 비 온 날?', ex, TODAY).results[0].id, 'ex-2');
});

test('근거가 없는 질문은 빈 결과', () => {
  const r = retrieve('바다에 놀러 간 날이 언제였지?', ex, TODAY);
  assert.equal(r.results.length, 0);
  assert.equal(r.reason, 'no_match');
});

test('외부로 보내는 내용은 질문과 날짜·문장뿐', () => {
  const recs = [{ id: 'secret-id', date: '2026-11-24', sentence: '웃었다', videoUrl: '/api/videos/abc', nickname: '비밀 닉네임' }];
  const body = JSON.stringify(buildPayload('웃은 날?', recs, TODAY));
  assert.ok(body.includes('2026-11-24') && body.includes('웃었다'));
  for (const leak of ['secret-id', '/api/videos', '비밀 닉네임']) assert.ok(!body.includes(leak), leak);
});
