// 아바타 — 머리 6 × 맨투맨 6색 × 하의 2 = 72가지
// 보이는 그림은 확정한 그림체의 층 그림(아래 avatarHi). 아래쪽의 20×36칸 도트 그림은 층 그림을 받기 전 잠깐만 쓰는 대신 그림
import { TOPS, avatarOf } from '../shared/avatar.js';

export const GRID_W = 20, GRID_H = 36;

// ── 확정한 아바타 그림체 (사용자 시안에서 분리한 투명 PNG를 층으로 나눠 앱에서 겹침) ──
// 모든 층은 같은 틀(가로 240 × 세로 460px, 발바닥 = 맨 아래 줄, 몸 가운데 = x 120)
// - upper-{front,back}-h0~5 : 머리 6종 + 상체(연보라 맨투맨·속옷 단·손). 뒷모습은 얼굴 자리를 머리카락으로 채운 그림
// - lower-{pants,skirt}-{stand,walk0,walk1,sit} : 하의·다리·크림색 운동화 (걷기 = 한 발씩 들기, 앉기 = 허벅지를 앞으로 접음)
// - colors.json : 연보라의 명암 단계별 색 → 크림·살구·인디핑크·하늘색·네이비 (색 시안의 같은 자리 픽셀에서 뽑음)
// 키: 몸 기준 그림 높이 433px = 18 (예전 아바타와 같은 키, 장소 배율은 stage.js에서)
const FW = 240, FH = 460, REF_H = 433, HIP = FH - REF_H + 318; // HIP: 엉덩이(좌판에 닿는) 줄
const K = 18 / REF_H;
const img = (n) => { const im = new Image(); im.src = `/img/avatar/${n}.png?v=2`; return im; };
const UPPER = { front: Array.from({ length: 6 }, (_, i) => img(`upper-front-h${i}`)), back: Array.from({ length: 6 }, (_, i) => img(`upper-back-h${i}`)), side: Array.from({ length: 6 }, (_, i) => img(`upper-side-h${i}`)) };
const LOWER = {};
for (const b of ['pants', 'skirt']) for (const p of ['stand', 'walk0', 'walk1', 'sit', 'side0', 'side1']) LOWER[`${b}-${p}`] = img(`lower-${b}-${p}`);
let LUT = null; // 연보라 색(0xRRGGBB) → [크림, 살구, 인디핑크, 하늘색, 네이비]
const lutReady = fetch('/img/avatar/colors.json?v=2').then((r) => r.json()).then((j) => {
  LUT = new Map(Object.entries(j.map).map(([k, v]) => [parseInt(k, 16), v.map((h) => parseInt(h, 16))]));
}).catch(() => {});
const allImgs = [...UPPER.front, ...UPPER.back, ...UPPER.side, ...Object.values(LOWER)];
export const baseFrontReady = Promise.all([lutReady, ...allImgs.map((im) => im.decode().catch(() => {}))]).then(() => true);
const ok = (im) => im && im.complete && im.naturalWidth > 0;

const upperCache = new Map();
/** 머리 hair의 앞/뒷모습 상체를 맨투맨 색 top으로 (연보라 픽셀만 색 대응표로 바꿈) */
function upperOf(hair, back, top, side = false) {
  const key = `${hair}|${back ? 1 : 0}|${side ? 1 : 0}|${top}`;
  if (upperCache.has(key)) return upperCache.get(key);
  const src = (side ? UPPER.side : back ? UPPER.back : UPPER.front)[hair];
  if (!ok(src) || (top && !LUT)) return null;
  const cv = document.createElement('canvas'); cv.width = FW; cv.height = FH;
  const c = cv.getContext('2d'); c.drawImage(src, 0, 0);
  if (top) {
    const d = c.getImageData(0, 0, FW, FH), px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      if (!px[i + 3]) continue;
      const to = LUT.get((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]);
      if (to) { const v = to[top - 1]; px[i] = v >> 16; px[i + 1] = (v >> 8) & 255; px[i + 2] = v & 255; }
    }
    c.putImageData(d, 0, 0);
  }
  upperCache.set(key, cv);
  return cv;
}

