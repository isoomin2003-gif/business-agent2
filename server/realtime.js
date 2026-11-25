import crypto from 'node:crypto';
import { Server } from 'socket.io';
import { PLACES, OUTDOOR, routeTo, positionAt } from '../public/js/shared/places.js';
import { COOKIE, parseCookieHeader, userFromToken, hashToken } from './auth.js';
import { createRadio } from './radio.js';
import { discover } from './discover.js';
import { getTrack, addedIds, registerTrack, licenseLabel } from './library.js';
import { isAdminKey } from './auth.js';
import { config } from './config.js';
import { getSong, songTrack } from './compose.js';

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

// ───────────── 전체 접속자 수 ─────────────
// 사람 단위로 셈: 계정(게스트 포함)은 user id, 아직 입장 전인 첫 방문자는 브라우저마다 정한 방문자 id.
// 같은 계정의 여러 탭·브라우저는 1명. 연결이 끊겨도 잠깐(새로고침·장소 이동) 기다렸다가 빼서 숫자가 출렁이지 않게 함
export const PRESENCE_GRACE_MS = Number(process.env.PRESENCE_GRACE_MS || 8000);
const presence = new Map(); // key → { sockets: Set<socketId>, timer }
let lastOnline = -1;
export const onlineCount = () => presence.size;
function broadcastOnline() {
  const n = presence.size;
  if (n === lastOnline || !io) return;
  lastOnline = n;
  io.emit('online', { count: n });
}
function presenceAdd(key, sid) {
  let e = presence.get(key);
  if (!e) { e = { sockets: new Set(), timer: null }; presence.set(key, e); }
  clearTimeout(e.timer); e.timer = null;
  e.sockets.add(sid);
  broadcastOnline();
}
function presenceRemove(key, sid, { now = false } = {}) {
  const e = presence.get(key);
  if (!e) return;
  e.sockets.delete(sid);
  if (e.sockets.size) return;
  clearTimeout(e.timer);
  const drop = () => { if (presence.get(key) === e && !e.sockets.size) { presence.delete(key); broadcastOnline(); } };
  if (now) drop(); else e.timer = setTimeout(drop, PRESENCE_GRACE_MS);
}

/** 같은 브라우저의 방문자 항목(다른 탭 포함)을 계정 항목으로 합침 → 같은 사람이 두 번 세어지지 않음 */
function mergeVisitor(visitor, userKey) {
  const v = presence.get(`v:${visitor}`);
  if (!v) return;
  presence.delete(`v:${visitor}`);
  clearTimeout(v.timer);
  for (const sid of v.sockets) {
    const s = io.of('/').sockets.get(sid);
    if (s) { s.data.presenceKey = userKey; presenceAdd(userKey, sid); }
  }
  broadcastOnline();
}

/** 로그인·로그아웃으로 바뀐 세션의 실시간 연결을 끊음 (그 브라우저는 새 세션으로 다시 연결) */
export function dropSessionSockets(token) {
  if (!io) return;
  const h = hashToken(String(token));
  for (const [, s] of io.of('/').sockets) if (s.data.sessionHash === h) s.disconnect(true);
}

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

// 같은 곡을 동시에 등록하려 해도 DB에는 한 번만
const registering = new Map();
function registerOnce(c, nickname, before) {
  if (!registering.has(c.id)) registering.set(c.id, (async () => { if (before) await before(); return registerTrack(c, nickname); })().finally(() => registering.delete(c.id)));
  return registering.get(c.id);
}

