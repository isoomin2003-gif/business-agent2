import { rect, stars, glow, vgrad, crescent, disc } from '../render/pixel.js';
import { isPlaying, cdAngle } from '../audio/roommusic.js';

// 책상 위 벽걸이 CD 플레이어 (가운데 둥근 CD는 animate에서 그려 재생 중에만 돌아감)
const CD = { x: 132, y: 31, w: 36, h: 26, cx: 150, cy: 44 };

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
    crescent(c, 76, 34, 5, '#fff1b8', '#1c2350'); // 초승달
    rect(c, 59, 24, 2, 52, '#3a2620'); rect(c, 28, 49, 64, 2, '#3a2620');
    rect(c, 18, 16, 14, 70, '#c4687a'); rect(c, 88, 16, 14, 70, '#c4687a'); // 커튼
    for (let y = 18; y < 86; y += 6) { rect(c, 22, y, 1, 4, '#a24f60'); rect(c, 95, y, 1, 4, '#a24f60'); }
    rect(c, 14, 14, 92, 3, '#5a3a26');
    // 벽걸이 CD 플레이어 (본체·스피커 망·걸이)
    rect(c, CD.x + 6, CD.y - 3, 2, 3, '#3a2a22'); rect(c, CD.x + CD.w - 8, CD.y - 3, 2, 3, '#3a2a22'); // 벽걸이 고리
    rect(c, CD.x, CD.y, CD.w, CD.h, '#1f1b26'); rect(c, CD.x + 1, CD.y + 1, CD.w - 2, CD.h - 2, '#3a3446');
    rect(c, CD.x + 1, CD.y + 1, CD.w - 2, 1, '#55506a'); // 윗면 빛
    for (const sx of [CD.x + 3, CD.x + CD.w - 8]) for (let yy = CD.y + 6; yy < CD.y + 20; yy += 2) for (let xx = 0; xx < 5; xx += 2) rect(c, sx + xx, yy, 1, 1, '#221e2b'); // 스피커 망
    disc(c, CD.cx, CD.cy, 10, '#26212f'); // CD가 들어가는 둥근 자리
    rect(c, CD.x + 3, CD.y + CD.h - 4, 4, 2, '#55506a'); rect(c, CD.x + 9, CD.y + CD.h - 4, 4, 2, '#55506a'); // 버튼
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
    // 1인용 책상 (아바타 폭 10px 기준 약 5배 너비). 상판은 앉은 아바타의 어깨~팔꿈치 높이
    rect(c, 124, 115, 52, 5, '#b07a4c'); rect(c, 124, 115, 52, 1, '#c98f5c'); // 상판 윗면 (깊이감)
    rect(c, 124, 120, 52, 2, '#6b4429'); // 상판 앞모서리
    rect(c, 127, 122, 46, 5, '#7a4e31'); rect(c, 152, 123, 18, 3, '#8f5c3a'); rect(c, 160, 124, 3, 1, '#e8c07a'); // 서랍
    rect(c, 125, 122, 3, 11, '#5a3a26'); rect(c, 172, 122, 3, 11, '#5a3a26'); // 다리
    // 상판 위: 펼친 노트(앉으면 손 앞), 머그, 작은 스탠드
    rect(c, 139, 116, 22, 3, '#f6ecd6'); rect(c, 150, 116, 1, 3, '#c9b28d'); rect(c, 141, 117, 7, 1, '#9b8a77'); rect(c, 152, 117, 7, 1, '#9b8a77');
    rect(c, 129, 112, 4, 4, '#7fb8d8'); rect(c, 133, 113, 1, 2, '#7fb8d8');
    rect(c, 166, 104, 1, 11, '#3c3c46'); rect(c, 163, 114, 7, 1, '#3c3c46'); rect(c, 161, 100, 11, 4, '#f2c66d'); rect(c, 162, 104, 9, 1, '#fff2c0');
  },
  animate(c, t) {
    // CD: 재생 중에는 천천히 돌고(무지갯빛 반사·라벨 표시가 함께 회전), 멈추면 그 자리에서 정지
    const on = isPlaying(), a = cdAngle();
    disc(c, CD.cx, CD.cy, 8, '#aeb4c2'); disc(c, CD.cx, CD.cy, 7, '#d6dae4');
    for (let r = 3; r <= 7; r++) {
      for (const [da, col] of [[0, '#9fd8ff'], [Math.PI, '#ffc4e8'], [Math.PI / 2, '#fff3b0']]) {
        const k = r === 7 ? 0.08 : 0;
        rect(c, Math.round(CD.cx + Math.cos(a + da + k) * r), Math.round(CD.cy + Math.sin(a + da + k) * r), 1, 1, col);
      }
    }
    disc(c, CD.cx, CD.cy, 3, '#e06c75');
    rect(c, Math.round(CD.cx + Math.cos(a) * 2), Math.round(CD.cy + Math.sin(a) * 2), 1, 1, '#ffe0e4'); // 라벨 무늬
    rect(c, CD.cx, CD.cy, 1, 1, '#1f1b26'); // 가운데 구멍
    // 전원 표시등 + 재생 중이면 음표가 피어오름
    rect(c, CD.x + CD.w - 6, CD.y + CD.h - 4, 2, 2, on ? '#7ee08a' : '#6a3a3a');
    if (on) {
      glow(c, CD.x + CD.w - 5, CD.y + CD.h - 3, 5, '126,224,138', 0.5);
      for (let i = 0; i < 2; i++) {
        const k = ((t / 2200) + i * 0.5) % 1;
        const nx = CD.x + CD.w + 2 + Math.sin(k * 6 + i) * 3, ny = CD.y + 18 - k * 22;
        c.globalAlpha = 1 - k;
        rect(c, Math.round(nx), Math.round(ny), 2, 2, '#ffe39a'); rect(c, Math.round(nx) + 1, Math.round(ny) - 4, 1, 4, '#ffe39a'); rect(c, Math.round(nx) + 2, Math.round(ny) - 4, 1, 1, '#ffe39a');
        c.globalAlpha = 1;
      }
    }
    // 책상 조명의 따뜻한 빛
    const flick = 0.33 + Math.sin(t / 900) * 0.02;
    glow(c, 166, 106, 56, '255,200,120', flick);
    glow(c, 60, 50, 50, '120,140,255', 0.08);
  },
  props: [
    { y: 127, draw(c) { // 의자 (책상 가운데, 앉은 아바타의 허리 아래를 등받이가 가림)
      rect(c, 143, 118, 2, 10, '#5a3a26'); rect(c, 155, 118, 2, 10, '#5a3a26'); // 등받이 기둥
      rect(c, 143, 118, 14, 2, '#8a5a3c'); rect(c, 143, 122, 14, 2, '#8a5a3c'); // 등받이 가로대
      rect(c, 142, 126, 16, 2, '#6d4a32'); // 좌판
      rect(c, 143, 128, 2, 7, '#4a2f20'); rect(c, 155, 128, 2, 7, '#4a2f20'); // 다리
    } },
  ],
  hotspots: [
    { id: 'desk', x: 122, y: 98, w: 56, h: 38, label: '다이어리 쓰기' },
    { id: 'shelf', x: 208, y: 30, w: 60, h: 98, label: '내 책장' },
    { id: 'door', x: 274, y: 44, w: 38, h: 70, label: '밖으로 나가기' },
    { id: 'cd', x: CD.x - 2, y: CD.y - 4, w: CD.w + 4, h: CD.h + 6, get label() { return isPlaying() ? '음악 끄기' : '음악 틀기'; } },
  ],
};
