// 공원: 확정 배경 그림(소원 나무인 초록 나무, 달빛 호수, 랜턴, 5인용 긴 벤치, 집 모양 표지판) 위에 기능을 연결
import { rect, glow } from '../render/pixel.js';
import { drawBackdrop, redrawParts } from '../render/backdrops.js';
import { TREE_NOTES } from '../shared/limits.js';

// 소원 쪽지가 달리는 25개 자리: 그림 속 나뭇잎 안쪽에서만, 가지 전체에 고르게 (그림의 초록 잎 픽셀을 기준으로 미리 고름)
// 26번째 쪽지는 가장 오래된 쪽지 자리에 달림
export const NOTE_SLOTS = [
  [84, 47], [72, 49], [64, 52], [91, 52], [105, 56], [80, 57], [93, 59], [60, 61], [112, 61], [48, 62], [68, 64], [120, 69], [76, 70],
  [41, 72], [116, 76], [92, 77], [44, 78], [53, 78], [124, 80], [35, 83], [129, 87], [77, 89], [65, 90], [94, 92], [120, 94],
].map(([x, y]) => ({ x, y }));

/** 나무에 보일 소원들(최신순, treeSeq 포함) → 쪽지 자리. 기본 자리 = (건 순서-1) % 25, 이미 찼으면 다음 빈자리 */
export function noteSlots(wishes) {
  const used = new Set(), out = [];
  for (const w of wishes.slice(0, TREE_NOTES)) {
    let slot = ((Number(w.treeSeq) || 1) - 1) % TREE_NOTES;
    while (used.has(slot)) slot = (slot + 1) % TREE_NOTES;
    used.add(slot); out.push({ slot, color: (Number(w.treeSeq) || 0) % 5, wishId: w.id });
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
    glow(c, 126, 116, 24, '255,214,140', 0.12 + Math.sin(t / 1100) * 0.02); // 랜턴
    // 반딧불: 호수와 잔디 위를 천천히 떠다님
    for (let i = 0; i < 10; i++) {
      const x = (i * 37 + Math.sin(t / 1500 + i) * 20 + 320) % 320;
      const y = 112 + ((i * 23) % 50) + Math.sin(t / 900 + i * 2) * 6;
      const a = (Math.sin(t / 400 + i * 1.7) + 1) / 2;
      c.globalAlpha = a; rect(c, x, y, 1, 1, '#e8ff8a'); glow(c, x, y, 4, '232,255,138', 0.4 * a); c.globalAlpha = 1;
    }
  },
  // 가로등 뒤로 지나가는 아바타 앞에 가로등을 다시 그림
  props: [
    // 랜턴 뒤로 지나가는 아바타 앞에 랜턴을 다시 그림
    { y: 148.5, draw(c) { redrawParts(c, 'park', [[118.5, 107, 16, 18], [124.5, 124, 4.5, 25]]); } },
    // 벤치 뒤 잔디를 걷는 아바타 앞으로 벤치(등받이·좌판·다리)를 다시 그림. 벤치에 앉은 사람(y 123)은 벤치 위에 그려짐
    { y: 121.5, draw(c) { redrawParts(c, 'park', [[145.5, 111.5, 105, 10.5], [142.5, 122, 112, 5.5], [145.5, 127, 8, 11], [244.5, 127, 8, 11]]); } },
  ],
  /** 누른 곳에 걸린 소원 쪽지 (쪽지마다 따로 눌러 읽기) */
  noteAt(ctx, x, y, pad = 0) {
    for (const n of ctx?.treeNotes || []) {
      const p = NOTE_SLOTS[n.slot];
      if (p && n.wishId && x >= p.x - 2.5 - pad && x <= p.x + 2.5 + pad && y >= p.y - 3 - pad && y <= p.y + 7 + pad) return n.wishId;
    }
    return null;
  },
  /** 발 위치의 바닥: 앞쪽 산책로(흙) 또는 잔디 — 그림의 산책로 띠 */
  surfaceAt(x, y) {
    return y >= 150 && y <= 166 ? 'path' : 'grass'; // 앞쪽 산책로 띠 (y 150~166)
  },
  hotspots: [
    { id: 'tree', x: 24, y: 42, w: 114, h: 62, label: '소원 나무' }, // 잎이 무성한 가지
    { id: 'tree', x: 52, y: 98, w: 44, h: 46, label: '소원 나무' }, // 줄기
    { id: 'exit', x: 292, y: 112, w: 26, h: 36, label: '내 방으로' }, // 집 모양 표지판
  ],
};
