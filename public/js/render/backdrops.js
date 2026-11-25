// 장소 배경 그림 (확정본): 내 방·옥상·공원. 그림은 1672×941(거의 16:9)이고, 화면 좌표 320×180에 그대로 맞춰 그림
// - 클릭 영역·걷는 바닥·좌석은 모두 같은 320×180 좌표로 정해, 창 크기가 바뀌어도 그림과 클릭 위치가 함께 확대·축소됨
export const SCALE = 4; // 캔버스 내부 해상도 = 320×180 × 4 (그림을 선명하게, 아바타 픽셀은 4의 배수로 또렷하게)
export const W = 320, H = 180;

const files = { room: '/img/scenes/room.webp', rooftop: '/img/scenes/rooftop.webp', park: '/img/scenes/park.webp' };
export const IMGS = {};
const loads = [];
for (const [id, src] of Object.entries(files)) {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  IMGS[id] = img;
  loads.push(img.decode ? img.decode().catch(() => new Promise((r) => { img.onload = r; img.onerror = r; })) : new Promise((r) => { img.onload = r; img.onerror = r; }));
}
/** 세 그림을 모두 불러왔을 때 */
export const ready = Promise.all(loads);
export const loaded = (id) => IMGS[id]?.complete && IMGS[id].naturalWidth > 0;

/** 배경 그림을 320×180 좌표 전체에 그림 (확대·축소는 부드럽게) */
export function drawBackdrop(c, id) {
  const img = IMGS[id];
  if (!loaded(id)) { c.fillStyle = '#1b1426'; c.fillRect(0, 0, W, H); return; }
  const smooth = c.imageSmoothingEnabled;
  c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  c.drawImage(img, 0, 0, W, H);
  c.imageSmoothingEnabled = smooth;
}

/** 배경의 일부(좌표 사각형들)를 그 위에 다시 그림 → 의자 등받이처럼 앉은 아바타 앞에 있어야 하는 부분 */
export function redrawParts(c, id, rects) {
  const img = IMGS[id];
  if (!loaded(id)) return;
  const kx = img.naturalWidth / W, ky = img.naturalHeight / H;
  const smooth = c.imageSmoothingEnabled;
  c.imageSmoothingEnabled = true;
  for (const [x, y, w, h] of rects) c.drawImage(img, x * kx, y * ky, w * kx, h * ky, x, y, w, h);
  c.imageSmoothingEnabled = smooth;
}

/** 배경의 둥근 부분을 중심 기준으로 돌려 그림 (방 CD 플레이어의 CD가 실제로 돌아가게) */
export function drawRotatedDisc(c, id, cx, cy, r, angle) {
  const img = IMGS[id];
  if (!loaded(id)) return;
  const kx = img.naturalWidth / W, ky = img.naturalHeight / H;
  c.save();
  c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.clip();
  c.translate(cx, cy); c.rotate(angle);
  c.imageSmoothingEnabled = true;
  c.drawImage(img, (cx - r) * kx, (cy - r) * ky, 2 * r * kx, 2 * r * ky, -r, -r, 2 * r, 2 * r);
  c.restore();
}
