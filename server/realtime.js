import crypto from 'node:crypto';
import { Server } from 'socket.io';
import { PLACES, OUTDOOR, routeTo, positionAt } from '../public/js/shared/places.js';
import { COOKIE, parseCookieHeader, userFromToken } from './auth.js';
import { createRadio } from './radio.js';
import { recommend } from './dj.js';
import { isAdminKey } from './auth.js';
import { config } from './config.js';

export const CHAT_MAX = 50;
const segmenter = new Intl.Segmenter('ko', { granularity: 'grapheme' });
export const graphemeLength = (s) => [...segmenter.segment(s)].length;

const places = Object.fromEntries(OUTDOOR.map((p) => [p, { players: new Map(), seats: new Map() }]));
const stars = new Map(); // starId → { place, at }
let io;
let radio;

export function counts() {
  const out = {};
  for (const p of OUTDOOR) out[p] = new Set([...places[p].players.values()].map((x) => x.userId)).size;
  return out;
}

export function isUserIn(userId, place) {
  return [...(places[place]?.players.values() || [])].some((p) => p.userId === userId);
}

export function getStar(id) { return stars.get(id); }

const serialize = (p) => ({ sid: p.sid, userId: p.userId, nickname: p.nickname, color: p.color, seat: p.seat, points: p.points, startAt: p.startAt, wish: p.wish && p.wish.until > Date.now() ? p.wish : null });

function broadcastCounts() { io.emit('counts', counts()); }

function leavePlace(socket) {
  const placeId = socket.data.place;
  if (!placeId || !places[placeId]) { socket.data.place = 'room'; return; }
  const pl = places[placeId];
  const p = pl.players.get(socket.id);
  if (p?.seat) pl.seats.delete(p.seat);
  pl.players.delete(socket.id);
  socket.leave(placeId);
  socket.data.place = 'room';
  io.to(placeId).emit('player:leave', { sid: socket.id });
  broadcastCounts();
}

/**
 * 자유 이동: 지금 화면에 보이는 위치(걷는 중이면 그 중간 지점)에서 목표까지 장애물을 돌아가는 경로를 만들어
 * 같은 장소의 모든 화면에 같은 경로·같은 출발 시각을 보냅니다. 걷는 도중 새로 누르면 그 자리에서 방향을 바꿉니다.
 */
function setMovement(placeId, p, target, seatId) {
  const now = Date.now();
  const cur = positionAt(p.points, p.startAt, now) || { x: PLACES[placeId].spawn.x, y: PLACES[placeId].spawn.y, moving: false };
  const seatedNow = p.seat && !cur.moving ? p.seat : null; // 자리에 도착해 앉아 있는 경우에만 '일어서기'부터
  const route = routeTo(placeId, cur, target, { seatNow: seatedNow, seatTo: seatId });
  if (!route) return false;
  if (p.seat) places[placeId].seats.delete(p.seat);
  p.points = route.length > 1 ? route : [route[0], route[0]];
  p.startAt = now + 60;
  p.seat = seatId || null;
  if (seatId) places[placeId].seats.set(seatId, p.sid);
  io.to(placeId).emit('player:move', { sid: p.sid, points: p.points, startAt: p.startAt, seat: p.seat });
  return true;
}

// ───────────── 별똥별 ─────────────
function scheduleStar(placeId) {
  const { minSec, maxSec } = config.star;
  const delay = (minSec + Math.random() * Math.max(0, maxSec - minSec)) * 1000;
  setTimeout(() => { fireStar(placeId); scheduleStar(placeId); }, delay).unref?.();
}

export function fireStar(placeId) {
  const id = crypto.randomUUID();
  const ev = { id, place: placeId, at: Date.now() + 2500, seed: Math.random(), serverNow: Date.now() };
  stars.set(id, { place: placeId, at: ev.at });
  for (const [sid, s] of stars) if (Date.now() - s.at > 10 * 60000) stars.delete(sid);
  io.to(placeId).emit('star', ev);
  return ev;
}

export function floatWish(userId, placeId, wishId) {
  const pl = places[placeId];
  if (!pl) return;
  for (const p of pl.players.values()) {
    if (p.userId !== userId) continue;
    p.wish = { wishId, until: Date.now() + 120000 };
    io.to(placeId).emit('wish:float', { sid: p.sid, ...p.wish });
  }
}

/** 지운 소원의 머리 위 ✦ 표시를 모든 화면에서 내립니다 */
export function unfloatWish(wishId) {
  for (const [placeId, pl] of Object.entries(places)) {
    for (const p of pl.players.values()) {
      if (p.wish?.wishId !== wishId) continue;
      p.wish = null;
      io.to(placeId).emit('wish:float', { sid: p.sid, wishId, until: 0 });
    }
  }
}

/** 닉네임 변경을 접속 중인 소켓과 야외 아바타에 반영 (같은 장소 사람들에게 player:rename) */
export function renameLive(userId, nickname) {
  if (!io) return;
  for (const [, s] of io.of('/').sockets) if (s.data.user?.id === userId) s.data.user.nickname = nickname;
  for (const [placeId, pl] of Object.entries(places)) {
    for (const p of pl.players.values()) {
      if (p.userId !== userId) continue;
      p.nickname = nickname;
      io.to(placeId).emit('player:rename', { sid: p.sid, nickname });
    }
  }
}

export function notifyUser(userId, event, data) {
  for (const [, s] of io.of('/').sockets) if (s.data.user?.id === userId) s.emit(event, data);
}

