// 공원: 확정 배경 그림(소원 나무인 벚나무, 달빛 호수, 가로등, 벤치, 집 모양 표지판) 위에 기능을 연결
import { rect, glow } from '../render/pixel.js';
import { drawBackdrop, redrawParts } from '../render/backdrops.js';
import { TREE_NOTES } from '../shared/limits.js';

// 소원 쪽지가 달리는 25개 자리: 그림 속 벚꽃 위에서만, 가지 전체에 고르게 (그림의 분홍 꽃 픽셀을 기준으로 미리 고름)
// 26번째 쪽지는 가장 오래된 쪽지 자리에 달림
export const NOTE_SLOTS = [
  [76, 26], [96, 26], [60, 29], [112, 34], [44, 41], [73, 41], [96, 50], [116, 50], [55, 53], [134, 54], [29, 61], [85, 63], [104, 63],
  [145, 67], [53, 70], [71, 74], [113, 75], [98, 82], [21, 83], [46, 85], [127, 87], [79, 89], [39, 98], [55, 99], [103, 99],
].map(([x, y]) => ({ x, y }));

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
  skyHeight: 64,
  background(c, ctx) {
    drawBackdrop(c, 'park');
    // 실제 사용자가 쓴 소원이 있을 때만 쪽지를 매담 (아무도 없으면 그림처럼 빈 가지)
    const colors = ['#ffe9a6', '#fff6e0', '#c9ecff', '#d7ffc8', '#ffd0e4'];
    for (const n of ctx?.treeNotes || []) {
      const p = NOTE_SLOTS[n.slot]; if (!p) continue;
      rect(c, p.x, p.y - 3, 0.5, 3, '#f3ead2'); // 실
      rect(c, p.x - 1.5, p.y, 3, 6, '#5a3a2e'); rect(c, p.x - 1, p.y + 0.5, 2, 5, colors[n.color]); // 쪽지
      rect(c, p.x - 0.5, p.y + 1.5, 1, 0.5, 'rgba(90,60,46,.5)'); rect(c, p.x - 0.5, p.y + 3, 1, 0.5, 'rgba(90,60,46,.5)'); // 글씨 줄
    }
  },
  animate(c, t) {
    glow(c, 125, 110, 26, '255,214,140', 0.12 + Math.sin(t / 1100) * 0.02); // 가로등
    // 반딧불: 호수와 잔디 위를 천천히 떠다님
    for (let i = 0; i < 10; i++) {
      const x = (i * 37 + Math.sin(t / 1500 + i) * 20 + 320) % 320;
      const y = 112 + ((i * 23) % 50) + Math.sin(t / 900 + i * 2) * 6;
      const a = (Math.sin(t / 400 + i * 1.7) + 1) / 2;
      c.globalAlpha = a; rect(c, x, y, 1, 1, '#e8ff8a'); glow(c, x, y, 4, '232,255,138', 0.4 * a); c.globalAlpha = 1;
    }
  },
  // 가로등 뒤로 지나가는 아바타 앞에 가로등을 다시 그림
  props: [{ y: 148.5, draw(c) { redrawParts(c, 'park', [[120, 99, 14, 19], [124, 117, 6, 32]]); } }],
  /** 발 위치의 바닥: 앞쪽 산책로(흙) 또는 잔디 — 그림의 산책로 띠 */
  surfaceAt(x, y) {
    const top = 149.5 + (x < 160 ? 0 : (x - 160) * 0.004), bottom = x < 150 ? 163 - x * 0.01 : 165;
    return y >= top && y <= bottom ? 'path' : 'grass';
  },
  hotspots: [
    { id: 'tree', x: 14, y: 18, w: 136, h: 92, label: '소원 나무' }, // 꽃 덮인 가지
    { id: 'tree', x: 52, y: 96, w: 52, h: 46, label: '소원 나무' }, // 줄기
    { id: 'exit', x: 292, y: 112, w: 26, h: 36, label: '내 방으로' }, // 집 모양 표지판
  ],
};
