import { api, store, koDate } from './api.js';
import * as net from './net.js';
import { Stage } from './stage.js';
import { PLACES, routeTo, pathDuration } from './shared/places.js';
import { room } from './scenes/room.js';
import { rooftop } from './scenes/rooftop.js';
import { park } from './scenes/park.js';
import { drawAvatar } from './render/pixel.js';
import { toast, closeAllModals } from './ui/modal.js';
import { openDiary, forgetEntry } from './ui/diary.js';
import { openBookshelf } from './ui/bookshelf.js';
import { openBook } from './ui/book.js';
import { openPlaces, openRadio, openTree, openStarWish, openWish, openMyWishes } from './ui/outdoor.js';
import { radio } from './audio/radio.js';
import * as amb from './audio/ambience.js';

const SCENES = { room, rooftop, park };
const $ = (s) => document.querySelector(s);

let user = null;
let stage = null;
let place = 'room';
let counts = { rooftop: 0, park: 0 };
let mySid = null;
let roomSeat = null; // 방에서 앉아 있는(또는 앉으러 가는) 자리
let moveToken = 0;
let starBtn = null;
let firstHint = null;

// ───────────── 첫 화면 ─────────────
function drawLanding() {
  const cv = $('#landing-art');
  cv.width = 320; cv.height = 180;
  const c = cv.getContext('2d');
  room.background(c, { bookCount: 7 });
  room.animate(c, 0);
  drawAvatar(c, 150, 130, 3, { pose: 'sit', back: true });
  room.props[0].draw(c);
}

async function boot() {
  drawLanding();
  // 느린 연결에서도 바로 누를 수 있도록 이전 세션 확인보다 먼저 연결
  $('#start-btn').addEventListener('click', start);
  try {
    const { user: u } = await api('/api/me');
    if (u && !user) $('#start-btn').textContent = `내 방으로 들어가기 · ${u.nickname}`;
  } catch { /* 첫 방문 */ }
}

async function start() {
  $('#start-btn').disabled = true;
  try {
    const r = await api('/api/guest', { method: 'POST' });
    user = r.user;
    if (r.created) toast(`임시 닉네임 ‘${user.nickname}’(으)로 입장했어요`);
    enterGame();
  } catch (e) {
    $('#start-error').hidden = false; $('#start-error').textContent = e.message;
    $('#start-btn').disabled = false;
  }
}

function enterGame() {
  $('#landing').hidden = true;
  $('#game').hidden = false;
  $('#hud-name').textContent = `🙂 ${user.nickname}`;
  stage = new Stage();
  bindStage();
  bindSocket();
  net.connect({ onConnect: onReconnect });
  bindHud();
  setInterval(tickSounds, 110);
  enterRoom('center');
}

// ───────────── 공통 ─────────────
async function fade(fn) {
  $('#fade').classList.add('on');
  await new Promise((r) => setTimeout(r, 330));
  await fn();
  $('#fade').classList.remove('on');
}

function setHud() {
  $('#hud-place').textContent = PLACES[place].name;
  $('#my-wishes-btn').hidden = place === 'room';
  $('#chat-form').hidden = place !== 'rooftop';
  // 화면 아래 띠는 옥상 채팅 입력창이 필요할 때만 (상시 조작 설명은 두지 않음)
  $('#bottom').hidden = place !== 'rooftop';
  stage.resize();
}

// ───────────── 내 방 (혼자만의 공간, 서버 접속자 수에 포함되지 않음) ─────────────
async function enterRoom(from = 'door') {
  place = 'room';
  roomSeat = null;
  stage.setScene(room, PLACES.room, 'room', {});
  const n = PLACES.room.targets[from] || PLACES.room.spawn;
  stage.upsert('me', { nickname: user.nickname, color: user.color, me: true, points: [{ x: n.x, y: n.y }], startAt: net.now(), seat: null });
  setHud();
  refreshRoomBooks();
  if (!store.get('firstHintShown')) {
    store.set('firstHintShown', true);
    firstHint = stage.banner(150, 66, '책상을 눌러 오늘의 한 장을 기록해 보세요', 20000, 'first-hint');
  }
}

