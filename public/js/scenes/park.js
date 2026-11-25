import { rect, stars, glow, vgrad, bench, rng, disc } from '../render/pixel.js';
import { TREE_NOTES } from '../shared/limits.js';

// 소원 쪽지가 달리는 25개 자리 (나뭇잎 위, 서로 겹치지 않게 고정). 26번째 쪽지는 가장 오래된 쪽지 자리에 달림
export const NOTE_SLOTS = (() => {
  const r = rng(91), out = [];
  for (let tries = 0; out.length < TREE_NOTES && tries < 5000; tries++) {
    const x = 48 + Math.floor(r() * 66), y = 44 + Math.floor(r() * 50);
    // 나뭇잎 덩어리 안쪽만 (가운데 줄기 윗부분 포함)
    const inLeaves = [[80, 52, 34], [56, 72, 24], [104, 70, 26], [80, 80, 30], [66, 46, 18], [96, 44, 20]].some(([cx, cy, rr]) => Math.hypot(x - cx, y - cy) < rr - 6);
    if (inLeaves && out.every((p) => Math.abs(p.x - x) > 5 || Math.abs(p.y - y) > 9)) out.push({ x, y });
  }
  return out;
})();
/** 나무에 보일 소원들(최신순, treeSeq 포함) → 쪽지 자리. 기본 자리 = (건 순서-1) % 25, 이미 찼으면 다음 빈자리 */
export function noteSlots(wishes) {
  const used = new Set(), out = [];
  for (const w of wishes.slice(0, TREE_NOTES)) {
    let slot = ((Number(w.treeSeq) || 1) - 1) % TREE_NOTES;
    while (used.has(slot)) slot = (slot + 1) % TREE_NOTES;
    used.add(slot); out.push({ slot, color: (Number(w.treeSeq) || 0) % 5 });
  }
  return out;
}