const hiCache = new Map();
/** 조합·자세별 완성 그림 (240×460). 그림을 아직 못 받았으면 null → 예전 도트 그림으로 대신 */
export function avatarHi(avatar, { pose = 'stand', frame = 0, back = false, dir = 0 } = {}) {
  const a = avatarOf(avatar);
  const sit = pose === 'sit', f = pose === 'walk' ? frame % 2 : 0;
  const side = pose === 'walk' && !back && dir !== 0; // 옆으로 걸을 때: 걷는 쪽을 비스듬히 본 옆모습 (오른쪽 그림, 왼쪽은 그릴 때 뒤집음)
  const key = `${a.hair}${a.top}${a.bottom}|${pose}|${f}|${back ? 1 : 0}|${side ? 1 : 0}`;
  if (hiCache.has(key)) return hiCache.get(key);
  const lower = LOWER[`${a.bottom ? 'skirt' : 'pants'}-${sit ? (back ? 'stand' : 'sit') : side ? `side${f}` : pose === 'walk' ? `walk${f}` : 'stand'}`];
  const up = upperOf(a.hair, back, a.top, side);
  if (!ok(lower) || !up) return null;
  const cv = document.createElement('canvas'); cv.width = FW; cv.height = FH;
  const c = cv.getContext('2d');
  if (sit && back) c.drawImage(lower, 0, 0, FW, HIP + 8, 0, 0, FW, HIP + 8); // 방 의자: 다리는 의자에 가려 엉덩이까지만
  else c.drawImage(lower, 0, 0);
  c.drawImage(up, 0, 0);
  hiCache.set(key, cv);
  return cv;
}

/** 머리 고르기 버튼용: i번 머리의 머리·어깨 부분 (그림을 아직 못 받았으면 null) */
export function hairThumb(i, w = 60, h = 66, top = 0) {
  const up = upperOf(i, false, top); if (!up) return null;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d'); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  const k = w / 230; c.drawImage(up, (w - FW * k) / 2, 2 - (FH - 443) * k, FW * k, FH * k);
  return cv;
}

const FIXED = {
  O: '#2a1c19', // 윤곽선
  K: '#f7d2ad', k: '#e3b08b', // 피부
  E: '#2a1c19', B: '#f2968a', M: '#8a3f33', // 눈·볼·입
  H: '#4b302a', h: '#33211d', G: '#6e4c40', Q: '#5f7b58', // 머리·그늘·윤기·머리끈
  U: '#f1e4c6', // 맨투맨 아래로 보이는 크림색 속옷 단
  P: '#3f2c2c', p: '#2d201f', // 짙은 긴바지
  C: '#5b5961', c: '#46444c', // 차콜 A라인 치마 (바지보다 밝은 회색빛)
  L: '#3f2c2c', // 치마 아래 짙은 스타킹
  S: '#f4ecd6', s: '#cbbd9e', // 크림색 운동화
};

// [줄, 시작칸, 끝칸, 색 코드] — 뒤에 오는 것이 앞의 것을 덮음
const span = (g, list, dy = 0) => { for (const [y, x0, x1, code = 'H'] of list) for (let x = x0; x <= x1; x++) if (y + dy >= 0 && y + dy < GRID_H) g[y + dy][x] = code; };
const rows = (from, to, x0, x1, code = 'H') => Array.from({ length: to - from + 1 }, (_, i) => [from + i, x0, x1, code]);

