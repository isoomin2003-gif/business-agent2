// 캔버스 렌더링, 아바타/말풍선, 클릭(터치) 판정을 담당합니다.
import { drawAvatar, rect, glow, rng } from './render/pixel.js';
import { positionAt } from './shared/places.js';
import { now } from './net.js';

const W = 320, H = 180;
const BUBBLE_MS = 5200;

export class Stage {
  constructor() {
    this.el = document.getElementById('stage');
    this.canvas = document.getElementById('canvas');
    this.c = this.canvas.getContext('2d');
    this.c.imageSmoothingEnabled = false;
    this.overlay = document.getElementById('overlay');
    this.tooltip = document.getElementById('tooltip');
    this.bg = document.createElement('canvas'); this.bg.width = W; this.bg.height = H;
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
    const hud = 56, bottom = 76;
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
  }

  renderBackground(ctx = {}) {
    const b = this.bg.getContext('2d');
    b.clearRect(0, 0, W, H);
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
    c.drawImage(this.bg, 0, 0);
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
      drawAvatar(c, p.x, seated ? p.y + 2 : p.y, e.color, {
        pose: p.moving ? 'walk' : seated ? 'sit' : 'stand', frame: Math.floor(t / 170), dir: p.dir, back: seatDef?.back, me: e.me,
      });
      if (e.wish && e.wish.until > Date.now()) this.drawWishIcon(c, p.x, (seated ? p.y - 13 : p.y - 18) - 8, t, this.hover?.type === 'wish' && this.hover.id === e.id);
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

  drawMarkers(c, t) {
    if (!this.place || this.placeId === 'room') return;
    const pulse = (Math.sin(t / 400) + 1) / 2;
    for (const [id, n] of Object.entries(this.place.nodes)) {
      const hot = this.hover?.type === 'node' && this.hover.id === id;
      c.globalAlpha = hot ? 1 : 0.35 + pulse * 0.3;
      const col = hot ? '#ffe39a' : '#cfe9ff';
      rect(c, n.x - 1, n.y - 3, 2, 1, col); rect(c, n.x - 3, n.y - 1, 1, 2, col); rect(c, n.x + 2, n.y - 1, 1, 2, col); rect(c, n.x - 1, n.y + 2, 2, 1, col);
      c.globalAlpha = 1;
    }
    for (const [id, s] of Object.entries(this.place.seats)) {
      const taken = this.seatsTaken.has(id);
      const hot = this.hover?.type === 'seat' && this.hover.id === id;
      if (taken) continue;
      c.globalAlpha = hot ? 0.95 : 0.3;
      rect(c, s.x - 6, s.y - 3, 12, 2, hot ? '#ffe39a' : '#ffffff');
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
    const k = this.scale;
    for (const e of this.entities.values()) {
      const p = this.pos(e);
      const seated = !p.moving && e.seat;
      const footY = seated ? p.y + 2 : p.y;
      e.tag.style.left = `${Math.min(Math.max(p.x * k, 50), 320 * k - 50)}px`;
      e.tag.style.top = `${(footY + 2) * k}px`;
      if (e.bubble) {
        const headTop = footY - (seated ? 15 : 18) - (e.wish && e.wish.until > Date.now() ? 12 : 2);
        e.bubble.el.style.left = `${Math.min(Math.max(p.x * k, 70), 320 * k - 70)}px`;
        e.bubble.el.style.top = `${headTop * k - 6}px`;
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
      const iy = (seated ? p.y - 13 : p.y - 18) - 8;
      if (Math.abs(x - p.x) <= 6 + pad && Math.abs(y - iy) <= 6 + pad) return { type: 'wish', id: e.id, label: e.me ? '내가 빈 소원' : `${e.nickname} 님의 소원 보기` };
    }
    if (this.place && this.placeId !== 'room') {
      for (const [id, s] of Object.entries(this.place.seats)) {
        if (x >= s.x - 9 - pad && x <= s.x + 9 + pad && y >= s.y - 16 - pad && y <= s.y + 6 + pad) {
          const holder = this.seatsTaken.get(id);
          const mine = holder && this.entities.get(holder)?.me;
          return { type: 'seat', id, label: mine ? '내 자리' : holder ? '누군가 앉아 있어요' : '여기 앉기' };
        }
      }
      for (const [id, n] of Object.entries(this.place.nodes)) {
        if (Math.hypot(x - n.x, y - n.y) <= 9 + pad) return { type: 'node', id, label: `여기로 걷기 · ${n.label || ''}` };
      }
    }
    for (const h of this.scene?.hotspots || []) {
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return { type: 'hotspot', id: h.id, label: h.label };
    }
    return null;
  }

  onHover(e) {
    const p = this.toLocal(e);
    const hit = this.hitTest(p.x, p.y);
    this.hover = hit;
    this.canvas.classList.toggle('pointer', !!hit);
    if (hit) {
      this.tooltip.hidden = false; this.tooltip.textContent = hit.label;
      this.tooltip.style.left = `${p.px}px`; this.tooltip.style.top = `${p.py}px`;
    } else this.tooltip.hidden = true;
  }

  onClick(e) {
    const touch = e.pointerType === 'touch' || (e.pointerType === undefined && matchMedia('(pointer: coarse)').matches);
    const p = this.toLocal(e);
    const hit = this.hitTest(p.x, p.y, touch);
    if (!hit) return this.handlers.empty?.(p);
    if (touch) {
      this.tooltip.hidden = false; this.tooltip.textContent = hit.label;
      this.tooltip.style.left = `${p.px}px`; this.tooltip.style.top = `${p.py}px`;
      clearTimeout(this._tt); this._tt = setTimeout(() => { this.tooltip.hidden = true; }, 900);
    }
    this.handlers[hit.type]?.(hit.id, hit);
  }
}
