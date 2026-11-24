import { rect, stars, glow, vgrad } from '../render/pixel.js';

export const room = {
  id: 'room',
  background(c, ctx) {
    // 벽: 따뜻한 밤의 방
    vgrad(c, 0, 0, 320, 112, [[74, 50, 58], [92, 62, 66], [104, 72, 70]]);
    for (let x = 6; x < 320; x += 16) rect(c, x, 0, 1, 112, 'rgba(255,220,180,.05)');
    rect(c, 0, 108, 320, 4, '#4a3030');
    // 바닥 나무
    rect(c, 0, 112, 320, 68, '#7a5238');
    for (let y = 118; y < 180; y += 9) rect(c, 0, y, 320, 1, '#5f3e2b');
    for (let y = 112, i = 0; y < 180; y += 9, i++) for (let x = (i % 2) * 24; x < 320; x += 48) rect(c, x, y, 1, 9, '#5f3e2b');
    // 러그
    rect(c, 176, 140, 96, 30, '#9c4a5a'); rect(c, 180, 143, 88, 24, '#b45d6c');
    for (let x = 184; x < 264; x += 8) rect(c, x, 154, 4, 2, '#e8b77a');
    // 창문 (밤하늘)
    rect(c, 24, 20, 72, 60, '#3a2620');
    rect(c, 28, 24, 64, 52, '#1c2350');
    stars(c, 64, 52, 0, 1);
    c.save(); c.translate(28, 24); stars(c, 64, 52, 24, 9, '#fff6d0'); c.restore();
    rect(c, 72, 30, 6, 9, '#fff1b8'); rect(c, 71, 31, 1, 7, '#fff1b8'); rect(c, 75, 31, 4, 7, '#1c2350'); // 초승달
    rect(c, 59, 24, 2, 52, '#3a2620'); rect(c, 28, 49, 64, 2, '#3a2620');
    rect(c, 18, 16, 14, 70, '#c4687a'); rect(c, 88, 16, 14, 70, '#c4687a'); // 커튼
    for (let y = 18; y < 86; y += 6) { rect(c, 22, y, 1, 4, '#a24f60'); rect(c, 95, y, 1, 4, '#a24f60'); }
    rect(c, 14, 14, 92, 3, '#5a3a26');
    // 액자
    rect(c, 122, 36, 26, 20, '#5a3a26'); rect(c, 125, 39, 20, 14, '#7fb8a8'); rect(c, 125, 47, 20, 6, '#4f8a6a'); rect(c, 138, 41, 4, 4, '#ffe08a');
    // 책장
    rect(c, 210, 32, 56, 94, '#5a3a26'); rect(c, 214, 36, 48, 86, '#3e281b');
    for (const sy of [36, 64, 92]) rect(c, 214, sy + 26, 48, 3, '#6d4a32');
    const books = ctx?.bookCount ?? 0;
    const palette = ['#e06c75', '#61afef', '#98c379', '#e5c07b', '#c678dd', '#56b6c2', '#ff9b6b', '#d19a66'];
    let n = 0;
    for (const sy of [36, 64, 92]) {
      let bx = 216;
      for (let i = 0; i < 8; i++) {
        const deco = n >= books;
        const w = 5 + ((i * 7 + sy) % 3);
        const h = 18 + ((i * 5 + sy) % 6);
        if (bx + w > 260) break;
        rect(c, bx, sy + 26 - h, w, h, deco ? ['#6b5544', '#7a604a', '#5e4a3c'][i % 3] : palette[n % palette.length]);
        if (!deco) rect(c, bx + 1, sy + 26 - h + 3, w - 2, 1, 'rgba(255,255,255,.6)');
        bx += w + 1; if (!deco) n++;
      }
    }
    // 화분
    rect(c, 6, 108, 14, 12, '#b0683a'); rect(c, 4, 106, 18, 3, '#c97a46');
    rect(c, 11, 92, 3, 15, '#3f7a4a'); rect(c, 5, 94, 7, 5, '#57a564'); rect(c, 13, 88, 8, 6, '#57a564'); rect(c, 8, 84, 6, 6, '#6cc27a');
    // 문
    rect(c, 276, 46, 34, 66, '#3e281b'); rect(c, 279, 49, 28, 63, '#8a5a3c');
    rect(c, 282, 53, 22, 24, '#9c6a48'); rect(c, 282, 82, 22, 26, '#9c6a48'); rect(c, 300, 80, 3, 3, '#ffd36e');
    // 책상
    rect(c, 108, 96, 88, 5, '#a46d45'); rect(c, 108, 101, 88, 2, '#6b4429');
    rect(c, 112, 103, 80, 24, '#7a4e31'); rect(c, 116, 107, 30, 8, '#8f5c3a'); rect(c, 129, 110, 4, 2, '#e8c07a');
    rect(c, 112, 126, 4, 10, '#5a3a26'); rect(c, 188, 126, 4, 10, '#5a3a26');
    // 책상 위: 스탠드, 펼친 노트, 머그
    rect(c, 176, 76, 2, 20, '#3c3c46'); rect(c, 168, 72, 16, 6, '#f2c66d'); rect(c, 170, 77, 12, 1, '#fff2c0'); rect(c, 172, 94, 10, 2, '#3c3c46');
    rect(c, 132, 90, 26, 6, '#f6ecd6'); rect(c, 144, 90, 1, 6, '#c9b28d'); rect(c, 135, 92, 7, 1, '#9b8a77'); rect(c, 147, 92, 8, 1, '#9b8a77');
    rect(c, 118, 89, 6, 7, '#7fb8d8'); rect(c, 124, 91, 2, 3, '#7fb8d8');
  },
  animate(c, t) {
    // 책상 조명의 따뜻한 빛
    const flick = 0.33 + Math.sin(t / 900) * 0.02;
    glow(c, 176, 84, 70, '255,200,120', flick);
    glow(c, 60, 50, 50, '120,140,255', 0.08);
  },
  props: [
    { y: 131, draw(c) { // 의자 (앉은 아바타 위로 등받이가 겹침)
      rect(c, 141, 128, 18, 4, '#6d4a32'); rect(c, 141, 112, 3, 20, '#5a3a26'); rect(c, 156, 112, 3, 20, '#5a3a26');
      rect(c, 141, 112, 18, 3, '#8a5a3c'); rect(c, 141, 118, 18, 2, '#8a5a3c');
      rect(c, 142, 132, 2, 8, '#4a2f20'); rect(c, 156, 132, 2, 8, '#4a2f20');
    } },
  ],
  hotspots: [
    { id: 'desk', x: 106, y: 70, w: 90, h: 70, label: '다이어리 쓰기' },
    { id: 'shelf', x: 208, y: 30, w: 60, h: 98, label: '내 책장' },
    { id: 'door', x: 274, y: 44, w: 38, h: 70, label: '밖으로 나가기' },
  ],
};
