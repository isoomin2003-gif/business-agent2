// 서버와 브라우저가 함께 쓰는 장소 정의와 길찾기 (좌표는 320x180 픽셀 캔버스, 아바타 '발 위치' 기준)
// - walk: 걸을 수 있는 바닥(band)과 장애물(obstacles, 아바타 몸 폭만큼 여유를 둔 사각형)
// - seats: 앉는 자리. approach는 자리에 앉기 직전/일어난 직후 서는 바닥 위치
// - targets: 가구·라디오·나무를 눌렀을 때 걸어가 서는 위치
export const WALK_SPEED = 60; // px/s

export const PLACES = {
  // 좌표는 확정 배경 그림(1672×941)을 320×180에 맞춘 값. 아바타는 배경 교체 전과 같은 크기(서 있을 때 키 18, 폭 10)
  room: {
    name: '내 방',
    spawn: { x: 290, y: 150 },
    // door: 올리브색 문 앞 / shelf: 책장 앞 / cd: 창문 오른쪽 CD 플레이어 아래 / news: 주간신문 꽂이 아래(책상 오른쪽) / center: 러그 위
    targets: { door: { x: 290, y: 132 }, shelf: { x: 234, y: 136 }, center: { x: 220, y: 155 }, cd: { x: 110, y: 130 }, news: { x: 188, y: 131 } },
    walk: {
      band: { x0: 6, x1: 314, y0: 126, y1: 177 }, // 벽 아래 나무 바닥 전체 (러그 위 포함)
      obstacles: [
        { x: 0, y: 118, w: 29, h: 12 }, // 화분 (밑 y≈126)
        { x: 118, y: 118, w: 62, h: 18 }, // 책상 (다리 끝 y≈134)
        { x: 134, y: 118, w: 28, h: 26 }, // 의자 (다리 끝 y≈141)
        { x: 202, y: 118, w: 66, h: 12 }, // 책장 (밑단 y≈127)
      ],
    },
    // 의자는 책상을 향해 있어 뒷모습으로 앉음. 엉덩이가 초록 방석(y≈126~130) 위에 오도록
    seats: { chair: { x: 148, y: 127, approach: { x: 148, y: 150 }, back: true } },
  },
  rooftop: {
    name: '옥상',
    desc: '고양이 전광판이 빛나는 야경 아래 벤치와 라디오. 짧게 이야기하거나 같은 음악을 들어요.',
    spawn: { x: 296, y: 146 },
    targets: { radio: { x: 240, y: 136 }, exit: { x: 296, y: 136 } }, // exit: 계단실 문 앞
    walk: {
      band: { x0: 6, x1: 314, y0: 132, y1: 177 }, // 타일 바닥
      obstacles: [
        { x: 0, y: 124, w: 30, h: 12 }, // 실외기
        { x: 68, y: 124, w: 62, h: 10 }, // 벤치 A (좌판 x 71~127, 다리 끝 y≈130)
        { x: 158, y: 124, w: 62, h: 10 }, // 벤치 B (좌판 x 161~217)
        { x: 0, y: 150, w: 30, h: 30 }, // 왼쪽 아래 화초
        { x: 290, y: 158, w: 30, h: 22 }, // 오른쪽 아래 화초
      ],
    },
    // 벤치 두 개 × 4자리 = 8자리. 좌판 폭(약 56)을 4등분한 가운데에 앉음 (간격 13, 아바타 폭 10이라 겹치지 않음)
    seats: Object.fromEntries([
      ...[79, 92, 105, 118].map((x, i) => [`A${i + 1}`, { x, y: 118, approach: { x, y: 140 } }]),
      ...[169, 182, 195, 208].map((x, i) => [`B${i + 1}`, { x, y: 118, approach: { x, y: 140 } }]),
    ]),
  },
  park: {
    name: '공원',
    desc: '초록 나무와 달빛 호수가 있는 밤 산책길. 말없이 함께 쉬거나 소원 나무에 소원을 걸어요.',
    spawn: { x: 300, y: 155 },
    targets: { tree: { x: 102, y: 146 }, exit: { x: 296, y: 152 } }, // exit: 집 모양 표지판 앞
    walk: {
      band: { x0: 6, x1: 314, y0: 119, y1: 177 }, // 물가(y≈117) 아래 잔디부터 산책로·앞쪽 잔디까지 (호수 안으로는 못 들어감)
      obstacles: [
        { x: 0, y: 112, w: 28, h: 24 }, // 왼쪽 물가 꽃덤불
        { x: 48, y: 112, w: 50, h: 32 }, // 나무 줄기·뿌리 (뿌리 끝 y≈142)
        { x: 118, y: 140, w: 16, h: 10 }, // 랜턴 기둥
        { x: 140, y: 119, w: 118, h: 20 }, // 긴 벤치 (좌판 앞~다리 끝 y≈137)
        { x: 268, y: 122, w: 34, h: 14 }, // 오른쪽 물가 바위
        { x: 298, y: 132, w: 12, h: 15 }, // 표지판 기둥
        { x: 0, y: 156, w: 26, h: 24 }, // 왼쪽 아래 꽃덤불
        { x: 288, y: 158, w: 32, h: 22 }, // 오른쪽 아래 꽃덤불
      ],
    },
    // 긴 벤치 1개 × 5자리. 좌판(x 146~251)을 5등분 (간격 20, 아바타 폭 10)
    seats: Object.fromEntries([158, 178, 198, 218, 238].map((x, i) => [`P${i + 1}`, { x, y: 123, approach: { x, y: 145 } }])),
  },
};

