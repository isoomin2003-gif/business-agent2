import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLACES, routeTo, isWalkable, snapWalkable, positionAt } from '../public/js/shared/places.js';

function allWalkable(place, pts, { skipFirst = 0, skipLast = 0 } = {}) {
  for (let i = 1 + skipFirst; i < pts.length - skipLast; i++) {
    const a = pts[i - 1], b = pts[i];
    for (let t = 0; t <= 1; t += 0.02) if (!isWalkable(place, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return false;
  }
  return true;
}

test('모든 장소의 출발점·목표 지점은 걸을 수 있는 곳', () => {
  for (const [id, p] of Object.entries(PLACES)) {
    assert.ok(isWalkable(id, p.spawn.x, p.spawn.y), `${id} spawn`);
    for (const [k, t] of Object.entries(p.targets)) assert.ok(isWalkable(id, t.x, t.y), `${id} ${k}`);
    for (const [k, s] of Object.entries(p.seats)) assert.ok(isWalkable(id, s.approach.x, s.approach.y), `${id} seat ${k}`);
  }
});

test('가구·벤치·나무를 돌아가는 경로', () => {
  const room = routeTo('room', { x: 60, y: 130 }, { x: 190, y: 130 });
  assert.ok(room.length > 2 && allWalkable('room', room), '책상·의자를 돌아감');
  const roof = routeTo('rooftop', { x: 50, y: 133 }, { x: 240, y: 133 });
  assert.ok(roof.length > 2 && allWalkable('rooftop', roof), '벤치를 돌아감');
  const park = routeTo('park', { x: 30, y: 140 }, { x: 110, y: 130 });
  assert.ok(park.length > 2 && allWalkable('park', park), '벚나무 줄기를 돌아감');
});

test('모든 좌석에 앉고, 앉은 자리에서 일어나 걸어갈 수 있다', () => {
  for (const [id, p] of Object.entries(PLACES)) {
    for (const [sid, s] of Object.entries(p.seats)) {
      const sit = routeTo(id, p.spawn, null, { seatTo: sid });
      assert.deepEqual(sit.at(-1), { x: s.x, y: s.y });
      assert.ok(allWalkable(id, sit, { skipLast: 1 }), `${id} ${sid} sit`);
      const up = routeTo(id, s, { x: p.spawn.x, y: p.spawn.y }, { seatNow: sid });
      assert.deepEqual(up[1], s.approach);
      assert.ok(allWalkable(id, up, { skipFirst: 1 }), `${id} ${sid} stand`);
    }
  }
});

test('하늘·벽 같은 바닥 밖 클릭은 무시하고, 장애물 가장자리는 가까운 바닥으로', () => {
  assert.equal(snapWalkable('rooftop', { x: 150, y: 40 }, 12), null);
  const s = snapWalkable('park', { x: 150, y: 139 }, 12); // 벤치 바로 앞
  assert.ok(s && isWalkable('park', s.x, s.y));
});

test('걷는 도중 방향을 바꾸면 현재 위치에서 새 경로가 시작된다', () => {
  const first = routeTo('rooftop', PLACES.rooftop.spawn, { x: 30, y: 168 });
  const mid = positionAt(first, 0, 1500);
  assert.ok(mid.moving);
  const turn = routeTo('rooftop', mid, { x: 230, y: 172 });
  assert.ok(Math.hypot(turn[0].x - mid.x, turn[0].y - mid.y) < 1);
  assert.deepEqual(turn.at(-1), { x: 230, y: 172 });
});
