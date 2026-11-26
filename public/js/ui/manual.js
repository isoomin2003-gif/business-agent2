// 사용 설명서(레트로 게임 설명서처럼 펼친 책)와 상점 화면
// - 왼쪽: 밤에 불 켜진 창을 수놓은 듯한 표지 / 오른쪽: 한 쪽에 한 주제, 실제로 클릭할 물건 그림 + 짧은 사용법
// - 아래 화살표로 넘기거나 오른쪽 책갈피(내 방 → 옥상 → 공원 → 상점)로 바로 이동
// - 물건 그림은 실제 장면을 그리는 코드로 그린 뒤 잘라 써서, 화면에서 보는 모습과 똑같음
import { openModal } from './modal.js';
import { iconSvg } from '../render/icons.js';
import { rect, disc, glow, rng, stars } from '../render/pixel.js';
import { room } from '../scenes/room.js';
import { rooftop } from '../scenes/rooftop.js';
import { park } from '../scenes/park.js';
import { SCALE, ready as backdropsReady } from '../render/backdrops.js';
import { composeLimitText, WISH_TTL_DAYS, TREE_NOTES } from '../shared/limits.js';

const SCENES = { room: [room, {}], rooftop: [rooftop, {}], park: [park, {}] };
const rendered = {};
function sceneCanvas(id) {
  if (rendered[id]) return rendered[id];
  const [scene, ctx] = SCENES[id];
  const cv = document.createElement('canvas'); cv.width = 320 * SCALE; cv.height = 180 * SCALE;
  const c = cv.getContext('2d');
  c.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  scene.background(c, ctx);
  scene.animate?.(c, 0, {});
  for (const p of scene.props || []) p.draw(c);
  rendered[id] = cv;
  return cv;
}
/** 장면의 한 부분을 잘라 픽셀 그대로 확대한 그림 */
function crop(id, r, height = 64) {
  const cv = document.createElement('canvas'); cv.width = r.w * SCALE; cv.height = r.h * SCALE;
  cv.getContext('2d').drawImage(sceneCanvas(id), r.x * SCALE, r.y * SCALE, r.w * SCALE, r.h * SCALE, 0, 0, cv.width, cv.height);
  cv.className = 'm-pic';
  const k = height / r.h;
  cv.style.width = `${Math.round(r.w * k)}px`; cv.style.height = `${Math.round(r.h * k)}px`;
  return cv;
}
const svgPic = (name, size = 56) => { const d = document.createElement('div'); d.className = 'm-pic m-svg'; d.innerHTML = iconSvg(name, size); return d; };

