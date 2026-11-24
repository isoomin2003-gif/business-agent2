// 서버와 브라우저가 함께 사용하는 장소 정의 (좌표는 320x180 픽셀 캔버스 기준)
export const WALK_SPEED = 60; // px/s

export const PLACES = {
  room: {
    name: '내 방',
    spawn: 'door',
    nodes: {
      door: { x: 292, y: 140 },
      center: { x: 215, y: 150 },
      desk: { x: 150, y: 150, label: null },
      shelf: { x: 240, y: 138 },
    },
    edges: [['door', 'center'], ['center', 'desk'], ['center', 'shelf'], ['shelf', 'door']],
    seats: { chair: { x: 150, y: 128, node: 'desk', back: true } },
  },
  rooftop: {
    name: '옥상',
    desc: '네온빛 야경 아래 벤치와 라디오. 짧게 이야기하거나 같은 음악을 들어요.',
    spawn: 'entrance',
    nodes: {
      entrance: { x: 292, y: 150, label: '계단' },
      radio: { x: 250, y: 150, label: '라디오 앞' },
      mid: { x: 205, y: 160, label: '가운데' },
      benchB: { x: 180, y: 146, label: '벤치 앞' },
      center: { x: 120, y: 165, label: '난간 쪽' },
      benchA: { x: 82, y: 146, label: '벤치 앞' },
      corner: { x: 24, y: 160, label: '모퉁이' },
    },
    edges: [['entrance', 'radio'], ['radio', 'mid'], ['mid', 'benchB'], ['mid', 'center'],
      ['center', 'benchB'], ['center', 'benchA'], ['center', 'corner'], ['benchA', 'corner']],
    seats: {
      A1: { x: 52, y: 124, node: 'benchA' }, A2: { x: 72, y: 124, node: 'benchA' },
      A3: { x: 92, y: 124, node: 'benchA' }, A4: { x: 112, y: 124, node: 'benchA' },
      B1: { x: 152, y: 124, node: 'benchB' }, B2: { x: 172, y: 124, node: 'benchB' },
      B3: { x: 192, y: 124, node: 'benchB' }, B4: { x: 212, y: 124, node: 'benchB' },
    },
  },
  park: {
    name: '공원',
    desc: '풀벌레 소리가 들리는 밤 산책길. 말없이 함께 쉬거나 소원 나무에 소원을 걸어요.',
    spawn: 'entrance',
    nodes: {
      entrance: { x: 300, y: 160, label: '입구' },
      path: { x: 262, y: 152, label: '산책로' },
      bench: { x: 200, y: 146, label: '벤치 앞' },
      middle: { x: 140, y: 160, label: '잔디밭' },
      tree: { x: 82, y: 150, label: '소원 나무' },
      lawn: { x: 110, y: 172, label: '가로등 아래' },
    },
    edges: [['entrance', 'path'], ['path', 'bench'], ['path', 'middle'], ['bench', 'middle'],
      ['middle', 'tree'], ['middle', 'lawn'], ['tree', 'lawn']],
    seats: {
      P1: { x: 160, y: 124, node: 'bench' }, P2: { x: 180, y: 124, node: 'bench' },
      P3: { x: 200, y: 124, node: 'bench' }, P4: { x: 220, y: 124, node: 'bench' },
      P5: { x: 240, y: 124, node: 'bench' },
    },
  },
};

export const OUTDOOR = ['rooftop', 'park'];

/** 정해진 경로(노드 그래프)에서 BFS로 최단 경로를 찾습니다. */
export function findPath(placeId, from, to) {
  const place = PLACES[placeId];
  if (!place || !place.nodes[from] || !place.nodes[to]) return null;
  const adj = {};
  for (const [a, b] of place.edges) { (adj[a] ||= []).push(b); (adj[b] ||= []).push(a); }
  const prev = { [from]: null };
  const q = [from];
  while (q.length) {
    const n = q.shift();
    if (n === to) break;
    for (const m of adj[n] || []) if (!(m in prev)) { prev[m] = n; q.push(m); }
  }
  if (!(to in prev)) return null;
  const path = [];
  for (let n = to; n !== null; n = prev[n]) path.unshift(n);
  return path;
}

/** 노드 id 목록(+선택적 좌석)을 실제 좌표 목록으로 바꿉니다. */
export function pathPoints(placeId, nodes, seatId) {
  const place = PLACES[placeId];
  const pts = nodes.map((n) => ({ x: place.nodes[n].x, y: place.nodes[n].y }));
  if (seatId) { const s = place.seats[seatId]; pts.push({ x: s.x, y: s.y }); }
  return pts;
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
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, moving: true, dir: b.x < a.x ? -1 : b.x > a.x ? 1 : 0 };
    }
    remain -= len;
  }
  const last = points[points.length - 1];
  return { x: last.x, y: last.y, moving: false, dir: 0 };
}
