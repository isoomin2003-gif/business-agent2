// 픽셀 아트 그리기 도구 (아바타는 render/avatar.js)
export const rect = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); };

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
