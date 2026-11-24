import { rect, stars, glow, vgrad, bench, rng, crescent } from '../render/pixel.js';

const NEON = ['255,95,170', '90,225,255', '255,214,110', '170,120,255'];

export const rooftop = {
  id: 'rooftop',
  skyHeight: 96,
  background(c) {
    vgrad(c, 0, 0, 320, 100, [[30, 18, 66], [58, 30, 98], [96, 46, 120]]);
    stars(c, 320, 60, 70, 21, '#e9e2ff');
    glow(c, 266, 20, 18, '255,240,200', 0.18); crescent(c, 266, 20, 7, '#fff0c8', 'rgb(32,19,70)'); // 달
    // 먼 빌딩
    const r = rng(5);
    for (let x = 0; x < 320;) {
      const w = 10 + Math.floor(r() * 16), h = 24 + Math.floor(r() * 40);
      rect(c, x, 100 - h, w, h, '#2a1d4f');
      x += w + 1;
    }
    // 가까운 빌딩 + 창문
    const r2 = rng(11);
    for (let x = -4; x < 320;) {
      const w = 18 + Math.floor(r2() * 22), h = 18 + Math.floor(r2() * 34);
      rect(c, x, 100 - h, w, h, '#1b1438');
      for (let wy = 100 - h + 4; wy < 96; wy += 5) for (let wx = x + 3; wx < x + w - 3; wx += 4) {
        if (r2() < 0.42) rect(c, wx, wy, 2, 2, r2() < 0.7 ? '#ffd98a' : '#9fd8ff');
      }
      x += w + 2;
    }
    // 네온 간판 자리
    rect(c, 36, 52, 30, 10, '#120c26'); rect(c, 150, 44, 22, 14, '#120c26'); rect(c, 214, 58, 34, 9, '#120c26');
    // 난간
    rect(c, 0, 100, 320, 8, '#1a1530');
    for (let x = 0; x < 320; x += 10) rect(c, x, 96, 2, 14, '#5a5378');
    rect(c, 0, 95, 320, 2, '#8a82ad'); rect(c, 0, 104, 320, 1, '#5a5378');
    // 바닥 타일
    rect(c, 0, 110, 320, 70, '#3a3352');
    for (let y = 110; y < 180; y += 10) rect(c, 0, y, 320, 1, '#2e2844');
    for (let y = 110, i = 0; y < 180; y += 10, i++) for (let x = (i % 2) * 10; x < 320; x += 20) rect(c, x, y, 1, 10, '#2e2844');
    // 계단실(입구)
    rect(c, 272, 66, 48, 78, '#2b2540'); rect(c, 270, 62, 52, 5, '#4a4266');
    rect(c, 284, 98, 24, 44, '#5b4a7a'); rect(c, 287, 101, 18, 38, '#6d5a90'); rect(c, 302, 120, 2, 3, '#ffd36e');
    rect(c, 290, 84, 12, 8, '#73e3ff'); rect(c, 291, 85, 10, 6, '#2b2540'); rect(c, 293, 87, 6, 2, '#73e3ff'); // EXIT 표지
    // 벤치 두 개
    bench(c, 40, 84, 124, '#9a6a8a', '#5e3d58');
    bench(c, 140, 84, 124, '#9a6a8a', '#5e3d58');
    // 화분
    rect(c, 6, 120, 12, 10, '#6b4a6a'); rect(c, 8, 108, 3, 12, '#3f7a6a'); rect(c, 4, 106, 8, 5, '#4fa38a'); rect(c, 10, 102, 7, 6, '#5fbf9f');
    // 라디오 + 상자
    rect(c, 236, 122, 28, 16, '#7a5a3c'); rect(c, 236, 126, 28, 1, '#5a3a26'); rect(c, 236, 132, 28, 1, '#5a3a26');
    rect(c, 238, 106, 24, 16, '#d0596f'); rect(c, 240, 108, 9, 9, '#3a2030'); rect(c, 241, 109, 7, 7, '#5a3048');
    rect(c, 251, 109, 9, 3, '#ffe9b0'); rect(c, 252, 114, 2, 2, '#fff'); rect(c, 256, 114, 2, 2, '#fff');
    rect(c, 258, 96, 1, 10, '#ccc'); rect(c, 240, 104, 20, 2, '#a43f55');
    // 전구 줄
    for (let x = 0; x < 320; x += 2) { const y = 12 + Math.round(Math.sin(x / 320 * Math.PI * 3) * 4 + 4); rect(c, x, y, 2, 1, '#2a2440'); }
  },
  animate(c, t, s) {
    // 네온 깜빡임
    const signs = [[36, 52, 30, 10, 0], [150, 44, 22, 14, 1], [214, 58, 34, 9, 2]];
    signs.forEach(([x, y, w, h, k], i) => {
      const on = Math.sin(t / (500 + i * 170) + i) > -0.85;
      const col = NEON[k];
      if (on) {
        glow(c, x + w / 2, y + h / 2, 22, col, 0.35);
        c.fillStyle = `rgb(${col})`;
        c.fillRect(x + 2, y + 2, w - 4, 1); c.fillRect(x + 2, y + h - 3, w - 4, 1); c.fillRect(x + 2, y + 2, 1, h - 4); c.fillRect(x + w - 3, y + 2, 1, h - 4);
        for (let k2 = 0; k2 < (w - 8) / 4; k2++) c.fillRect(x + 4 + k2 * 4, y + h / 2 - 1, 2, 2);
      }
    });
    // 전구
    for (let x = 8; x < 320; x += 20) {
      const y = 12 + Math.round(Math.sin(x / 320 * Math.PI * 3) * 4 + 4) + 2;
      const on = Math.sin(t / 700 + x) > -0.6;
      rect(c, x, y, 2, 2, on ? '#ffe39a' : '#8a7a5a');
      if (on) glow(c, x + 1, y + 1, 6, '255,220,140', 0.25);
    }
    // 라디오 음표
    if (s?.radioPlaying) {
      for (let i = 0; i < 2; i++) {
        const p = ((t / 1800) + i * 0.5) % 1;
        const x = 250 + Math.sin(p * 6 + i) * 6, y = 102 - p * 22;
        c.globalAlpha = 1 - p;
        rect(c, x, y, 2, 2, '#ffd36e'); rect(c, x + 2, y - 4, 1, 5, '#ffd36e'); rect(c, x + 2, y - 4, 2, 1, '#ffd36e');
        c.globalAlpha = 1;
      }
      glow(c, 255, 110, 12, '255,214,110', 0.25 + Math.sin(t / 200) * 0.05);
    }
  },
  props: [],
  hotspots: [
    { id: 'radio', x: 232, y: 92, w: 36, h: 48, label: '라디오' },
    { id: 'exit', x: 282, y: 96, w: 28, h: 48, label: '내 방으로' },
  ],
};