export const park = {
  id: 'park',
  skyHeight: 70,
  background(c, ctx) {
    vgrad(c, 0, 0, 320, 96, [[10, 22, 30], [16, 38, 40], [22, 52, 44]]);
    stars(c, 320, 60, 60, 33, '#e8fff0');
    glow(c, 35, 21, 20, '240,240,200', 0.15); disc(c, 35, 21, 6, '#f4f0d0'); rect(c, 33, 19, 2, 2, '#e0dcb8'); rect(c, 37, 23, 1, 1, '#e0dcb8');
    // 먼 숲 실루엣
    const r = rng(8);
    for (let x = 0; x < 320; x += 6) { const h = 16 + Math.floor(r() * 16); rect(c, x, 96 - h, 7, h, '#0b1f19'); rect(c, x + 2, 92 - h, 3, 4, '#0b1f19'); }
    // 잔디
    rect(c, 0, 96, 320, 84, '#163a2a');
    const r2 = rng(4);
    for (let i = 0; i < 260; i++) rect(c, Math.floor(r2() * 320), 98 + Math.floor(r2() * 82), 1, 2, r2() < 0.5 ? '#1f4d36' : '#0f2c20');
    // 산책로
    c.fillStyle = '#3d3a2c';
    for (let x = 0; x < 320; x++) { const y = 150 + Math.round(Math.sin(x / 50) * 5); c.fillRect(x, y, 1, 14); }
    for (let x = 0; x < 320; x += 7) rect(c, x, 152 + Math.round(Math.sin(x / 50) * 5) + (x % 3) * 3, 2, 1, '#55513d');
    // 가로등
    rect(c, 128, 120, 2, 44, '#2a2f2c'); rect(c, 124, 116, 10, 4, '#3a403c'); rect(c, 125, 120, 8, 2, '#ffeaa0');
    // 벤치
    bench(c, 150, 100, 124, '#7a5a3c', '#4a3422');
    // 소원 나무
    rect(c, 72, 84, 18, 70, '#3b2a1e'); rect(c, 76, 84, 4, 70, '#4a3626'); rect(c, 66, 148, 30, 6, '#3b2a1e');
    rect(c, 58, 98, 16, 4, '#3b2a1e'); rect(c, 88, 92, 18, 4, '#3b2a1e');
    const leaves = [[80, 52, 34], [56, 72, 24], [104, 70, 26], [80, 80, 30], [66, 46, 18], [96, 44, 20]];
    for (const [x, y, rr] of leaves) disc(c, x, y, rr, '#1f5a3a');
    for (const [x, y, rr] of leaves) disc(c, x - 3, y - 4, Math.round(rr * 0.7), '#2b7148');
    for (const [x, y, rr] of leaves) disc(c, x - 6, y - 8, Math.round(rr * 0.3), '#3a8a58');
    // 걸린 소원 쪽지: 아직 7일이 지나지 않은 최근 25개까지 (자리는 noteSlots로 정해짐)
    const colors = ['#ffcf6e', '#ff9fc0', '#9fe0ff', '#c4ffb0', '#f6ecd6'];
    const notes = ctx?.treeNotes || Array.from({ length: Math.min(ctx?.treeCount ?? 0, TREE_NOTES) }, (_, i) => ({ slot: i, color: i % 5 }));
    for (const n of notes) {
      const p = NOTE_SLOTS[n.slot]; if (!p) continue;
      rect(c, p.x, p.y - 3, 1, 3, '#d8d0b0'); rect(c, p.x - 1, p.y, 3, 6, colors[n.color]); rect(c, p.x - 1, p.y + 5, 3, 1, 'rgba(0,0,0,.25)');
    }
    // 입구
    rect(c, 300, 128, 4, 36, '#2a2f2c'); rect(c, 316, 128, 4, 36, '#2a2f2c'); rect(c, 298, 124, 24, 4, '#3a403c');
    // 입구 위 작은 집 모양 표지판 (내 방으로 돌아가는 곳)
    rect(c, 302, 111, 16, 11, '#7a5a3c'); rect(c, 303, 112, 14, 9, '#9a7048');
    rect(c, 309, 114, 2, 1, '#f6ecd6'); rect(c, 308, 115, 4, 1, '#f6ecd6'); rect(c, 307, 116, 6, 1, '#f6ecd6');
    rect(c, 308, 117, 4, 3, '#f6ecd6'); rect(c, 309, 118, 2, 2, '#7a5a3c'); rect(c, 309, 122, 2, 2, '#4a3422');
    // 수풀
    for (const [x, y] of [[0, 128], [20, 134], [276, 106], [300, 104], [8, 166], [250, 168]]) { rect(c, x, y, 18, 10, '#0f3322'); rect(c, x + 3, y - 3, 12, 4, '#12402a'); }
  },
  animate(c, t) {
    glow(c, 129, 124, 44, '255,234,160', 0.22);
    // 반딧불
    for (let i = 0; i < 9; i++) {
      const x = (i * 37 + Math.sin(t / 1500 + i) * 20 + 320) % 320;
      const y = 100 + ((i * 23) % 60) + Math.sin(t / 900 + i * 2) * 6;
      const a = (Math.sin(t / 400 + i * 1.7) + 1) / 2;
      c.globalAlpha = a; rect(c, x, y, 1, 1, '#e8ff8a'); glow(c, x, y, 4, '232,255,138', 0.4 * a); c.globalAlpha = 1;
    }
    // 소원 나무 반짝임
    const a = (Math.sin(t / 700) + 1) / 2;
    glow(c, 80, 64, 40, '255,240,180', 0.06 + a * 0.05);
  },
  props: [],
  /** 발 위치의 바닥: 산책로(흙·잔자갈) 또는 잔디 — 배경의 산책로 그림과 같은 식 */
  surfaceAt(x, y) {
    const top = 150 + Math.round(Math.sin(x / 50) * 5);
    return y >= top - 1 && y <= top + 14 ? 'path' : 'grass';
  },
  hotspots: [
    { id: 'tree', x: 40, y: 24, w: 86, h: 76, label: '소원 나무' }, // 나뭇잎
    { id: 'tree', x: 64, y: 100, w: 34, h: 56, label: '소원 나무' }, // 줄기 (주변 잔디는 걸어갈 수 있음)
    { id: 'exit', x: 296, y: 120, w: 24, h: 46, label: '내 방으로' },
  ],
};
