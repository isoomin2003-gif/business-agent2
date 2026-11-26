// 공원: 확정 배경 그림(소원 나무인 초록 나무, 달빛 호수, 랜턴, 5인용 긴 벤치, 집 모양 표지판) 위에 기능을 연결
import { rect, glow } from '../render/pixel.js';
import { drawBackdrop, redrawParts } from '../render/backdrops.js';
import { TREE_NOTES } from '../shared/limits.js';

// 소원 쪽지가 달리는 25개 자리 (x, y = 끈이 가지에 묶이는 점). 종이는 그 아래로 내려옴
// 위쪽·가운데·양옆 가지에 4줄로 엇갈려 배치: 줄 간격 10~11 ≥ 쪽지 전체 높이(끈 2.5 + 종이 7.25), 같은 줄 간격 ≥ 10 > 종이 폭 4.5 → 25개가 모두 걸려도 겹치지 않음
// (그림의 밤하늘에 걸치지 않도록 픽셀로 확인한 자리)
export const NOTE_W = 4.5, NOTE_H = 7.25, STRING = 2.5;
const GRID = [
  [49, [66, 77, 88]],
  [59, [50, 60, 70, 80, 90, 100, 110]],
  [70, [42, 52, 63, 80, 98, 109, 119]],
  [81, [36, 46, 57, 68, 92, 104, 115, 125]],
].flatMap(([y, xs]) => xs.map((x) => ({ x, y })));
// 걸리는 순서: 나무 가운데부터 시작해 이미 걸린 쪽지들과 가장 먼 자리를 차례로 → 쪽지가 몇 개뿐이어도 꼭대기에 몰리지 않고 나무 전체에 흩어짐
export const NOTE_SLOTS = (() => {
  const left = GRID.slice(), out = [];
  let next = left.reduce((a, b) => (Math.hypot(b.x - 80, b.y - 70) < Math.hypot(a.x - 80, a.y - 70) ? b : a));
  while (next) {
    out.push(next); left.splice(left.indexOf(next), 1);
    next = left.reduce((best, c) => { const d = Math.min(...out.map((o) => Math.hypot(c.x - o.x, (c.y - o.y) * 1.3))); return !best || d > best.d ? { c, d } : best; }, null)?.c;
  }
  return out;
})();

/** 나무에 보일 소원들(최신순, treeSeq 포함) → 쪽지 자리. 기본 자리 = (건 순서-1) % 25, 이미 찼으면 다음 빈자리 */
export function noteSlots(wishes) {
  const used = new Set(), out = [];
  for (const w of wishes.slice(0, TREE_NOTES)) {
    let slot = ((Number(w.treeSeq) || 1) - 1) % TREE_NOTES;
    while (used.has(slot)) slot = (slot + 1) % TREE_NOTES;
    used.add(slot); out.push({ slot, color: (Number(w.treeSeq) || 0) % 4, wishId: w.id }); // 크림·연노랑·연분홍·하늘색 차례로
  }
  return out;
}

// 크림·연노랑·연분홍·하늘색 종이 [바탕, 접힌 귀퉁이 그늘]
const PAPERS = [['#fff4da', '#e6d4ad'], ['#fff0a3', '#e3cf6e'], ['#ffd6df', '#e8aab8'], ['#cfe7ff', '#9fc4e8']];
const INK = '#4a2e22'; // 얇은 짙은 갈색 테두리·끈 매듭
/** 끈이 가지(x, y)에 묶이고, 그 아래로 접힌 종이가 살짝 내려와 걸린 쪽지 */
function drawNote(c, x, y, color) {
  const [paper, fold] = PAPERS[color % PAPERS.length];
  const L = x - NOTE_W / 2, T = y + STRING, R = L + NOTE_W, B = T + NOTE_H;
  rect(c, x - 0.5, y - 0.25, 1, 0.75, INK); // 가지에 묶인 매듭
  rect(c, x - 0.25, y + 0.5, 0.5, STRING - 0.5, '#f3ead2'); // 끈
  rect(c, L, T, NOTE_W, NOTE_H, INK); // 테두리 (0.5)
  rect(c, L + 0.5, T + 0.5, NOTE_W - 1, NOTE_H - 1, paper);
  // 오른쪽 위 귀퉁이를 접은 모양: 귀퉁이 칸(1.5)의 아래 왼쪽 반은 접혀 내려온 그늘 면, 대각선은 접힌 선
  const sx = R - 2, sy = T + 0.5;
  for (let j = 0; j < 6; j++) {
    rect(c, sx, sy + j * 0.25, j * 0.25, 0.25, fold);
    rect(c, sx + j * 0.25, sy + j * 0.25, 0.25, 0.25, INK);
    rect(c, sx + (j + 1) * 0.25, sy + j * 0.25, 1.5 - j * 0.25, 0.25, INK); // 접혀 사라진 위쪽 귀퉁이는 테두리색으로 또렷하게
  }
  // 글씨 줄 두 줄
  rect(c, L + 1, T + 2.75, NOTE_W - 2, 0.25, 'rgba(74,46,34,.45)');
  rect(c, L + 1, T + 4.25, NOTE_W - 2, 0.25, 'rgba(74,46,34,.45)');
  rect(c, L + 1, T + 5.75, NOTE_W - 2.75, 0.25, 'rgba(74,46,34,.45)');
}

export const park = {
  id: 'park',
  skyHeight: 64,
  background(c, ctx) {
    drawBackdrop(c, 'park');
    // 실제 사용자가 쓴 소원이 있을 때만 쪽지를 매담 (아무도 없으면 그림처럼 빈 가지)
    for (const n of ctx?.treeNotes || []) { const p = NOTE_SLOTS[n.slot]; if (p) drawNote(c, p.x, p.y, n.color); }
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
  // pad: 휴대폰은 종이 주변까지. 이웃 쪽지와 누를 영역이 겹치면 종이 가운데가 더 가까운 쪽지
  noteAt(ctx, x, y, pad = 0) {
    let best = null;
    for (const n of ctx?.treeNotes || []) {
      const p = NOTE_SLOTS[n.slot];
      if (!p || !n.wishId) continue;
      const cx = p.x, cy = p.y + STRING + NOTE_H / 2;
      if (Math.abs(x - cx) > NOTE_W / 2 + 0.5 + pad || y < p.y - 0.5 - pad || y > p.y + STRING + NOTE_H + pad) continue;
      const d = Math.hypot(x - cx, (y - cy) * 0.6);
      if (!best || d < best.d) best = { d, id: n.wishId };
    }
    return best?.id || null;
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