// 앞모습 머리 (얼굴 위·옆으로 덮는 부분)
const HAIR_FRONT = [
  // 0 짧은 가르마: 오른쪽 가르마에서 왼쪽으로 넘긴 앞머리
  [[1, 6, 13], [2, 4, 15], [3, 3, 16], [4, 3, 16], [5, 3, 11], [5, 14, 16], [6, 3, 10], [6, 15, 16], [7, 3, 8], [7, 15, 16], [8, 3, 6], [8, 15, 16], [9, 3, 4], [9, 15, 16], [10, 3, 4], [10, 15, 16],
    [5, 10, 11, 'h'], [6, 9, 10, 'h'], [7, 7, 8, 'h'], [8, 5, 6, 'h'], [4, 12, 12, 'h'], [2, 6, 8, 'G'], [3, 6, 7, 'G']],
  // 1 둥근 숏컷: 일자 앞머리, 동그란 옆선
  [[1, 6, 13], [2, 4, 15], [3, 3, 16], [4, 2, 17], [5, 2, 17], [6, 2, 17], [7, 2, 17], ...rows(8, 11, 2, 4), ...rows(8, 11, 15, 17), [12, 3, 4], [12, 15, 16],
    [7, 5, 14, 'h'], [2, 7, 9, 'G'], [3, 11, 13, 'G']],
  // 2 곱슬 숏컷: 울퉁불퉁한 윤곽과 곱슬 그늘
  [[0, 4, 6], [0, 9, 11], [0, 14, 15], [1, 3, 16], [2, 1, 18], [3, 2, 17], [4, 1, 18], [5, 2, 9], [5, 11, 17], [6, 2, 6], [6, 8, 9], [6, 13, 17], [7, 1, 4], [7, 15, 18], [8, 2, 4], [8, 15, 17], [9, 1, 4], [9, 15, 18], [10, 3, 4], [10, 15, 16],
    [2, 6, 7, 'h'], [3, 12, 13, 'h'], [4, 8, 9, 'h'], [6, 4, 5, 'h'], [6, 14, 15, 'h'], [8, 3, 3, 'h'], [8, 16, 16, 'h'], [1, 9, 10, 'G'], [3, 4, 5, 'G'], [2, 14, 15, 'G']],
  // 3 턱선 단발: 옆머리가 턱선까지, 끝이 살짝 바깥으로
  [[1, 6, 13], [2, 4, 15], [3, 3, 16], [4, 2, 17], [5, 2, 12], [5, 15, 17], [6, 2, 9], [6, 15, 17], [7, 2, 6], [7, 15, 17], ...rows(8, 13, 2, 4), ...rows(8, 13, 15, 17), [14, 2, 5], [14, 14, 17], [15, 3, 5], [15, 14, 16],
    [6, 7, 9, 'h'], ...rows(8, 13, 4, 4, 'h'), ...rows(8, 13, 15, 15, 'h'), [2, 6, 8, 'G'], [3, 13, 14, 'G']],
  // 4 어깨까지 오는 생머리: 가운데 가르마, 어깨 위로 내려옴
  [[1, 6, 13], [2, 4, 15], [3, 3, 16], [4, 3, 8], [4, 11, 16], [5, 3, 7], [5, 12, 16], [6, 2, 6], [6, 13, 17], ...rows(7, 20, 2, 4), ...rows(7, 20, 15, 17), [21, 2, 3], [21, 16, 17],
    ...rows(7, 20, 4, 4, 'h'), ...rows(7, 20, 15, 15, 'h'), [5, 6, 7, 'h'], [5, 12, 13, 'h'], [2, 6, 7, 'G'], [2, 12, 13, 'G']],
  // 5 낮은 묶음머리: 옆으로 넘긴 앞머리, 오른쪽 어깨 쪽으로 내려온 묶음
  [[1, 6, 13], [2, 4, 15], [3, 3, 16], [4, 3, 16], [5, 3, 12], [5, 15, 16], [6, 3, 9], [6, 15, 16], [7, 3, 6], [7, 15, 16], ...rows(8, 10, 3, 4), ...rows(8, 11, 15, 16),
    [12, 16, 17, 'Q'], [13, 16, 18], [14, 16, 18], [15, 16, 18], ...rows(16, 19, 17, 18), [20, 17, 17],
    [6, 7, 9, 'h'], ...rows(14, 19, 18, 18, 'h'), [2, 7, 9, 'G'], [3, 12, 13, 'G']],
];

// 뒷모습 머리 (뒤통수 전체)
const BACK_CAP = [[1, 6, 13], [2, 4, 15], ...rows(3, 11, 3, 16), [12, 4, 15], [13, 5, 14], [2, 7, 9, 'G'], [3, 11, 12, 'G']];
const HAIR_BACK = [
  BACK_CAP,
  [...BACK_CAP, [12, 3, 16], [13, 4, 15]],
  [[0, 4, 6], [0, 9, 11], [0, 14, 15], ...BACK_CAP, [1, 3, 16], [2, 1, 18], [3, 2, 17], [4, 1, 18], [7, 1, 18], [9, 1, 18], [12, 3, 16], [13, 4, 15], [3, 6, 7, 'h'], [5, 11, 12, 'h'], [8, 5, 6, 'h'], [10, 12, 13, 'h']],
  [...BACK_CAP, ...rows(4, 14, 2, 17), [15, 3, 16], [14, 9, 10, 'h']],
  [...BACK_CAP, ...rows(4, 20, 2, 17), [21, 3, 16], ...rows(15, 20, 9, 10, 'h')],
  [...BACK_CAP, [14, 8, 11, 'Q'], [15, 8, 11], ...rows(16, 20, 9, 10), [21, 9, 10, 'h']],
];

