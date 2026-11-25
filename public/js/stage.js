// 캔버스 렌더링, 아바타/말풍선, 클릭(터치) 판정을 담당합니다.
import { drawAvatar, rect, glow, rng } from './render/pixel.js';
import { SCALE, ready } from './render/backdrops.js';
import { positionAt, snapWalkable } from './shared/places.js';
import { now } from './net.js';

const W = 320, H = 180;
const BUBBLE_MS = 5200;
// 아바타 크기 배율 (320×180 좌표 기준 서 있을 때 키 18 × 배율)
export const AVATAR_SCALE = 1; // 배경 교체 전과 같은 크기 (장면 높이 180 중 키 18)
const STAND_H = 18 * AVATAR_SCALE, SIT_H = 15 * AVATAR_SCALE;
/** 아바타를 발 위치 기준으로 확대해 그림 (픽셀 경계를 캔버스 실제 픽셀에 맞춤) */
function drawBig(c, x, y, color, opts) {
  c.save();
  c.translate(Math.round(x * SCALE) / SCALE, Math.round(y * SCALE) / SCALE);
  c.scale(AVATAR_SCALE, AVATAR_SCALE);
  drawAvatar(c, 0, 0, color, opts);
  c.restore();
}
export { drawBig as drawAvatarScaled };
export const STEP_MS = 240; // 걷기 그림에서 한 발을 내딛는 간격 (발소리도 여기에 맞춤)