/** 방 책장의 책 그림을 실제 기록 수에 맞춤 */
async function refreshRoomBooks() {
  try {
    const { months } = await api('/api/diary/months');
    if (place === 'room') stage.renderBackground({ bookCount: months.reduce((s, m) => s + m.count, 0) });
  } catch { /* */ }
}

/**
 * 방 안에서 목표 위치(또는 자리)까지 걷기. 가구는 돌아가고, 걷는 도중 다시 누르면 지금 위치에서 방향을 바꿉니다.
 * 도착하면 true, 다른 이동으로 취소되면 false
 */
function walkLocal(target, seat = null) {
  const token = ++moveToken;
  const e = stage.entities.get('me');
  const cur = stage.pos(e);
  if (seat && roomSeat === seat && !cur.moving) return Promise.resolve(true); // 이미 앉아 있음
  const seatedNow = roomSeat && !cur.moving ? roomSeat : null;
  const pts = routeTo('room', cur, target, { seatNow: seatedNow, seatTo: seat });
  if (!pts) return Promise.resolve(false);
  stage.upsert('me', { points: pts.length > 1 ? pts : [pts[0], pts[0]], startAt: net.now(), seat });
  roomSeat = seat;
  return new Promise((r) => setTimeout(() => r(token === moveToken), pathDuration(pts) + 60));
}
const sitAtDesk = () => walkLocal(PLACES.room.seats.chair.approach, 'chair');

async function openMonth(month, entryId) {
  if (place === 'room' && !(await sitAtDesk())) return;
  try {
    const { entries } = await api(`/api/diary/month/${month}`);
    if (!entries.length) return toast('이 달에는 기록이 없어요.');
    const idx = Math.max(0, entries.findIndex((e) => e.id === entryId));
    const [y, m] = month.split('-');
    openBook({ title: `📖 ${y}년 ${Number(m)}월의 책`, entries, index: entryId ? idx : 0, onDeleted: (e) => { forgetEntry(e.id); refreshRoomBooks(); } });
  } catch (e) { toast(e.message); }
}

function openExample(examples, id) {
  const idx = Math.max(0, examples.findIndex((e) => e.id === id));
  openBook({ title: '📘 예시 기록 (체험용)', entries: examples, index: idx, example: true });
}

async function onRoomHotspot(id) {
  if (id === 'desk') {
    firstHint?.remove(); firstHint = null;
    if (await sitAtDesk()) openDiary({ onViewInShelf: openMonth });
  } else if (id === 'shelf') {
    if (await walkLocal(PLACES.room.targets.shelf)) openBookshelf({ onOpenMonth: openMonth, onOpenExample: openExample });
  } else if (id === 'door') {
    if (await walkLocal(PLACES.room.targets.door)) openPlaces({ counts, onChoose: goOutside });
  }
}

// ───────────── 야외 (옥상 / 공원) ─────────────
const toEntity = (p) => ({
  nickname: p.nickname, color: p.color, me: p.sid === mySid, points: p.points, startAt: p.startAt, seat: p.seat,
  wish: p.wish ? { wishId: p.wish.wishId, until: localTime(p.wish.until) } : null,
});
const localTime = (serverTs) => serverTs - (net.now() - Date.now());

async function goOutside(placeId, { silent = false } = {}) {
  const run = async () => {
    const r = await net.emit('join', { place: placeId });
    if (!r?.ok) { toast(r?.message || '입장하지 못했어요.'); return; }
    if (place === 'rooftop' && placeId !== 'rooftop') radio.leave();
    if (placeId !== 'park') amb.stopNight();
    place = placeId; mySid = r.you;
    stage.setScene(SCENES[placeId], PLACES[placeId], placeId, {});
    r.players.forEach((p) => stage.upsert(p.sid, toEntity(p)));
    setHud();
    if (placeId === 'rooftop') radio.enter(r.radio); else radio.leave();
    if (placeId === 'park') refreshTree();
    if (!silent) toast(`${PLACES[placeId].name}에 왔어요 · 지금 ${counts[placeId] || r.players.length}명`);
  };
  if (silent) await run(); else await fade(run);
}

