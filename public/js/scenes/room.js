// 내 방: 확정 배경 그림(장밋빛 벽, 창문, 벽걸이 CD 플레이어, '주간신문' 꽂이, 책상과 의자, 책장 12권, 올리브색 문, 러그) 위에 기능을 연결
import { rect, glow } from '../render/pixel.js';
import { drawBackdrop, redrawParts, drawRotatedDisc, drawColoredBooks } from '../render/backdrops.js';
import { isPlaying, cdAngle } from '../audio/roommusic.js';

// 그림 속 CD 플레이어(창문 바로 오른쪽): 몸체·CD 중심·반지름 (320×180 좌표)
const CD = { x: 104, y: 57, w: 24, h: 23, cx: 115.5, cy: 67, r: 8.2 };

export const room = {
  id: 'room',
  background(c, ctx) {
    drawBackdrop(c, 'room');
    drawColoredBooks(c, ctx?.bookCount || 0); // 기록 하나마다 책등 하나에 색
  },
  animate(c, t) {
    // CD: 재생 중에는 그림 속 CD가 천천히 돌고, 멈추면 그 각도에서 정지
    const on = isPlaying();
    drawRotatedDisc(c, 'room', CD.cx, CD.cy, CD.r, cdAngle());
    if (on) {
      glow(c, CD.x + CD.w - 3, CD.y + CD.h - 4, 4, '126,224,138', 0.6); // 재생 표시등
      rect(c, CD.x + CD.w - 4, CD.y + CD.h - 5, 1, 1, '#7ee08a');
      for (let i = 0; i < 2; i++) { // 피어오르는 음표
        const k = ((t / 2200) + i * 0.5) % 1;
        const nx = CD.x + CD.w + 3 + Math.sin(k * 6 + i) * 3, ny = CD.y + 12 - k * 22;
        c.globalAlpha = 1 - k;
        rect(c, Math.round(nx), Math.round(ny), 2, 2, '#ffe39a'); rect(c, Math.round(nx) + 1, Math.round(ny) - 4, 1, 4, '#ffe39a'); rect(c, Math.round(nx) + 2, Math.round(ny) - 4, 1, 1, '#ffe39a');
        c.globalAlpha = 1;
      }
    }
    // 책상 스탠드의 따뜻한 빛이 아주 조금 일렁임
    glow(c, 164, 100, 30, '255,200,120', 0.06 + Math.sin(t / 900) * 0.02);
  },
  // 의자는 책상을 향해 놓여 있어(등받이가 화면 쪽) 앉은 아바타 앞으로 등받이 기둥·가로대를 다시 그림
  props: [
    { y: 133, draw(c) { redrawParts(c, 'room', [[138.6, 115.5, 3.4, 25.5], [153.4, 115.5, 3.4, 25.5], [141.8, 120.3, 11.8, 2.4], [141.8, 129.6, 11.8, 2.2]]); } },
  ],
  hotspots: [
    { id: 'cd', x: CD.x - 3, y: CD.y - 3, w: CD.w + 6, h: CD.h + 18, get label() { return isPlaying() ? '음악 끄기' : '음악 틀기'; } },
    { id: 'news', x: 146, y: 52, w: 38, h: 34, label: '주간신문' }, // CD 플레이어와 책장 사이 벽의 신문꽂이
    { id: 'desk', x: 120, y: 92, w: 57, h: 50, label: '다이어리 쓰기' },
    { id: 'shelf', x: 205, y: 30, w: 60, h: 100, label: '내 책장' },
    { id: 'door', x: 270, y: 42, w: 42, h: 86, label: '밖으로 나가기' }, // 올리브색 문
  ],
};