export const OUTDOOR = ['rooftop', 'park'];

// ───────────── 걷기 가능 여부 ─────────────
export function isWalkable(placeId, x, y) {
  const w = PLACES[placeId]?.walk;
  if (!w) return false;
  const b = w.band;
  if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) return false;
  for (const o of w.obstacles) if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) return false;
  return true;
}

const CELL = 4;
const COLS = 320 / CELL, ROWS = 180 / CELL;
const grids = {};
function grid(placeId) {
  if (grids[placeId]) return grids[placeId];
  const g = new Uint8Array(COLS * ROWS);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) g[r * COLS + c] = isWalkable(placeId, c * CELL + CELL / 2, r * CELL + CELL / 2) ? 1 : 0;
  grids[placeId] = g;
  return g;
}
const cellOf = (p) => ({ c: Math.max(0, Math.min(COLS - 1, Math.floor(p.x / CELL))), r: Math.max(0, Math.min(ROWS - 1, Math.floor(p.y / CELL))) });
const center = (c, r) => ({ x: c * CELL + CELL / 2, y: r * CELL + CELL / 2 });

/** 눌린 곳이 장애물·바닥 밖이면 가장 가까운 걸을 수 있는 위치로 (maxDist 이내, 없으면 null) */
export function snapWalkable(placeId, p, maxDist = 20) {
  if (isWalkable(placeId, p.x, p.y)) return { x: Math.round(p.x), y: Math.round(p.y) };
  const g = grid(placeId);
  const { c, r } = cellOf(p);
  const R = Math.ceil(maxDist / CELL);
  let best = null, bestD = Infinity;
  for (let dr = -R; dr <= R; dr++) for (let dc = -R; dc <= R; dc++) {
    const cc = c + dc, rr = r + dr;
    if (cc < 0 || rr < 0 || cc >= COLS || rr >= ROWS || !g[rr * COLS + cc]) continue;
    const q = center(cc, rr);
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < bestD && d <= maxDist) { bestD = d; best = q; }
  }
  return best;
}

function lineClear(placeId, a, b) {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2); // 0.5 간격으로 확인 (장애물 모서리를 스치지 않게)
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (!isWalkable(placeId, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return false;
  }
  return true;
}

/**
 * from → to 경로(픽셀 좌표 목록). 장애물은 돌아가고, 직선으로 갈 수 있는 구간은 곧게 폅니다.
 * from/to는 걸을 수 있는 위치여야 합니다(snapWalkable 사용). 갈 수 없으면 null.
 */
