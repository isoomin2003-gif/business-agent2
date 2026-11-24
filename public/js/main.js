import { api, store, koDate } from './api.js';
import * as net from './net.js';
import { Stage } from './stage.js';
import { PLACES, findPath, pathPoints, pathDuration } from './shared/places.js';
import { room } from './scenes/room.js';
import { rooftop } from './scenes/rooftop.js';
import { park } from './scenes/park.js';
import { drawAvatar } from './render/pixel.js';
import { toast, closeAllModals } from './ui/modal.js';
import { openDiary } from './ui/diary.js';
import { openBookshelf } from './ui/bookshelf.js';
import { openBook } from './ui/book.js';
import { openPlaces, openRadio, openTree, openStarWish, openWish, openMyWishes } from './ui/outdoor.js';
import { radio } from './audio/radio.js';
import * as amb from './audio/ambience.js';

const SCENES = { room, rooftop, park };
const HINTS = {
  room: '책상에서 다이어리 쓰기 · 책장에서 지난 기록과 기억 찾기 · 문으로 밖에 나가기',
  rooftop: '빛나는 ◇ 지점이나 벤치의 빈자리를 눌러 이동해요. 라디오를 누르면 지금 곡·신청·음원 정보를 볼 수 있어요.',
  park: '말없이 함께 쉬는 곳이에요. 벤치에 앉으면 풀벌레와 바람 소리가 들려요. 소원 나무를 눌러 소원을 읽고 걸 수 있어요.',
};
const $ = (s) => document.querySelector(s);

let user = null;
let stage = null;
let place = 'room';
let counts = { rooftop: 0, park: 0 };
let mySid = null;
let roomMe = { node: 'door', seat: null };
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
  try {
    const { user: u } = await api('/api/me');
    if (u) $('#start-btn').textContent = `내 방으로 들어가기 · ${u.nickname}`;
  } catch { /* 첫 방문 */ }
  $('#start-btn').addEventListener('click', start);
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
  $('#home-btn').hidden = place === 'room';
  $('#my-wishes-btn').hidden = place === 'room';
  $('#chat-form').hidden = place !== 'rooftop';
  $('#hint').textContent = HINTS[place];
}

// ───────────── 내 방 (혼자만의 공간, 서버 접속자 수에 포함되지 않음) ─────────────
async function enterRoom(from = 'door') {
  place = 'room';
  roomMe = { node: from, seat: null };
  stage.setScene(room, PLACES.room, 'room', {});
  const n = PLACES.room.nodes[from];
  stage.upsert('me', { nickname: user.nickname, color: user.color, me: true, points: [{ x: n.x, y: n.y }], startAt: net.now(), seat: null });
  setHud();
  try {
    const { months } = await api('/api/diary/months');
    if (place === 'room') stage.renderBackground({ bookCount: months.reduce((s, m) => s + m.count, 0) });
  } catch { /* */ }
  if (!store.get('firstHintShown')) {
    store.set('firstHintShown', true);
    firstHint = stage.banner(150, 66, '책상을 눌러 오늘의 한 장을 기록해 보세요', 20000, 'first-hint');
  }
}

/** 방 안에서 정해진 경로로 걷기. 도착하면 true, 다른 이동으로 취소되면 false */
function moveLocal(node, seat = null) {
  const token = ++moveToken;
  const e = stage.entities.get('me');
  const cur = stage.pos(e);
  if (roomMe.node === node && roomMe.seat === seat) return Promise.resolve(true);
  const path = findPath('room', roomMe.node, node) || [node];
  const pts = [{ x: cur.x, y: cur.y }, ...pathPoints('room', path, seat)];
  stage.upsert('me', { points: pts, startAt: net.now(), seat });
  roomMe = { node, seat };
  return new Promise((r) => setTimeout(() => r(token === moveToken), pathDuration(pts) + 60));
}

async function openMonth(month, entryId) {
  if (place === 'room' && !(await moveLocal('desk', 'chair'))) return;
  try {
    const { entries } = await api(`/api/diary/month/${month}`);
    if (!entries.length) return toast('이 달에는 기록이 없어요.');
    const idx = Math.max(0, entries.findIndex((e) => e.id === entryId));
    const [y, m] = month.split('-');
    openBook({ title: `📖 ${y}년 ${Number(m)}월의 책`, entries, index: entryId ? idx : 0 });
  } catch (e) { toast(e.message); }
}

function openExample(examples, id) {
  const idx = Math.max(0, examples.findIndex((e) => e.id === id));
  openBook({ title: '📘 예시 기록 (체험용)', entries: examples, index: idx, example: true });
}

async function onRoomHotspot(id) {
  if (id === 'desk') {
    firstHint?.remove(); firstHint = null;
    if (await moveLocal('desk', 'chair')) openDiary({ onViewInShelf: openMonth });
  } else if (id === 'shelf') {
    if (await moveLocal('shelf')) openBookshelf({ onOpenMonth: openMonth, onOpenExample: openExample });
  } else if (id === 'door') {
    if (await moveLocal('door')) openPlaces({ counts, onChoose: goOutside });
  }
}

// ───────────── 야외 (옥상 / 공원) ─────────────
const toEntity = (p) => ({
  nickname: p.nickname, color: p.color, me: p.sid === mySid, points: p.points, startAt: p.startAt, seat: p.seat, node: p.node,
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

function onOutdoorHotspot(id) {
  if (id === 'exit') return goHome();
  if (id === 'radio') { net.emit('move', { node: 'radio' }); openRadio({ getState: radio.getState, myUserId: user.id }); }
  if (id === 'tree') { net.emit('move', { node: 'tree' }); openTree({ onPosted: (n) => place === 'park' && stage.renderBackground({ treeCount: n }) }); }
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
  stage.on('node', (id) => place !== 'room' && net.emit('move', { node: id }));
  stage.on('seat', async (id) => {
    if (place === 'room') return;
    const r = await net.emit('sit', { seat: id });
    if (!r?.ok && r?.message) toast(r.message);
  });
  stage.on('wish', (id) => { const e = stage.entities.get(id); if (e?.wish) openWish(e.wish.wishId); });
}

function bindSocket() {
  net.on('counts', (c) => { counts = c; });
  net.on('player:join', (p) => { if (place !== 'room') stage.upsert(p.sid, toEntity(p)); });
  net.on('player:leave', ({ sid }) => { if (place !== 'room') stage.remove(sid); });
  net.on('player:move', (m) => { if (place !== 'room' && stage.entities.has(m.sid)) stage.upsert(m.sid, { points: m.points, startAt: m.startAt, seat: m.seat, node: m.node }); });
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
  $('#home-btn').addEventListener('click', goHome);
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
  entities: () => stage ? [...stage.entities.values()].map((e) => ({ id: e.id, nickname: e.nickname, seat: e.seat, me: e.me, bubble: e.bubble?.el.textContent || null, wish: !!e.wish, pos: stage.pos(e) })) : [],
  radio: () => { const a = document.getElementById('radio-audio'); return { src: a.src, paused: a.paused, muted: a.muted, time: a.currentTime, state: radio.getState() }; },
  ambience: () => amb.isNightOn(),
  get star() { return stage?.star; },
  koDate,
};

boot();
