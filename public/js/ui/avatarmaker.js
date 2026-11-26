// 홈의 '내 아바타 만들기 / 아바타 꾸미기' — 가운데 전신 미리보기, 아래에서 머리·맨투맨 색·하의를 고르면 바로 반영
import { HAIRS, TOPS, BOTTOMS, avatarOf } from '../shared/avatar.js';
import { avatarSprite, avatarHi, paintPreview as paintFull, baseFrontReady, hairThumb, GRID_W, GRID_H } from '../render/avatar.js';

/** 그림 일부(칸 단위 영역)를 확대해 그린 캔버스 */
function crop(avatar, { x = 0, y = 0, w = GRID_W, h = GRID_H }, scale, opts) {
  const cv = document.createElement('canvas'); cv.width = w * scale; cv.height = h * scale;
  const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
  c.drawImage(avatarSprite(avatar, opts), x, y, w, h, 0, 0, cv.width, cv.height);
  return cv;
}

/** 하의 고르기 버튼용: 밑단 아래(하의·다리·신발) 부분 */
function bottomThumb(avatar, w = 84, h = 62) {
  const hi = avatarHi(avatar); if (!hi) return null;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d'); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  c.drawImage(hi, 30, 300, 180, 160, 0, 0, w, h); // 틀의 x 30~210, y 300~460 (밑단~신발)
  return cv;
}

/** 홈 화면 작은 아바타 (닉네임 옆) */
export function paintMini(canvas, avatar) {
  canvas.width = 60; canvas.height = 108;
  paintFull(canvas, avatar);
  baseFrontReady.then(() => paintFull(canvas, avatar)); // 그림을 다 받은 뒤 다시
}

/**
 * root: 그릴 곳(#avatar-maker). first: 계정을 막 만든 뒤 처음 고르기(취소 없음)
 * onSave(avatar) → Promise (저장 후 방으로), onCancel()
 */
export function openAvatarMaker(root, { avatar, first = false, onSave, onCancel }) {
  let cur = avatarOf(avatar);
  let pose = 0; // 미리보기: 정면 → 걷기 → 뒷모습을 천천히 번갈아
  root.innerHTML = `
    <h2 id="av-title">${first ? '내 아바타 만들기' : '아바타 꾸미기'}</h2>
    <p class="av-sub">고른 모습 그대로 내 방·옥상·공원에 들어가요. 72가지 조합 모두 무료예요.</p>
    <div class="av-stage"><canvas class="av-preview" width="250" height="450" role="img"></canvas>
      <div class="av-turn" role="group" aria-label="미리보기 방향"><button type="button" class="chip on" data-pose="0">앞</button><button type="button" class="chip" data-pose="1">걷기</button><button type="button" class="chip" data-pose="2">뒤</button></div></div>
    <div class="av-group"><h3>머리</h3><div class="av-opts av-hair" role="radiogroup" aria-label="머리"></div></div>
    <div class="av-group"><h3>맨투맨 색</h3><div class="av-opts av-top" role="radiogroup" aria-label="맨투맨 색"></div></div>
    <div class="av-group"><h3>하의</h3><div class="av-opts av-bottom" role="radiogroup" aria-label="하의"></div></div>
    <p class="av-note">신발은 모두 크림색 운동화예요.</p>
    <p class="av-err error" hidden></p>
    <div class="av-actions">${first ? '' : '<button type="button" class="btn" data-cancel>취소</button>'}<button type="button" class="btn btn-primary btn-big" data-save>이 모습으로 시작하기</button></div>`;
  const $ = (s) => root.querySelector(s);
  const preview = $('.av-preview');

  const option = (label, pressed, content) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'av-opt'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(pressed)); b.title = label;
    b.append(content); const t = document.createElement('span'); t.textContent = label; b.append(t);
    return b;
  };

  function paintPreview() {
    const opts = pose === 1 ? { pose: 'walk', frame: Math.floor(Date.now() / 320) % 2 } : pose === 2 ? { back: true } : {};
    paintFull(preview, cur, opts);
    preview.setAttribute('aria-label', `미리보기: ${HAIRS[cur.hair]}, ${TOPS[cur.top].name} 맨투맨, ${BOTTOMS[cur.bottom]}`);
  }
  function render() {
    const hair = $('.av-hair'); hair.innerHTML = '';
    HAIRS.forEach((name, i) => {
      const b = option(name, cur.hair === i, hairThumb(i, 60, 66, cur.top) || crop({ ...cur, hair: i }, { x: 0, y: 0, w: GRID_W, h: 23 }, 3)); // 머리 모양만 다른 실제 그림
      b.onclick = () => { cur = { ...cur, hair: i }; render(); }; // 상의 색·하의는 그대로
      hair.append(b);
    });
    const top = $('.av-top'); top.innerHTML = '';
    TOPS.forEach((t, i) => {
      const sw = document.createElement('i'); sw.className = 'av-swatch'; sw.style.background = t.base; sw.style.boxShadow = `inset 0 -6px 0 ${t.rib}`;
      const b = option(t.name, cur.top === i, sw);
      b.onclick = () => { cur = { ...cur, top: i }; render(); };
      top.append(b);
    });
    const bottom = $('.av-bottom'); bottom.innerHTML = '';
    BOTTOMS.forEach((name, i) => {
      const b = option(name, cur.bottom === i, bottomThumb({ ...cur, bottom: i }) || crop({ ...cur, bottom: i }, { x: 2, y: 24, w: 16, h: 12 }, 4));
      b.onclick = () => { cur = { ...cur, bottom: i }; render(); }; // 치마를 골라도 상의 색은 그대로
      bottom.append(b);
    });
    paintPreview();
  }
  root.querySelectorAll('[data-pose]').forEach((b) => { b.onclick = () => { pose = Number(b.dataset.pose); root.querySelectorAll('[data-pose]').forEach((x) => x.classList.toggle('on', x === b)); paintPreview(); }; });
  const timer = setInterval(() => { if (!root.isConnected || root.hidden) return clearInterval(timer); if (pose === 1) paintPreview(); }, 320);

  $('[data-save]').onclick = async () => {
    const btn = $('[data-save]'); btn.disabled = true; $('.av-err').hidden = true;
    try { await onSave({ ...cur }); clearInterval(timer); } catch (e) { $('.av-err').hidden = false; $('.av-err').textContent = e.message; } finally { btn.disabled = false; }
  };
  const cancel = $('[data-cancel]');
  if (cancel) cancel.onclick = () => { clearInterval(timer); onCancel?.(); };
  render();
  baseFrontReady.then(() => { if (root.isConnected) render(); });
  root.hidden = false;
  $('[data-save]').focus({ preventScroll: true });
  return { close: () => { clearInterval(timer); root.hidden = true; root.innerHTML = ''; } };
}
