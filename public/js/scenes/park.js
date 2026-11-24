import { rect, stars, glow, vgrad, bench, rng, disc } from '../render/pixel.js';

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
    // 걸린 소원 종이 (공개 소원 수에 따라)
    const tags = Math.min(ctx?.treeCount ?? 0, 18);
    const tr = rng(77);
    const colors = ['#ffcf6e', '#ff9fc0', '#9fe0ff', '#c4ffb0', '#f6ecd6'];
    for (let i = 0; i < tags; i++) {
      const x = 46 + Math.floor(tr() * 70), y = 46 + Math.floor(tr() * 46);
      rect(c, x, y - 3, 1, 3, '#d8d0b0'); rect(c, x - 1, y, 3, 6, colors[i % colors.length]);
    }
    // 입구
    rect(c, 300, 128, 4, 36, '#2a2f2c'); rect(c, 316, 128, 4, 36, '#2a2f2c'); rect(c, 298, 124, 24, 4, '#3a403c');
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
  hotspots: [
    { id: 'tree', x: 40, y: 26, w: 84, h: 128, label: '소원 나무' },
    { id: 'exit', x: 296, y: 120, w: 24, h: 46, label: '내 방으로' },
  ],
};