async function refreshTree() {
  try {
    const { wishes } = await api('/api/wishes/tree');
    if (place === 'park') stage.renderBackground({ treeCount: wishes.length });
  } catch { /* */ }
}

async function goHome() {
  closeAllModals();
  hideStarButton();
  await fade(async () => {
    await net.emit('leave');
    radio.leave();
    amb.stopNight();
    mySid = null;
    await enterRoom('door');
  });
}

/** 야외에서 새 행동(바닥·자리·라디오·나무·출입구 클릭)이 생길 때마다 증가 → 걷던 귀가 동작은 취소됨 */
let outdoorIntent = 0;
const newIntent = () => ++outdoorIntent;

/** 계단실 문 / 산책로 입구: 그곳까지 걸어간 뒤 내 방으로. 도착 전에 다른 곳을 누르면 취소 */
async function walkHome() {
  const token = newIntent();
  const from = place;
  const target = PLACES[from].targets.exit;
  const r = await net.emit('move', target);
  if (!r?.ok) { if (r?.message) toast(r.message); return; }
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    await new Promise((res) => setTimeout(res, 100));
    if (token !== outdoorIntent || place !== from) return; // 다른 곳을 눌러 귀가 취소
    const e = stage.entities.get(mySid);
    if (!e) return;
    const p = stage.pos(e);
    const end = e.points[e.points.length - 1];
    if (!p.moving && Math.hypot(end.x - target.x, end.y - target.y) <= 3) return goHome();
  }
}

function onOutdoorHotspot(id) {
  if (id === 'exit') return walkHome();
  newIntent();
  if (id === 'radio') { net.emit('move', PLACES.rooftop.targets.radio); openRadio({ getState: radio.getState, myUserId: user.id }); }
  if (id === 'tree') { net.emit('move', PLACES.park.targets.tree); openTree({ onPosted: (n) => place === 'park' && stage.renderBackground({ treeCount: n }) }); }
}

// ───────────── 별똥별 ─────────────
function hideStarButton() { starBtn?.remove(); starBtn = null; }

function onStar(ev) {
  if (ev.place !== place) return;
  stage.showStar({ ...ev, at: ev.at });
  const showAt = localTime(ev.at) + 1500;
  setTimeout(() => {
    if (place !== ev.place) return;
    hideStarButton();
    starBtn = document.createElement('button');
    starBtn.className = 'btn btn-glow wish-btn';
    starBtn.textContent = '🌠 별똥별이 지나갔어요 · 소원 빌기';
    starBtn.addEventListener('click', () => { hideStarButton(); openStarWish({ starId: ev.id, place: ev.place }); });
    stage.overlay.appendChild(starBtn);
    const b = starBtn;
    setTimeout(() => { if (starBtn === b) hideStarButton(); }, 20000);
  }, Math.max(0, showAt - Date.now()));
}

// ───────────── 연결 ─────────────
function bindStage() {
  stage.on('hotspot', (id) => (place === 'room' ? onRoomHotspot(id) : onOutdoorHotspot(id)));
  // 빈 바닥: 방에서는 혼자 걷고, 옥상·공원에서는 서버가 경로를 정해 모든 화면에 같은 움직임을 보냄
  stage.on('floor', async (_id, hit) => {
    if (place === 'room') return walkLocal({ x: hit.x, y: hit.y });
    newIntent();
    const r = await net.emit('move', { x: hit.x, y: hit.y });
    if (r && !r.ok && r.message) toast(r.message);
  });
  stage.on('seat', async (id) => {
    if (place === 'room') return;
    newIntent();
    const r = await net.emit('sit', { seat: id });
    if (!r?.ok && r?.message) toast(r.message);
  });
  stage.on('wish', (id) => { const e = stage.entities.get(id); if (e?.wish) openWish(e.wish.wishId); });
}

