// 방 책장: 책 12권 = 1~12월 고정. 올해(한국 시간) 그 달에 기록이 있으면 그 달의 책만 색칠
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coloredMonths, kstToday } from '../public/js/shared/books.js';

test('11월 기록만 있으면 11월 책(아랫줄 세 번째)만, 12월 책은 회갈색', () => {
  assert.deepEqual(coloredMonths([{ month: '2026-11', count: 1 }], 2026), [11]);
});
test('같은 달에 여러 번 써도 한 권, 다음 책으로 넘어가지 않음', () => {
  assert.deepEqual(coloredMonths([{ month: '2026-11', count: 9 }], 2026), [11]);
});
test('새달은 그달 첫 기록을 저장해야 칠해짐, 지난해 기록은 올해 책에 칠하지 않음', () => {
  assert.deepEqual(coloredMonths(['2025-12', '2026-11', '2026-12'], 2026), [11, 12]);
  assert.deepEqual(coloredMonths(['2025-12', '2026-11'], 2026), [11]);
  assert.deepEqual(coloredMonths(['2026-01', '2026-05', '2026-09'], 2026), [1, 5, 9]);
});
test('날짜는 한국 시간 기준: UTC 11월 30일 15시 = 한국 12월 1일 0시', () => {
  assert.equal(kstToday(Date.parse('2026-11-30T14:59:00Z')), '2026-11-30');
  assert.equal(kstToday(Date.parse('2026-11-30T15:00:00Z')), '2026-12-01');
});