const PAGES = [
  {
    id: 'room', tab: 'house', title: '내 방',
    lead: '빈 바닥을 클릭하면 걸어가요. 사용하고 싶은 물건을 클릭해 보세요.',
    items: [
      [() => crop('room', { x: 118, y: 90, w: 60, h: 52 }, 64), '책상', '오늘의 일기 쓰기 (AI와 짧은 대화 후, 사진이나 영상 하나 + 한 문장)'],
      [() => crop('room', { x: 204, y: 30, w: 62, h: 100 }, 80), '책장', '지난 일기 보기 · 기억 찾기'],
      [() => crop('room', { x: 100, y: 53, w: 32, h: 44 }, 72), 'CD 플레이어', '한 번 클릭하면 켜지고, 다시 클릭하면 꺼져요'],
      [() => crop('room', { x: 144, y: 50, w: 42, h: 38 }, 56), '주간신문', '신문꽂이를 누르면 신문 가판대가 열려요. 매주 일요일 저녁 6시에 나만의 기사가 한 편씩 실려요'],
      [() => crop('room', { x: 268, y: 42, w: 46, h: 86 }, 72), '문', '옥상이나 공원으로 나가기'],
    ],
  },
  {
    id: 'rooftop', tab: 'radio', title: '옥상',
    lead: '문을 누르고 옥상을 고르면 와요. 다른 사람과 같은 음악을 들으며 쉬어요.',
    items: [
      [() => crop('rooftop', { x: 66, y: 100, w: 66, h: 34 }, 48), '벤치', '빈자리를 클릭하면 가서 앉아요'],
      [() => crop('rooftop', { x: 220, y: 84, w: 42, h: 48 }, 64), '라디오', `지금 나오는 곡 · 곡 신청(한 사람당 한 번에 한 곡) · 새 노래 추천 · 작곡<small>${composeLimitText()}<br>완성된 곡은 ‘내가 만든 노래’에 자동으로 저장돼요.</small>`],
      [() => svgPic('chat'), '말하기', '화면 아래 입력창에 한마디 (50자까지)'],
      [() => crop('rooftop', { x: 276, y: 66, w: 42, h: 66 }, 72), '계단실 문', '내 방으로 돌아가기'],
    ],
  },
  {
    id: 'park', tab: 'tree', title: '공원',
    lead: '조용한 밤 산책길이에요. 걸으면 발소리, 가만히 있으면 풀벌레와 바람 소리가 들려요.',
    items: [
      [() => crop('park', { x: 140, y: 108, w: 118, h: 32 }, 36), '긴 벤치', '빈자리를 클릭하면 앉아서 쉬어요 (5자리)'],
      [() => crop('park', { x: 20, y: 40, w: 122, h: 106 }, 84), '소원 나무', `소원 쓰기 · 소원 모아보기 · 공감과 응원 · 걸린 쪽지를 눌러 읽기<small>소원은 ${WISH_TTL_DAYS}일 동안 공원에 머물러요. 나무에는 최근 ${TREE_NOTES}개까지 걸려요.</small>`],
      [() => svgPic('star'), '별똥별', '지나가면 ‘소원 빌기’ 버튼이 잠깐 떠요'],
      [() => crop('park', { x: 288, y: 108, w: 32, h: 44 }, 64), '집 모양 표지판', '내 방으로 돌아가기'],
    ],
  },
  {
    id: 'shop', tab: 'shop', title: '상점',
    lead: '화면 오른쪽 위의 가판대 버튼을 누르면 상점이 열려요.',
    items: [
      [() => svgPic('shop', 64), '가판대 버튼', '상점 열기'],
    ],
    note: '상점은 아직 준비 중이에요. 지금은 둘러볼 물건이 없어요.',
  },
];
export const MANUAL_PAGES = PAGES.map((p) => p.title);