export function setupRealtime(server) {
  io = new Server(server, { cors: { origin: false }, maxHttpBufferSize: 1e4 });
  radio = createRadio((kind) => {
    const snap = radio.snapshot();
    io.to('rooftop').emit('radio', { ...snap, kind });
  });
  radio.begin();
  OUTDOOR.forEach(scheduleStar);

  // 세션이 없는 첫 방문자도 연결은 받아 접속자 수에 넣음 (장소 입장·대화 등은 세션이 있어야 함)
  io.use((socket, next) => {
    const token = parseCookieHeader(socket.handshake.headers.cookie)[COOKIE];
    const visitor = String(socket.handshake.auth?.visitor || '');
    socket.data.visitor = /^[A-Za-z0-9_-]{8,64}$/.test(visitor) ? visitor : null;
    userFromToken(token).then((user) => {
      socket.data.user = user;
      socket.data.sessionHash = user ? hashToken(token) : null;
      socket.data.place = 'room';
      socket.data.presenceKey = user ? `u:${user.id}` : socket.data.visitor ? `v:${socket.data.visitor}` : `s:${socket.id}`;
      next();
    }).catch((e) => { console.error('[socket] auth failed:', e.message); next(new Error('server_error')); });
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    // 같은 브라우저가 입장(게스트 생성)·로그인하면 방문자 id 대신 계정으로 셈 → 방문자 항목은 바로 뺌
    if (user && socket.data.visitor) mergeVisitor(socket.data.visitor, socket.data.presenceKey);
    presenceAdd(socket.data.presenceKey, socket.id);
    socket.emit('online', { count: presence.size });
    socket.emit('counts', counts());
    socket.on('time', (cb) => typeof cb === 'function' && cb(Date.now()));
    socket.on('disconnect', () => presenceRemove(socket.data.presenceKey, socket.id));
    socket.emit('session', { user: user ? { id: user.id, nickname: user.nickname, registered: user.registered } : null });
    if (!user) return; // 아래 기능은 세션이 있어야 함
    let lastChat = 0;

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

    // 새 노래 추천받기: 요청한 사람에게만 응답(ack). 공용 대기열·재생은 건드리지 않음 — 신청은 radio:request로 따로
    let discoverTimes = [];
    const shown = new Map(); // 이 사람에게 보여 준 외부 후보 (신청할 때 이 목록에 있는 곡만 받음 → 임의 주소 신청 불가)
    socket.on('radio:discover', async (data, cb) => {
      if (typeof cb !== 'function') return;
      if (socket.data.place !== 'rooftop') return cb({ ok: false, message: '옥상 라디오에서만 추천받을 수 있어요.' });
      const text = String(data?.text ?? '').replace(/\s+/g, ' ').trim();
      if (!text) return cb({ ok: false, message: '원하는 분위기나 악기를 적어 주세요.' });
      const now = Date.now();
      discoverTimes = discoverTimes.filter((t) => now - t < 60000);
      if (discoverTimes.length >= 6) return cb({ ok: false, message: '잠시 후 다시 추천받아 주세요.' });
      discoverTimes.push(now);
      // 제외: 라디오에 이미 추가된 곡 + 지금 재생·대기 중인 곡 + (다른 곡 보기) 이번에 보여 준 곡
      const exclude = new Set([...addedIds(), ...radio.activeIds(), ...(data?.more ? shown.keys() : [])]);
      const r = await discover(text, exclude);
      r.picks.forEach((c) => shown.set(c.id, c));
      const pub = r.picks.map((c) => ({
        id: c.id, title: c.title, artist: c.artist, reason: c.reason, seconds: Math.round(c.durationMs / 1000), source: c.source, sourceUrl: c.sourceUrl,
        license: licenseLabel(c.license, c.licenseVersion), licenseUrl: c.licenseUrl, attribution: c.attribution, needsAttribution: c.license === 'by' || c.license === 'by-sa',
      }));
      cb({ ok: true, status: r.status, picks: pub, ...(isAdminKey(data?.demoKey) ? { trace: r.trace, demo: true } : {}) });
    });

    socket.on('radio:request', async (data, cb) => {
      if (socket.data.place !== 'rooftop') return cb?.({ ok: false, message: '옥상 라디오에서만 신청할 수 있어요.' });
      const trackId = String(data?.trackId ?? '');
      // 한 사람당 한 번에 한 곡: 내 신청곡이 대기·재생 중이면 어떤 곡이든 바로 거절 (추천곡·AI 작곡곡·기본 선곡표 모두)
      if (radio.hasActiveRequest(user)) return cb?.(radio.request(user, trackId));
      if (!getTrack(trackId) && trackId.startsWith('ai:')) {
        // AI 작곡곡: 만든 사람만 신청 가능. 음원은 작곡할 때 이미 저장됨 → 라디오 목록에만 추가
        if (!radio.canRequest(user)) return cb?.(radio.request(user, trackId)); // 한 사람당 한 번에 한 곡 등
        const d = await getSong(trackId, user.id);
        if (!d) return cb?.({ ok: false, message: '내가 만든 곡만 신청할 수 있어요.' });
        if (!radio.canRequest(user)) return cb?.(radio.request(user, trackId));
        try { await registerOnce(songTrack(d), user.nickname); } catch (e) { console.error('[radio] compose register failed', e.message); return cb?.({ ok: false, message: '곡을 등록하지 못했어요. 잠시 후 다시 시도해 주세요.' }); }
      } else if (!getTrack(trackId)) {
        const c = shown.get(trackId);
        if (!c) return cb?.({ ok: false, message: '추천받은 곡만 신청할 수 있어요.' });
        if (radio.activeIds().has(trackId)) return cb?.({ ok: false, code: 'already', message: '이미 신청된 곡이에요.' });
        if (!radio.canRequest(user)) return cb?.(radio.request(user, trackId)); // 1인 1곡 등 규칙 메시지
        try { await registerOnce(c, user.nickname); } catch (e) { console.error('[radio] register failed', e.message); return cb?.({ ok: false, message: '곡을 등록하지 못했어요. 잠시 후 다시 시도해 주세요.' }); }
      }
      cb?.(radio.request(user, trackId));
    });

    socket.on('disconnect', () => leavePlace(socket));
  });

  return io;
}