/** 몸 + 옷 + 머리를 칸 단위 코드로 */
function compose({ hair, bottom }, { pose, frame, dir, back }) {
  const g = Array.from({ length: GRID_H }, () => Array(GRID_W).fill(null));
  const sit = pose === 'sit';
  const fx = back ? 0 : dir < 0 ? -1 : dir > 0 ? 1 : 0;
  // 머리(피부)
  span(g, [[4, 6, 13, 'K'], ...rows(5, 13, 5, 14, 'K'), [14, 6, 13, 'K']]);
  if (!back) span(g, [[9, 7 + fx, 7 + fx, 'E'], [10, 7 + fx, 7 + fx, 'E'], [9, 12 + fx, 12 + fx, 'E'], [10, 12 + fx, 12 + fx, 'E'], [11, 6 + fx, 6 + fx, 'B'], [11, 13 + fx, 13 + fx, 'B'], [12, 9 + fx, 10 + fx, 'M']]);
  // 맨투맨 (목 폴라·어깨·소매선·밑단 시보리)
  span(g, [[15, 7, 12, 'R'], [16, 6, 13, 'R'], [17, 4, 15, 'T'], ...rows(18, 24, 3, 16, 'T'), [25, 3, 16, 'R']]);
  if (!back) span(g, [...rows(19, 24, 5, 5, 't'), ...rows(19, 24, 14, 14, 't'), [25, 5, 5, 't'], [25, 14, 14, 't']]);
  else span(g, [...rows(19, 24, 5, 5, 't'), ...rows(19, 24, 14, 14, 't')]);
  span(g, [[26, 6, 13, 'U'], ...rows(26, 27, 3, 4, 'K'), ...rows(26, 27, 15, 16, 'K'), [27, 3, 4, 'k'], [27, 15, 16, 'k']]);
  // 하의 + 운동화. 걸을 때는 한쪽 발을 한 칸 들어 올림
  const liftL = pose === 'walk' && frame % 2 === 0 ? 1 : 0, liftR = pose === 'walk' && frame % 2 === 1 ? 1 : 0;
  const shoes = (dyL, dyR) => span(g, [[32 - dyL, 6, 8, 'S'], [33 - dyL, 5, 8, 'S'], [34 - dyL, 5, 8, 's'], [32 - dyR, 11, 13, 'S'], [33 - dyR, 11, 14, 'S'], [34 - dyR, 11, 14, 's']]);
  const seatedBack = sit && back; // 방 의자에 등을 보이고 앉음: 다리는 의자에 가려짐
  if (bottom === 1) {
    span(g, sit && !back
      ? [[27, 5, 14, 'C'], [28, 4, 15, 'C'], [29, 4, 15, 'c'], [29, 5, 14, 'C'], ...rows(28, 29, 8, 8, 'c'), ...rows(28, 29, 11, 11, 'c')]
      : [[27, 6, 13, 'C'], [28, 5, 14, 'C'], [29, 5, 14, 'C'], [30, 4, 15, 'C'], ...rows(28, 30, 8, 8, 'c'), ...rows(28, 30, 11, 11, 'c'), [30, 4, 15, 'c'], [30, 5, 14, 'C'], [30, 8, 8, 'c'], [30, 11, 11, 'c']]);
    if (!seatedBack) {
      span(g, sit ? [...rows(30, 31, 7, 8, 'L'), ...rows(30, 31, 11, 12, 'L')] : [[31, 7, 8, 'L'], [31, 11, 12, 'L']]);
      if (!sit && liftL) g[31][7] = g[31][8] = null;
      if (!sit && liftR) g[31][11] = g[31][12] = null;
    }
  } else {
    span(g, sit && !back ? [...rows(27, 28, 5, 14, 'P'), [28, 9, 10, 'p']] : [...rows(27, 28, 6, 13, 'P')]);
    if (!seatedBack) {
      span(g, [...rows(29, 31 - liftL, 6, 8, 'P'), ...rows(29, 31 - liftR, 11, 13, 'P'), ...rows(29, 31 - liftL, 8, 8, 'p'), ...rows(29, 31 - liftR, 13, 13, 'p')]);
    } else span(g, [[29, 6, 13, 'P']]);
  }
  if (!seatedBack) shoes(liftL, liftR);
  // 머리카락은 맨 위에 (긴 머리·묶음은 어깨 위로)
  span(g, back ? HAIR_BACK[hair] : HAIR_FRONT[hair]);
  // 바깥 윤곽선: 빈칸 중 상하좌우로 채워진 칸과 닿은 곳
  const out = g.map((r) => r.slice());
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
    if (g[y][x]) continue;
    if ((y > 0 && g[y - 1][x]) || (y < GRID_H - 1 && g[y + 1][x]) || (x > 0 && g[y][x - 1]) || (x < GRID_W - 1 && g[y][x + 1])) out[y][x] = 'O';
  }
  return out;
}