export function getRadio() { return radio; }

export function setupRealtime(server) {
  io = new Server(server, { cors: { origin: false }, maxHttpBufferSize: 1e4 });
  radio = createRadio((kind) => {
    const snap = radio.snapshot();
    io.to('rooftop').emit('radio', { ...snap, kind });
  });
  radio.begin();
  OUTDOOR.forEach(scheduleStar);

  io.use((socket, next) => {
    userFromToken(parseCookieHeader(socket.handshake.headers.cookie)[COOKIE]).then((user) => {
      if (!user) return next(new Error('no_session'));
      socket.data.user = user;
      socket.data.place = 'room';
      next();
    }).catch((e) => { console.error('[socket] auth failed:', e.message); next(new Error('server_error')); });
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    socket.emit('counts', counts());
    let lastChat = 0;

    socket.on('time', (cb) => typeof cb === 'function' && cb(Date.now()));

    socket.on('join', (data, cb) => {
      const placeId = data?.place;
      if (!OUTDOOR.includes(placeId)) return cb?.({ ok: false });
      leavePlace(socket);
      const def = PLACES[placeId];
      const spawn = def.spawn;
      const p = { sid: socket.id, userId: user.id, nickname: user.nickname, color: user.color, seat: null, points: [{ x: spawn.x, y: spawn.y - 4 }, { x: spawn.x, y: spawn.y }], startAt: Date.now(), wish: null };
      places[placeId].players.set(socket.id, p);
      socket.join(placeId);
      socket.data.place = placeId;
      socket.to(placeId).emit('player:join', serialize(p));
      broadcastCounts();
      cb?.({
        ok: true, you: socket.id, serverNow: Date.now(),
        players: [...places[placeId].players.values()].map(serialize),
        radio: placeId === 'rooftop' ? radio.snapshot() : null,
      });
    });

    socket.on('leave', (_data, cb) => { leavePlace(socket); (typeof _data === 'function' ? _data : cb)?.({ ok: true }); });

    let moveTimes = [];
    socket.on('move', (data, cb) => {
      const placeId = socket.data.place;
      const p = places[placeId]?.players.get(socket.id);
      const x = Number(data?.x), y = Number(data?.y);
      if (!p || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 320 || y < 0 || y > 180) return cb?.({ ok: false });
      const now = Date.now();
      moveTimes = moveTimes.filter((t) => now - t < 1000);
      if (moveTimes.length >= 8) return cb?.({ ok: false, message: '조금 천천히 눌러 주세요.' });
      moveTimes.push(now);
      cb?.({ ok: setMovement(placeId, p, { x, y }, null) });
    });

    socket.on('sit', (data, cb) => {
      const placeId = socket.data.place;
      const p = places[placeId]?.players.get(socket.id);
      const seat = PLACES[placeId]?.seats[data?.seat];
      if (!p || !seat) return cb?.({ ok: false, message: '앉을 수 없는 자리예요.' });
      const holder = places[placeId].seats.get(data.seat);
      if (holder && holder !== socket.id) return cb?.({ ok: false, message: '방금 다른 분이 앉은 자리예요. 옆자리를 골라 보세요.' });
      if (holder === socket.id) return cb?.({ ok: true });
      cb?.({ ok: setMovement(placeId, p, seat.approach, data.seat) });
    });

    socket.on('chat', (data, cb) => {
      if (socket.data.place !== 'rooftop') return cb?.({ ok: false, message: '대화는 옥상에서만 할 수 있어요.' });
      const text = String(data?.text ?? '').replace(/\s+/g, ' ').trim();
      if (!text) return cb?.({ ok: false });
      if (graphemeLength(text) > CHAT_MAX) return cb?.({ ok: false, message: `한 번에 ${CHAT_MAX}자까지 말할 수 있어요.` });
      if (Date.now() - lastChat < 700) return cb?.({ ok: false, message: '조금 천천히 말해 주세요.' });
      lastChat = Date.now();
      io.to('rooftop').emit('chat', { sid: socket.id, text, at: Date.now() });
      cb?.({ ok: true });
    });

    // AI DJ 추천: 요청한 사람에게만 응답(ack). 공용 대기열은 건드리지 않음 — 신청은 radio:request로 따로
    let djTimes = [];
    socket.on('dj:recommend', async (data, cb) => {
      if (typeof cb !== 'function') return;
      if (socket.data.place !== 'rooftop') return cb({ ok: false, message: '옥상 라디오에서만 추천받을 수 있어요.' });
      const text = String(data?.text ?? '').replace(/\s+/g, ' ').trim();
      if (!text) return cb({ ok: false, message: '지금 기분이나 상황을 적어 주세요.' });
      const now = Date.now();
      djTimes = djTimes.filter((t) => now - t < 60000);
      if (djTimes.length >= 8) return cb({ ok: false, message: '잠시 후 다시 물어봐 주세요.' });
      djTimes.push(now);
      const r = await recommend(text);
      const demo = isAdminKey(data?.demoKey);
      cb({ ok: true, status: r.status, track: r.track || null, reason: r.reason || '', ...(demo ? { trace: r.trace, demo: true } : {}) });
    });

    socket.on('radio:request', (data, cb) => {
      if (socket.data.place !== 'rooftop') return cb?.({ ok: false, message: '옥상 라디오에서만 신청할 수 있어요.' });
      cb?.(radio.request(user, String(data?.trackId ?? '')));
    });

    socket.on('disconnect', () => leavePlace(socket));
  });

  return io;
}