/** 표지: 짙은 청록 천에 수놓은 듯한 밤 창문, 꽃 덩굴 고리, 금색 모서리 */
function drawCover(cv) {
  const W = 120, H = 168;
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  rect(c, 0, 0, W, H, '#1d3a3b');
  for (let y = 0; y < H; y += 2) for (let x = (y / 2) % 2; x < W; x += 2) rect(c, x, y, 1, 1, '#21423f'); // 천 결
  for (let x = 6; x < W - 6; x += 4) { rect(c, x, 5, 2, 1, '#cdbf9f'); rect(c, x, H - 6, 2, 1, '#cdbf9f'); } // 바느질 선
  for (let y = 6; y < H - 6; y += 4) { rect(c, 5, y, 1, 2, '#cdbf9f'); rect(c, W - 6, y, 1, 2, '#cdbf9f'); }
  for (const [x, y, sx, sy] of [[0, 0, 1, 1], [W - 1, 0, -1, 1], [0, H - 1, 1, -1], [W - 1, H - 1, -1, -1]]) { // 금색 모서리
    for (let i = 0; i < 8; i++) { rect(c, x + sx * i, y, 1, 1, '#d8b25a'); rect(c, x, y + sy * i, 1, 1, '#d8b25a'); }
    rect(c, x + sx * 2, y + sy * 2, 1, 1, '#a8853c');
  }
  const flower = (x, y, col = '#e0899a') => { rect(c, x, y - 1, 1, 1, col); rect(c, x - 1, y, 3, 1, col); rect(c, x, y + 1, 1, 1, col); rect(c, x, y, 1, 1, '#ffe08a'); };
  for (const x of [18, 40, 60, 80, 102]) { flower(x, 14); flower(x, H - 15); }
  for (let x = 12; x < W - 12; x += 3) { rect(c, x, 17, 1, 1, '#6f9a5c'); rect(c, x, H - 18, 1, 1, '#6f9a5c'); }
  // 둥근 창 안의 밤 풍경
  const cx = 60, cy = 80, R = 40;
  const sky = document.createElement('canvas'); sky.width = W; sky.height = H;
  const s = sky.getContext('2d');
  const g = s.createLinearGradient(0, cy - R, 0, cy + R); g.addColorStop(0, '#1a1f45'); g.addColorStop(1, '#3a3462'); s.fillStyle = g; s.fillRect(0, 0, W, H);
  s.save(); s.translate(cx - R, cy - R); stars(s, 2 * R, R, 14, 5, '#fff3c8'); s.restore();
  disc(s, cx + 20, cy - 22, 5, '#f6e6b0'); glow(s, cx + 20, cy - 22, 12, '255,240,190', 0.25);
  const r2 = rng(3); for (let x = cx - R; x < cx + R; x += 5) { const h = 10 + Math.floor(r2() * 14); rect(s, x, cy + 18 - h, 6, h + 30, '#2a2546'); if (r2() < 0.5) rect(s, x + 2, cy + 22 - h, 2, 2, '#ffd36e'); }
  rect(s, cx - 34, cy - 18, 34, 60, '#5d5470'); rect(s, cx - 34, cy - 21, 36, 4, '#3e3850'); // 건물 벽
  rect(s, cx - 29, cy - 8, 24, 22, '#3e2a24'); rect(s, cx - 27, cy - 6, 20, 18, '#ffcf7a'); // 불 켜진 창
  rect(s, cx - 27, cy - 6, 5, 18, '#f2b6a0'); rect(s, cx - 12, cy - 6, 5, 18, '#f2b6a0'); rect(s, cx - 18, cy - 6, 1, 18, '#3e2a24');
  rect(s, cx - 20, cy + 1, 5, 4, '#fff2c0'); rect(s, cx - 18, cy + 5, 1, 4, '#8a5a3c'); // 스탠드
  rect(s, cx - 10, cy + 6, 3, 3, '#2a1d2a'); rect(s, cx - 10, cy + 5, 1, 1, '#2a1d2a'); rect(s, cx - 8, cy + 5, 1, 1, '#2a1d2a'); // 고양이
  rect(s, cx - 30, cy + 14, 26, 2, '#7a6a80'); rect(s, cx - 28, cy + 11, 6, 3, '#4f8a4a'); rect(s, cx - 27, cy + 16, 1, 6, '#4f8a4a'); // 창턱 화분
  for (let x = cx - R; x < cx + R; x += 4) disc(s, x, cy + 34 + ((x * 7) % 5), 5, '#2f5a38'); // 나무 덤불
  c.save(); c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.clip(); c.drawImage(sky, 0, 0); c.restore();
  // 꽃 덩굴 고리
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2, x = Math.round(cx + Math.cos(a) * (R + 3)), y = Math.round(cy + Math.sin(a) * (R + 3));
    rect(c, x, y, 1, 1, '#6f9a5c');
    if (i % 3 === 0) rect(c, x + (Math.cos(a) > 0 ? 1 : -1), y, 1, 1, '#8fbf6c');
  }
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.3; flower(Math.round(cx + Math.cos(a) * (R + 3)), Math.round(cy + Math.sin(a) * (R + 3)), i % 2 ? '#e0899a' : '#f2b6c4'); }
  // 리본
  const by = cy + R + 4;
  for (const [dx, dy] of [[-4, -1], [-3, -1], [-3, 0], [-2, 0], [-4, 1], [-3, 1], [3, -1], [4, -1], [2, 0], [3, 0], [3, 1], [4, 1], [-1, 2], [-2, 3], [1, 2], [2, 3]]) rect(c, cx + dx, by + dy, 1, 1, '#d9707e');
  rect(c, cx - 1, by - 1, 2, 2, '#b8505e');
  c.font = '12px Galmuri11'; c.fillStyle = '#e8d9b0'; c.textAlign = 'center'; c.fillText('하루 한 장', cx, 150);
}