const cache = new Map();
/** 조합·자세별 20×36 그림 (한 번 만들면 재사용) */
export function avatarSprite(avatar, { pose = 'stand', frame = 0, dir = 0, back = false } = {}) {
  const a = avatarOf(avatar);
  const f = pose === 'walk' ? frame % 2 : 0;
  const key = `${a.hair}${a.top}${a.bottom}|${pose}|${f}|${Math.sign(dir)}|${back ? 1 : 0}`;
  let cv = cache.get(key);
  if (cv) return cv;
  const top = TOPS[a.top];
  const colors = { ...FIXED, T: top.base, t: top.shade, R: top.rib };
  const g = compose(a, { pose, frame: f, dir, back });
  cv = document.createElement('canvas'); cv.width = GRID_W; cv.height = GRID_H;
  const c = cv.getContext('2d');
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) { const k = g[y][x]; if (k) { c.fillStyle = colors[k]; c.fillRect(x, y, 1, 1); } }
  cache.set(key, cv);
  return cv;
}

/**
 * 발 위치 (x, y) 기준으로 그림 (320×180 좌표, 키 18 · 앉으면 15)
 * pose: 'stand' | 'walk' | 'sit', dir: -1 왼쪽 / 1 오른쪽 / 0 정면, back: 뒷모습
 */
export function drawAvatar(c, x, y, avatar, { pose = 'stand', frame = 0, dir = 0, back = false, me = false } = {}) {
  const sit = pose === 'sit';
  c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(x - 4, y - 1, 8, 1.5);
  if (me && !sit) { c.fillStyle = 'rgba(255,207,110,.55)'; c.fillRect(x - 5, y + 0.5, 10, 1); }
  const prev = c.imageSmoothingEnabled;
  const hi = avatarHi(avatar, { pose, frame, back, dir });
  if (hi) {
    // 서 있기·걷기: 발바닥 = 그림 맨 아래 / 앉기: 엉덩이 줄이 좌판(y - 1.5)에 닿게 (예전 도트 아바타와 같은 자리)
    const top = sit ? y - 1.5 - HIP * K : y - FH * K;
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; // 큰 그림을 작게 줄이므로 부드럽게
    if (pose === 'walk' && !back && dir < 0) { // 왼쪽으로 걸음: 오른쪽 옆모습을 발밑 기준으로 좌우 뒤집음
      c.save(); c.translate(x, 0); c.scale(-1, 1); c.drawImage(hi, -(FW / 2) * K, top, FW * K, FH * K); c.restore();
    } else c.drawImage(hi, x - (FW / 2) * K, top, FW * K, FH * K);
  } else {
    c.imageSmoothingEnabled = false;
    c.drawImage(avatarSprite(avatar, { pose, frame, dir, back }), x - GRID_W / 4, y - (sit ? 15 : 18), GRID_W / 2, GRID_H / 2);
  }
  c.imageSmoothingEnabled = prev;
}

/** 홈 미리보기: 확정한 그림체로 전신 (앞·걷기·뒤) — 캔버스 가운데·아래(발)에 맞춤 */
export function paintPreview(canvas, avatar, opts = {}) {
  const a = avatarOf(avatar), c = canvas.getContext('2d');
  c.clearRect(0, 0, canvas.width, canvas.height);
  const hi = avatarHi(a, opts);
  if (hi) {
    const k = canvas.height * 0.93 / 443, foot = canvas.height * 0.95; // 가장 높은 머리(곱슬)도 들어가게
    c.fillStyle = 'rgba(0,0,0,.18)'; c.beginPath(); c.ellipse(canvas.width / 2, foot - 4, 46 * canvas.width / 250, 8 * canvas.height / 450, 0, 0, Math.PI * 2); c.fill();
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(hi, canvas.width / 2 - (FW / 2) * k, foot - FH * k, FW * k, FH * k);
    return 'png';
  }
  const k = Math.min(canvas.width / GRID_W, canvas.height / GRID_H);
  c.imageSmoothingEnabled = false;
  c.drawImage(avatarSprite(a, opts), (canvas.width - GRID_W * k) / 2, canvas.height - GRID_H * k, GRID_W * k, GRID_H * k);
  return 'sprite';
}

/** 홈 미리보기·선택 버튼용: 확대한 전신 그림 (칸 하나 = scale px) */
export function avatarCanvas(avatar, scale = 6, opts = {}) {
  const spr = avatarSprite(avatar, opts);
  const cv = document.createElement('canvas'); cv.width = GRID_W * scale; cv.height = GRID_H * scale;
  const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
  c.drawImage(spr, 0, 0, cv.width, cv.height);
  return cv;
}