export class Stage {
  constructor() {
    this.el = document.getElementById('stage');
    this.canvas = document.getElementById('canvas');
    // 내부 해상도 = 320×180 × SCALE. 그리는 좌표는 계속 320×180 (배경·클릭 영역·아바타가 같은 기준)
    this.canvas.width = W * SCALE; this.canvas.height = H * SCALE;
    this.c = this.canvas.getContext('2d');
    this.c.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    this.c.imageSmoothingEnabled = false;
    this.overlay = document.getElementById('overlay');
    this.tooltip = document.getElementById('tooltip');
    this.bg = document.createElement('canvas'); this.bg.width = W * SCALE; this.bg.height = H * SCALE;
    this.entities = new Map();
    this.scene = null; this.place = null; this.placeId = null;
    this.hover = null; this.seatsTaken = new Map();
    this.star = null; this.handlers = {}; this.sceneState = {};
    this.banners = new Set();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.canvas.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') this.onHover(e); });
    this.canvas.addEventListener('pointerleave', () => { this.hover = null; this.tooltip.hidden = true; this.canvas.classList.remove('pointer'); });
    this.canvas.addEventListener('click', (e) => this.onClick(e));
    const loop = () => { this.draw(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  on(name, fn) { this.handlers[name] = fn; }

  resize() {
    const hud = 56, bottom = document.getElementById('bottom')?.hidden === false ? 64 : 8;
    const vw = Math.min(window.innerWidth, document.documentElement.clientWidth || Infinity, window.visualViewport?.width || Infinity);
    const vh = window.visualViewport?.height || window.innerHeight;
    const mobile = vw < 640;
    const availW = Math.min(vw - (mobile ? 16 : 24), 1280);
    const availH = vh - hud - bottom - 24;
    // 세로 화면(모바일)에서는 가로폭을 꽉 채우고, PC에서는 화면 높이에 맞춥니다.
    const w = Math.floor(Math.max(Math.min(280, availW), mobile ? availW : Math.min(availW, Math.floor(availH * 16 / 9))));
    document.documentElement.style.setProperty('--stage-w', `${w}px`);
    this.scale = w / W;
  }

  setScene(scene, place, placeId, ctx = {}) {
    this.scene = scene; this.place = place; this.placeId = placeId;
    this.entities.clear(); this.overlay.innerHTML = ''; this.seatsTaken.clear(); this.star = null; this.banners.clear();
    this.renderBackground(ctx);
    ready.then(() => { if (this.scene === scene) this.renderBackground(this.bgCtx); }); // 그림을 아직 불러오는 중이었으면 다 받은 뒤 다시
  }

  renderBackground(ctx = {}) {
    this.bgCtx = ctx;
    const b = this.bg.getContext('2d');
    b.setTransform(1, 0, 0, 1, 0, 0); b.clearRect(0, 0, this.bg.width, this.bg.height);
    b.setTransform(SCALE, 0, 0, SCALE, 0, 0); b.imageSmoothingEnabled = false;
    this.scene.background(b, ctx);
  }

  // ───── 엔티티 ─────
  upsert(id, data) {
    let e = this.entities.get(id);
    if (!e) {
      e = { id, bubble: null, wish: null, ...data };
      e.tag = document.createElement('div');
      e.tag.className = `nametag${data.me ? ' me' : ''}`;
      e.tag.textContent = data.me ? `${data.nickname} (나)` : data.nickname;
      if (data.hideTag) e.tag.hidden = true;
      this.overlay.appendChild(e.tag);
      this.entities.set(id, e);
    } else Object.assign(e, data);
    this.recomputeSeats();
    return e;
  }
  remove(id) {
    const e = this.entities.get(id);
    if (!e) return;
    e.tag.remove(); e.bubble?.el.remove();
    this.entities.delete(id);
    this.recomputeSeats();
  }
  recomputeSeats() {
    this.seatsTaken.clear();
    for (const e of this.entities.values()) if (e.seat) this.seatsTaken.set(e.seat, e.id);
  }
  pos(e) { return positionAt(e.points, e.startAt, now()) || { x: 0, y: 0, moving: false, dir: 0 }; }

  say(id, text) {
    const e = this.entities.get(id);
    if (!e) return;
    e.bubble?.el.remove();
    const el = document.createElement('div');
    el.className = 'bubble'; el.textContent = text;
    this.overlay.appendChild(el);
    const b = { el, until: Date.now() + BUBBLE_MS };
    e.bubble = b;
    setTimeout(() => el.classList.add('out'), BUBBLE_MS - 350);
    setTimeout(() => { el.remove(); if (e.bubble === b) e.bubble = null; }, BUBBLE_MS);
  }

  /** 캔버스 좌표 위에 잠시 떠 있는 배너(신청곡 알림, 첫 안내 등) */
  banner(x, y, text, ms = 6000, cls = 'float-banner') {
    const el = document.createElement('div');
    el.className = cls; el.textContent = text;
    el.dataset.x = x; el.dataset.y = y;
    this.overlay.appendChild(el);
    this.banners.add(el);
    if (ms) setTimeout(() => { el.remove(); this.banners.delete(el); }, ms);
    return el;
  }

  showStar(ev) { this.star = { at: ev.at, seed: ev.seed, dur: 1700 }; }

  // ───── 그리기 ─────
  draw() {
    if (!this.scene) return;
    const c = this.c, t = now();
    c.setTransform(SCALE, 0, 0, SCALE, 0, 0); c.imageSmoothingEnabled = false;
    c.drawImage(this.bg, 0, 0, W, H);
    this.scene.animate?.(c, t, this.sceneState);
    this.drawStar(c, t);
    this.drawMarkers(c, t);
    const items = [];
    for (const e of this.entities.values()) { const p = this.pos(e); items.push({ y: p.y, e, p }); }
    for (const prop of this.scene.props || []) items.push({ y: prop.y, prop });
    items.sort((a, b) => a.y - b.y);
    for (const it of items) {
      if (it.prop) { it.prop.draw(c); continue; }
      const { e, p } = it;
      const seated = !p.moving && e.seat;
      const seatDef = seated ? this.place.seats[e.seat] : null;
      const frame = Math.floor(t / STEP_MS);
      drawBig(c, p.x, seated ? p.y + 2 : p.y, e.color, {
        pose: p.moving ? 'walk' : seated ? 'sit' : 'stand', frame, dir: p.dir, back: seatDef?.back, me: e.me,
      });
      if (e.me) {
        if (p.moving && frame !== e.stepFrame) this.handlers.step?.(p);
        e.stepFrame = p.moving ? frame : null;
      }
      if (e.wish && e.wish.until > Date.now()) this.drawWishIcon(c, p.x, (seated ? p.y + 2 - SIT_H : p.y - STAND_H) - 8, t, this.hover?.type === 'wish' && this.hover.id === e.id);
    }
    this.layoutOverlay();
  }

  drawWishIcon(c, x, y, t, hot) {
    const a = 0.7 + Math.sin(t / 250) * 0.3;
    glow(c, x, y, hot ? 10 : 7, '255,230,120', 0.5 * a);
    c.fillStyle = '#ffe78a';
    c.fillRect(Math.round(x) - 1, Math.round(y) - 3, 2, 6); c.fillRect(Math.round(x) - 3, Math.round(y) - 1, 6, 2);
    c.fillStyle = '#fff'; c.fillRect(Math.round(x), Math.round(y), 1, 1);
  }

  /** 바닥을 누른 곳에 잠깐 보이는 표시 (고정된 이동 지점 표시는 없음) */
  markClick(x, y) { this.clickMark = { x, y, at: performance.now() }; }

  drawMarkers(c, t) {
    if (!this.place) return;
    const m = this.clickMark;
    if (m) {
      const k = (performance.now() - m.at) / 600;
      if (k >= 1) this.clickMark = null;
      else {
        const r = Math.round(2 + k * 4);
        c.globalAlpha = 1 - k;
        rect(c, m.x - r, m.y, 1, 1, '#ffe39a'); rect(c, m.x + r, m.y, 1, 1, '#ffe39a');
        rect(c, m.x, m.y - Math.ceil(r / 2), 1, 1, '#ffe39a'); rect(c, m.x, m.y + Math.ceil(r / 2), 1, 1, '#ffe39a');
        c.globalAlpha = 1;
      }
    }
    if (this.placeId === 'room') return;
    for (const [id, s] of Object.entries(this.place.seats)) {
      const taken = this.seatsTaken.has(id);
      const hot = this.hover?.type === 'seat' && this.hover.id === id;
      if (taken) continue;
      c.globalAlpha = hot ? 0.95 : 0.3;
      rect(c, s.x - 7, s.y - 1, 14, 1, hot ? '#ffe39a' : '#ffffff');
      c.globalAlpha = 1;
    }
  }

  drawStar(c, t) {
    const s = this.star;
    if (!s || t < s.at) return;
    const p = (t - s.at) / s.dur;
    if (p > 1) return;
    const r = rng(Math.floor(s.seed * 1e9));
    const sky = this.scene.skyHeight || 80;
    const x0 = 60 + r() * 220, y0 = 4 + r() * 16, dx = -(90 + r() * 60), dy = 30 + r() * (sky - 50);
    const hx = x0 + dx * p, hy = y0 + dy * p;
    for (let i = 0; i < 26; i++) {
      const q = Math.max(0, p - i * 0.012);
      c.globalAlpha = (1 - i / 26) * (p > 0.85 ? (1 - p) / 0.15 : 1);
      c.fillStyle = i < 3 ? '#ffffff' : '#ffe9a8';
      c.fillRect(Math.round(x0 + dx * q), Math.round(y0 + dy * q), i < 2 ? 2 : 1, i < 2 ? 2 : 1);
    }
    c.globalAlpha = 1;
    glow(c, hx, hy, 10, '255,250,220', 0.6 * (1 - p));
  }

  layoutOverlay() {
    // 테두리를 뺀 실제 캔버스 폭 기준 배율 (테두리까지 넣으면 가장자리 이름표·말풍선이 몇 px 밖으로 나감)
    const W2 = this.canvas.clientWidth || 320 * this.scale;
    const k = W2 / 320;
    for (const e of this.entities.values()) {
      const p = this.pos(e);
      const seated = !p.moving && e.seat;
      const footY = seated ? p.y + 2 : p.y;
      const half = (e.tag.offsetWidth || 100) / 2 + 2; // 이름표가 화면 가장자리에서 잘리지 않게
      e.tag.style.left = `${Math.min(Math.max(p.x * k, half), W2 - half)}px`;
      e.tag.style.top = `${(footY + 2) * k}px`;
      // 같은 벤치의 이웃 좌석끼리 이름표가 겹치지 않도록 짝수 좌석은 한 줄 아래로
      const lower = seated && Number(String(e.seat).replace(/\D/g, '')) % 2 === 0;
      e.tag.style.transform = lower ? 'translate(-50%, 115%)' : 'translate(-50%, 0)';
      if (e.bubble) {
        const headTop = footY - (seated ? SIT_H : STAND_H) - (e.wish && e.wish.until > Date.now() ? 12 : 2);
        // 말풍선 실제 폭·높이로 무대 안에 들어오게 (좁은 모바일 화면에서 잘리지 않도록)
        const bw = e.bubble.el.offsetWidth || 160, bh = e.bubble.el.offsetHeight || 40;
        e.bubble.el.style.left = `${Math.min(Math.max(p.x * k, bw / 2 + 4), W2 - bw / 2 - 4)}px`;
        e.bubble.el.style.top = `${Math.max(headTop * k - 6, bh + 4)}px`;
      }
    }
    for (const el of this.banners) { el.style.left = `${el.dataset.x * k}px`; el.style.top = `${el.dataset.y * k}px`; }
  }

  // ───── 입력 ─────
  toLocal(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H, px: e.clientX - r.left, py: e.clientY - r.top };
  }

  hitTest(x, y, touch = false) {
    const pad = touch ? 4 : 0;
    for (const e of this.entities.values()) {
      if (!e.wish || e.wish.until <= Date.now()) continue;
      const p = this.pos(e); const seated = !p.moving && e.seat;
      const iy = (seated ? p.y + 2 - SIT_H : p.y - STAND_H) - 8;
      if (Math.abs(x - p.x) <= 6 + pad && Math.abs(y - iy) <= 6 + pad) return { type: 'wish', id: e.id, label: e.me ? '내가 빈 소원' : `${e.nickname} 님의 소원 보기` };
    }
    if (this.place && this.placeId !== 'room') {
      for (const [id, s] of Object.entries(this.place.seats)) {
        if (x >= s.x - 9 - pad && x <= s.x + 9 + pad && y >= s.y - (STAND_H - 4) - pad && y <= s.y + 6 + pad) {
          const holder = this.seatsTaken.get(id);
          const mine = holder && this.entities.get(holder)?.me;
          return { type: 'seat', id, label: mine ? '내 자리' : holder ? '누군가 앉아 있어요' : '앉기' };
        }
      }
    }
    for (const h of this.scene?.hotspots || []) {
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return { type: 'hotspot', id: h.id, label: h.label };
    }
    // 빈 바닥: 걸을 수 있는 곳(또는 아주 가까운 곳)을 누르면 그 위치로 걷기
    if (this.placeId) {
      const f = snapWalkable(this.placeId, { x, y }, touch ? 16 : 12);
      if (f) return { type: 'floor', id: null, x: f.x, y: f.y, label: null };
    }
    return null;
  }

  onHover(e) {
    const p = this.toLocal(e);
    const hit = this.hitTest(p.x, p.y);
    this.hover = hit;
    this.canvas.classList.toggle('pointer', !!hit);
    if (hit?.label) {
      this.tooltip.hidden = false; this.tooltip.textContent = hit.label;
      this.tooltip.style.left = `${p.px}px`; this.tooltip.style.top = `${p.py}px`;
    } else this.tooltip.hidden = true;
  }

  onClick(e) {
    const touch = e.pointerType === 'touch' || (e.pointerType === undefined && matchMedia('(pointer: coarse)').matches);
    const p = this.toLocal(e);
    const hit = this.hitTest(p.x, p.y, touch);
    if (!hit) return this.handlers.empty?.(p);
    if (hit.type === 'floor') this.markClick(hit.x, hit.y);
    if (touch && hit.label) {
      this.tooltip.hidden = false; this.tooltip.textContent = hit.label;
      this.tooltip.style.left = `${p.px}px`; this.tooltip.style.top = `${p.py}px`;
      clearTimeout(this._tt); this._tt = setTimeout(() => { this.tooltip.hidden = true; }, 900);
    }
    this.handlers[hit.type]?.(hit.id, hit);
  }
}
