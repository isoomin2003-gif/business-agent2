// 옥상: 확정 배경 그림(고양이 전광판, 벤치 두 개, 수납장 위 작은 라디오, 계단실 문) 위에 기능을 연결
import { rect, glow } from '../render/pixel.js';
import { drawBackdrop } from '../render/backdrops.js';

export const rooftop = {
  id: 'rooftop',
  skyHeight: 58, // 별똥별은 빌딩 위로 열린 밤하늘(대략 y 4~58)만 지나감
  background(c) { drawBackdrop(c, 'rooftop'); },
  animate(c, t, s) {
    // 고양이 전광판이 은은하게 깜빡임
    glow(c, 58, 75, 22, '230,170,255', 0.06 + (Math.sin(t / 600) + 1) * 0.03);
    // 라디오가 나오는 동안: 다이얼 불빛 + 음표
    if (s?.radioPlaying) {
      glow(c, 241, 100, 9, '255,214,110', 0.3 + Math.sin(t / 200) * 0.06);
      for (let i = 0; i < 2; i++) {
        const p = ((t / 1800) + i * 0.5) % 1;
        const x = 244 + Math.sin(p * 6 + i) * 6, y = 92 - p * 22;
        c.globalAlpha = 1 - p;
        rect(c, x, y, 2, 2, '#ffd36e'); rect(c, x + 2, y - 4, 1, 5, '#ffd36e'); rect(c, x + 2, y - 4, 2, 1, '#ffd36e');
        c.globalAlpha = 1;
      }
    }
  },
  props: [],
  hotspots: [
    { id: 'radio', x: 223, y: 86, w: 38, h: 46, label: '라디오' }, // 수납장 위 작은 라디오 (+수납장)
    { id: 'exit', x: 280, y: 70, w: 34, h: 62, label: '내 방으로' }, // 계단실 문
  ],
};