function bindSocket() {
  net.on('counts', (c) => { counts = c; });
  net.on('player:join', (p) => { if (place !== 'room') stage.upsert(p.sid, toEntity(p)); });
  net.on('player:leave', ({ sid }) => { if (place !== 'room') stage.remove(sid); });
  net.on('player:move', (m) => { if (place !== 'room' && stage.entities.has(m.sid)) stage.upsert(m.sid, { points: m.points, startAt: m.startAt, seat: m.seat }); });
  net.on('chat', ({ sid, text }) => { if (place === 'rooftop') stage.say(sid, text); });
  net.on('wish:float', ({ sid, wishId, until }) => { const e = stage.entities.get(sid); if (e && place !== 'room') e.wish = { wishId, until: localTime(until) }; });
  net.on('star', onStar);
  net.on('radio', (snap) => radio.apply(snap, snap.kind));
  net.on('wish:reaction', ({ kind, text }) => toast(`누군가 내 소원 “${text.slice(0, 20)}${text.length > 20 ? '…' : ''}”에 ${kind === 'cheer' ? '📣 응원' : '🤝 공감'}을 보냈어요`, 4500));
  radio.onStarted((cur) => { if (place === 'rooftop') stage.banner(250, 90, `${cur.requestedBy} 님의 신청곡 ♪`, 7000); });
  net.on('connect_error', (err) => { if (err?.message === 'no_session') toast('게스트 세션이 만료됐어요. 새로고침 후 다시 시작해 주세요.', 6000); });
}

let connectedOnce = false;
function onReconnect() {
  if (connectedOnce && place !== 'room') goOutside(place, { silent: true });
  connectedOnce = true;
}

function bindHud() {
  $('#my-wishes-btn').addEventListener('click', openMyWishes);
  const seg = new Intl.Segmenter('ko', { granularity: 'grapheme' });
  const len = (s) => [...seg.segment(s)].length;
  const input = $('#chat-input'), counter = $('#chat-count');
  input.addEventListener('input', () => {
    const n = len(input.value.trim());
    counter.textContent = `${n}/50`; counter.classList.toggle('over', n > 50);
  });
  $('#chat-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    if (len(text) > 50) return toast('한 번에 50자까지 말할 수 있어요.');
    const r = await net.emit('chat', { text });
    if (r?.ok) { input.value = ''; counter.textContent = '0/50'; counter.classList.remove('over'); } else if (r?.message) toast(r.message);
  });
}

// 공원: 걸을 때 발소리, 벤치에 앉아 있을 때 풀벌레·바람 소리
let lastStep = 0;
function tickSounds() {
  if (!stage) return;
  if (place === 'rooftop') stage.sceneState.radioPlaying = radio.isAudible();
  if (place !== 'park') { amb.stopNight(); return; }
  const e = stage.entities.get(mySid);
  if (!e) return;
  const p = stage.pos(e);
  if (p.moving) {
    amb.stopNight();
    if (Date.now() - lastStep > 340) { amb.footstep(); lastStep = Date.now(); }
  } else if (e.seat) amb.startNight();
  else amb.stopNight();
}

// 디버그/자동 테스트용 읽기 전용 상태
window.__haru = {
  get place() { return place; }, get mySid() { return mySid; }, get user() { return user; },
  entities: () => stage ? [...stage.entities.values()].map((e) => ({ id: e.id, nickname: e.nickname, seat: e.seat, me: e.me, bubble: e.bubble?.el.textContent || null, wish: !!e.wish, pos: stage.pos(e), points: e.points, startAt: e.startAt })) : [],
  radio: () => { const a = document.getElementById('radio-audio'); return { src: a.src, paused: a.paused, muted: a.muted, time: a.currentTime, state: radio.getState() }; },
  ambience: () => amb.isNightOn(),
  get star() { return stage?.star; },
  koDate,
};

boot();
