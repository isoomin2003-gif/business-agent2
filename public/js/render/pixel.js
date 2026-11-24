// 픽셀 아트 그리기 도구와 독자 디자인의 아바타
export const rect = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); };

export const AVATAR_COLORS = [
  { shirt: '#ff8fab', pants: '#3d3a6b', hair: '#3b2416' },
  { shirt: '#7fd6a0', pants: '#2f3b4f', hair: '#1d1a22' },
  { shirt: '#73c2ff', pants: '#46325a', hair: '#7a4b2a' },
  { shirt: '#ffcf6e', pants: '#4a3326', hair: '#2a1a12' },
  { shirt: '#c79bff', pants: '#2c2c3c', hair: '#d9a066' },
  { shirt: '#ff9b6b', pants: '#30404a', hair: '#4a2c1d' },
  { shirt: '#9be0e0', pants: '#523a3a', hair: '#111' },
  { shirt: '#f2f2f2', pants: '#3a4a6a', hair: '#8b5e3c' },
];
const SKIN = '#f4c9a0';
const OUT = '#120c18';

/**
 * 발 위치 (x,y) 기준 10x18 아바타
 * pose: 'stand' | 'walk' | 'sit', dir: -1 왼쪽 / 1 오른쪽 / 0 정면, back: 뒷모습
 */
export function drawAvatar(c, x, y, colorIdx, { pose = 'stand', frame = 0, dir = 0, back = false, me = false } = {}) {
  const pal = AVATAR_COLORS[colorIdx % AVATAR_COLORS.length];
  x = Math.round(x); y = Math.round(y);
  const sit = pose === 'sit';
  const top = y - (sit ? 15 : 18);
  // 그림자
  c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(x - 5, y - 1, 10, 2);
  if (me && !sit) { c.fillStyle = 'rgba(255,207,110,.55)'; c.fillRect(x - 6, y, 12, 1); }
  // 다리
  if (sit) {
    rect(c, x - 4, top + 12, 8, 2, pal.pants);
    rect(c, x - 4, top + 14, 3, 1, OUT); rect(c, x + 1, top + 14, 3, 1, OUT);
  } else {
    const step = pose === 'walk' ? (frame % 2 ? 1 : -1) : 0;
    rect(c, x - 3, top + 12, 2, 5 + (step > 0 ? 0 : 0), pal.pants);
    rect(c, x + 1, top + 12, 2, 5, pal.pants);
    rect(c, x - 3 + (step < 0 ? -1 : 0), top + 17, 3, 1, OUT);
    rect(c, x + 1 + (step > 0 ? 1 : 0), top + 17, 3, 1, OUT);
    if (step) rect(c, step > 0 ? x - 3 : x + 1, top + 16, 2, 1, pal.pants);
  }
  // 몸통
  rect(c, x - 4, top + 7, 8, 6, pal.shirt);
  rect(c, x - 4, top + 12, 8, 1, 'rgba(0,0,0,.18)');
  // 팔
  const swing = pose === 'walk' ? (frame % 2 ? 1 : -1) : 0;
  rect(c, x - 5, top + 8 + (swing > 0 ? 1 : 0), 1, 4, pal.shirt);
  rect(c, x + 4, top + 8 + (swing < 0 ? 1 : 0), 1, 4, pal.shirt);
  rect(c, x - 5, top + 12 + (swing > 0 ? 1 : 0), 1, 1, SKIN);
  rect(c, x + 4, top + 12 + (swing < 0 ? 1 : 0), 1, 1, SKIN);
  // 머리
  rect(c, x - 4, top, 8, 7, SKIN);
  rect(c, x - 4, top - 1, 8, 3, pal.hair);
  rect(c, x - 5, top, 1, 4, pal.hair); rect(c, x + 4, top, 1, 4, pal.hair);
  if (back) {
    rect(c, x - 4, top + 1, 8, 6, pal.hair);
  } else {
    const fx = dir < 0 ? -1 : dir > 0 ? 1 : 0;
    rect(c, x - 2 + fx, top + 3, 1, 2, OUT); rect(c, x + 1 + fx, top + 3, 1, 2, OUT);
    rect(c, x - 3 + fx, top + 5, 1, 1, '#ff9e9e'); rect(c, x + 2 + fx, top + 5, 1, 1, '#ff9e9e');
  }
}

/** 시드 고정 난수 */
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function stars(c, w, h, n, seed, color = '#fff') {
  const r = rng(seed);
  for (let i = 0; i < n; i++) { c.fillStyle = color; c.globalAlpha = 0.4 + r() * 0.6; c.fillRect(Math.floor(r() * w), Math.floor(r() * h), 1, 1); }
  c.globalAlpha = 1;
}

export function glow(c, x, y, r, rgb, a = 0.35) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
}

export function vgrad(c, x, y, w, h, stops) {
  // 픽셀 느낌을 위해 계단식 그라디언트
  const n = stops.length - 1;
  for (let i = 0; i < h; i++) {
    const t = i / h * n, k = Math.min(n - 1, Math.floor(t)), f = t - k;
    const a = stops[k], b = stops[k + 1];
    const band = Math.floor(f * 4) / 4;
    const col = a.map((v, j) => Math.round(v + (b[j] - v) * band));
    c.fillStyle = `rgb(${col})`; c.fillRect(x, y + i, w, 1);
  }
}

/** 벤치(정면) — 좌석 높이 seatY */
export function bench(c, x, w, seatY, wood = '#8a5a3c', dark = '#5a3a26') {
  rect(c, x, seatY - 14, w, 3, wood); rect(c, x, seatY - 10, w, 3, wood); // 등받이
  rect(c, x, seatY - 11, w, 1, dark); rect(c, x, seatY - 7, w, 1, dark);
  rect(c, x + 2, seatY - 14, 2, 14, dark); rect(c, x + w - 4, seatY - 14, 2, 14, dark);
  rect(c, x - 1, seatY - 2, w + 2, 3, wood); rect(c, x - 1, seatY + 1, w + 2, 1, dark);
  rect(c, x + 3, seatY + 2, 2, 7, '#2b2b33'); rect(c, x + w - 5, seatY + 2, 2, 7, '#2b2b33');
  if (w > 60) rect(c, x + Math.floor(w / 2) - 1, seatY + 2, 2, 7, '#2b2b33');
}

/** 안티앨리어싱 없는 픽셀 원 */
export function disc(c, cx, cy, r, col) {
  c.fillStyle = col;
  for (let dy = -r; dy <= r; dy++) {
    const w = Math.floor(Math.sqrt(r * r - dy * dy));
    c.fillRect(Math.round(cx - w), Math.round(cy + dy), w * 2 + 1, 1);
  }
}

/** 초승달: 밝은 원 위에 하늘색 원을 겹침 */
export function crescent(c, cx, cy, r, light, sky) {
  disc(c, cx, cy, r, light);
  disc(c, cx + Math.ceil(r * 0.6), cy - Math.ceil(r * 0.3), r, sky);
}