export function planPath(placeId, from, to) {
  if (!isWalkable(placeId, from.x, from.y) || !isWalkable(placeId, to.x, to.y)) return null;
  if (lineClear(placeId, from, to)) return [from, to];
  const g = grid(placeId);
  const s = cellOf(from), e = cellOf(to);
  const key = (c, r) => r * COLS + c;
  const open = new Map([[key(s.c, s.r), { c: s.c, r: s.r, g: 0, f: 0 }]]);
  const came = new Map();
  const gScore = new Map([[key(s.c, s.r), 0]]);
  const closed = new Set();
  const h = (c, r) => Math.hypot(c - e.c, r - e.r);
  while (open.size) {
    let curK = null, cur = null;
    for (const [k, v] of open) if (!cur || v.f < cur.f) { cur = v; curK = k; }
    open.delete(curK);
    if (cur.c === e.c && cur.r === e.r) {
      const cells = [];
      for (let k = curK; k !== undefined; k = came.get(k)) cells.unshift(k);
      const raw = [from, ...cells.slice(1, -1).map((k) => center(k % COLS, Math.floor(k / COLS))), to];
      // 시야가 트인 지점끼리 이어 경로를 곧게 폄
      const out = [raw[0]];
      let i = 0;
      while (i < raw.length - 1) {
        let j = raw.length - 1;
        while (j > i + 1 && !lineClear(placeId, raw[i], raw[j])) j--;
        out.push(raw[j]);
        i = j;
      }
      return out.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
    }
    closed.add(curK);
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const c = cur.c + dc, r = cur.r + dr;
      if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
      const k = key(c, r);
      const isEnd = c === e.c && r === e.r;
      if (closed.has(k) || (!g[k] && !isEnd)) continue;
      if (dr && dc && (!g[key(cur.c + dc, cur.r)] || !g[key(cur.c, cur.r + dr)])) continue; // 모서리 끼어가기 금지
      const ng = cur.g + (dr && dc ? Math.SQRT2 : 1);
      if (ng >= (gScore.get(k) ?? Infinity)) continue;
      gScore.set(k, ng); came.set(k, curK);
      open.set(k, { c, r, g: ng, f: ng + h(c, r) });
    }
  }
  return null;
}

/**
 * 현재 위치(앉아 있으면 그 자리)에서 목표까지의 전체 이동 경로.
 * - seatNow: 지금 앉아 있는 자리 → 먼저 그 자리 앞(approach)으로 일어섬
 * - seatTo: 앉을 자리 → 자리 앞까지 걸어간 뒤 자리에 앉음
 */
export function routeTo(placeId, cur, target, { seatNow = null, seatTo = null } = {}) {
  const place = PLACES[placeId];
  const pts = [{ x: Math.round(cur.x), y: Math.round(cur.y) }];
  let start = pts[0];
  if (seatNow && place.seats[seatNow]) { start = place.seats[seatNow].approach; pts.push(start); }
  else if (!isWalkable(placeId, start.x, start.y)) {
    const s = snapWalkable(placeId, start, 40);
    if (!s) return null;
    start = s; pts.push(s);
  }
  const goal = seatTo ? place.seats[seatTo].approach : snapWalkable(placeId, target, 24);
  if (!goal) return null;
  const path = planPath(placeId, start, goal);
  if (!path) return null;
  pts.push(...path.slice(1));
  if (seatTo) pts.push({ x: place.seats[seatTo].x, y: place.seats[seatTo].y });
  // 같은 점이 연달아 있으면 정리
  return pts.filter((p, i) => i === 0 || p.x !== pts[i - 1].x || p.y !== pts[i - 1].y);
}

export function pathDuration(points) {
  let d = 0;
  for (let i = 1; i < points.length; i++) d += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return (d / WALK_SPEED) * 1000;
}

/** 경로와 시작 시각으로 현재 위치를 계산합니다. */
export function positionAt(points, startAt, now) {
  if (!points || points.length === 0) return null;
  let remain = Math.max(0, ((now - startAt) / 1000) * WALK_SPEED);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (remain <= len) {
      const t = len ? remain / len : 1;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, moving: true, dir: b.x < a.x ? -1 : b.x > a.x ? 1 : 0, up: a.y - b.y > Math.abs(b.x - a.x) }; // up: 화면 안쪽(위)으로 걸어감 → 뒷모습
    }
    remain -= len;
  }
  const last = points[points.length - 1];
  return { x: last.x, y: last.y, moving: false, dir: 0 };
}