export async function openManual(start = 0) {
  await backdropsReady; // 물건 그림은 배경 그림에서 잘라 씀
  let page = Math.max(0, Math.min(PAGES.length - 1, start));
  const m = openModal({
    label: '사용 설명서', cls: 'manual-modal',
    html: `<div class="manual">
      <div class="m-cover"><canvas aria-hidden="true"></canvas></div>
      <section class="m-page" aria-live="polite"></section>
      <nav class="m-tabs" aria-label="설명서 쪽 고르기">${PAGES.map((p, i) => `<button class="m-tab m-tab-${p.id}" data-i="${i}" title="${i + 1}쪽 ${p.title}" aria-label="${i + 1}쪽 ${p.title}">${iconSvg(p.tab, 28)}</button>`).join('')}</nav>
    </div>`,
  });
  drawCover(m.$('.m-cover canvas'));
  const show = (i) => {
    page = (i + PAGES.length) % PAGES.length;
    const p = PAGES[page];
    const el = m.$('.m-page');
    // 쪽마다 글 양이 달라도 책 크기·버튼 위치는 그대로: 본문(m-scroll)만 안에서 스크롤
    el.innerHTML = `<div class="m-deco" aria-hidden="true"></div><h2 class="m-title">${p.title}</h2><div class="m-rule" aria-hidden="true"><i></i></div>
      <div class="m-scroll" tabindex="0" aria-label="${p.title} 설명"><p class="m-lead">${p.lead}</p><ul class="m-items"></ul>${p.note ? `<p class="m-note">${p.note}</p>` : ''}</div>
      <div class="m-foot"><button class="m-arrow" data-prev aria-label="이전 쪽">←</button><span class="m-num">${page + 1} / ${PAGES.length}</span><button class="m-arrow" data-next aria-label="다음 쪽">→</button></div>`;
    const ul = el.querySelector('.m-items');
    for (const [pic, name, text] of p.items) {
      const li = document.createElement('li');
      const fig = document.createElement('div'); fig.className = 'm-fig'; fig.appendChild(pic());
      const t = document.createElement('p'); t.innerHTML = `<b>${name}</b> · ${text}`;
      li.append(fig, t); ul.appendChild(li);
    }
    el.querySelector('[data-prev]').addEventListener('click', () => show(page - 1));
    el.querySelector('[data-next]').addEventListener('click', () => show(page + 1));
    m.$$('.m-tab').forEach((b) => { const on = Number(b.dataset.i) === page; b.classList.toggle('on', on); b.setAttribute('aria-current', on ? 'page' : 'false'); });
  };
  m.$$('.m-tab').forEach((b) => b.addEventListener('click', () => show(Number(b.dataset.i))));
  m.el.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') show(page + 1); if (e.key === 'ArrowLeft') show(page - 1); });
  m.el.tabIndex = -1; m.el.focus();
  show(page);
  m.page = () => page;
  return m;
}

export function openShop({ onManual } = {}) {
  const m = openModal({
    title: '상점', label: '상점', cls: 'shop-modal',
    html: `<div class="shop-stall">${iconSvg('shop', 112)}</div>
      <p class="shop-msg">상점은 아직 준비 중이에요.<br>지금은 둘러볼 물건이 없어요.</p>
      <div class="row" style="justify-content:center"><button class="btn btn-small" data-manual>사용 설명서 보기</button></div>`,
  });
  m.$('[data-manual]').addEventListener('click', () => { m.close(); onManual?.(); });
  return m;
}
