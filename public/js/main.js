import { api, store, koDate } from './api.js';
import * as net from './net.js';
import { Stage } from './stage.js';
import { PLACES, routeTo, pathDuration } from './shared/places.js';
import { room } from './scenes/room.js';
import { rooftop } from './scenes/rooftop.js';
import { park, noteSlots } from './scenes/park.js';
import { drawAvatar } from './render/pixel.js';
import { toast, closeAllModals, openModal } from './ui/modal.js';
import { openDiary, forgetEntry } from './ui/diary.js';
import { openBookshelf } from './ui/bookshelf.js';
import { openBook } from './ui/book.js';
import { openPlaces, openRadio, openTree, openStarWish, openWish, openMyWishes } from './ui/outdoor.js';
import { openManual, openShop } from './ui/manual.js';
import { iconSvg } from './render/icons.js';
import { radio } from './audio/radio.js';
import * as amb from './audio/ambience.js';
import * as roomMusic from './audio/roommusic.js';

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
  drawAvatar(c, PLACES.room.seats.chair.x, PLACES.room.seats.chair.y + 2, 3, { pose: 'sit', back: true });
  room.props[0].draw(c);
}

// ───────────── 첫 화면 (닉네임 확인·변경) ─────────────
let pendingNick = null; // 아직 계정이 없는 첫 방문자의 닉네임(바로 시작하기를 누를 때 계정 생성)

function showNick(name) {
  $('#nick-text').textContent = name;
  $('#nick-view').hidden = false; $('#nick-form').hidden = true;
}
function nickMsg(text, err = false) {
  const el = $('#nick-msg'); el.hidden = !text; el.textContent = text || ''; el.classList.toggle('err', err);
}

// 로그아웃 뒤 뒤로가기로 돌아온 경우(브라우저가 저장해 둔 화면) 다시 불러와 개인 기록이 보이지 않게
window.addEventListener('pageshow', (e) => { if (e.persisted) location.reload(); });

// ───────────── 전체 접속자 수 (홈·방·옥상·공원 공통 상단) ─────────────
function paintOnline(n) { document.querySelectorAll('[data-online]').forEach((el) => { el.textContent = `현재 접속: ${n}명`; }); }

// ───────────── 계정 (게스트 → 정식 계정, 로그인, 로그아웃) ─────────────
function paintAccount() {
  const reg = !!user?.registered;
  $('#acct-badge').hidden = !reg;
  $('#acct-create').hidden = reg;
  $('#acct-login').hidden = reg;
  $('#acct-logout').hidden = !reg;
  $('#landing-fine').hidden = reg;
}

function accountForm(fields, submitLabel) {
  return `<form class="acct-form" autocomplete="on">${fields}<p class="status" data-status aria-live="polite"></p>
    <button class="btn btn-primary" data-submit>${submitLabel}</button></form>`;
}

function openCreateAccount() {
  const m = openModal({
    title: '내 계정 만들기', label: '내 계정 만들기',
    html: `<p class="muted" style="font-size:14px;margin-top:0">지금 쓰고 있는 방과 다이어리·영상·소원을 그대로 이어받아 정식 계정이 돼요. 다른 브라우저나 컴퓨터에서도 닉네임과 비밀번호로 내 방에 들어올 수 있어요.</p>
      ${accountForm(`<label>닉네임 (다른 사람과 겹치지 않는 이름, 최대 12자)<input name="nickname" maxlength="24" autocomplete="username" required></label>
        <label>비밀번호 (8자 이상)<input name="password" type="password" maxlength="64" autocomplete="new-password" required></label>
        <label>비밀번호 확인<input name="passwordConfirm" type="password" maxlength="64" autocomplete="new-password" required></label>`, '계정 만들기')}`,
  });
  const f = m.$('form'), st = m.$('[data-status]');
  f.nickname.value = user?.nickname || pendingNick || '';
  f.nickname.focus(); f.nickname.select();
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nickname = f.nickname.value.trim(), password = f.password.value, passwordConfirm = f.passwordConfirm.value;
    if (password !== passwordConfirm) { st.textContent = '비밀번호 확인이 일치하지 않아요.'; st.className = 'status err'; return; }
    m.$('[data-submit]').disabled = true; st.textContent = ''; st.className = 'status';
    try {
      if (!user) { user = (await api('/api/guest', { method: 'POST', body: {} })).user; await net.reconnect(); }
      const r = await api('/api/account/register', { method: 'POST', body: { nickname, password, passwordConfirm } });
      user = { ...user, ...r.user };
      showNick(user.nickname); paintAccount();
      $('#start-btn').textContent = '내 방으로 들어가기';
      m.close();
      nickMsg('정식 계정이 되었어요. 지금까지의 기록은 그대로예요.');
    } catch (err) {
      st.textContent = err.message; st.className = 'status err';
      if (err.data?.error === 'taken') f.nickname.focus();
    } finally { if (m.$('[data-submit]')) m.$('[data-submit]').disabled = false; }
  });
}

function openLogin() {
  const guestWarn = user && !user.registered
    ? '<p class="notice" style="font-size:14px">지금 이 브라우저의 임시 게스트 기록은 정식 계정으로 만들어 두지 않으면, 다른 계정으로 로그인한 뒤에는 다시 열 수 없어요.</p>' : '';
  const m = openModal({
    title: '로그인', label: '로그인',
    html: `${guestWarn}${accountForm(`<label>닉네임<input name="nickname" maxlength="24" autocomplete="username" required></label>
      <label>비밀번호<input name="password" type="password" maxlength="64" autocomplete="current-password" required></label>`, '로그인')}`,
  });
  const f = m.$('form'), st = m.$('[data-status]');
  f.nickname.focus();
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    m.$('[data-submit]').disabled = true; st.textContent = ''; st.className = 'status';
    try {
      await api('/api/account/login', { method: 'POST', body: { nickname: f.nickname.value.trim(), password: f.password.value } });
      try { sessionStorage.setItem('haruEnter', '1'); } catch { /* */ }
      location.replace('/'); // 새 계정으로 처음부터 다시 불러와 원래 방으로
    } catch (err) {
      st.textContent = err.message; st.className = 'status err';
      m.$('[data-submit]').disabled = false;
    }
  });
}

async function logout() {
  $('#acct-logout').disabled = true;
  try { await api('/api/account/logout', { method: 'POST' }); } catch { /* 이미 끝난 세션 */ }
  store.clearPrefix('draft:'); // 이 브라우저에 임시 저장된 다이어리 문장
  location.replace('/');
}

async function boot() {
  drawLanding();
  // 상단 아이콘 버튼: 상점(줄무늬 천막 가판대), 사용 설명서(청록 표지 책)
  document.querySelectorAll('[data-open-manual]').forEach((b) => { b.innerHTML = iconSvg('book', 24); b.addEventListener('click', () => openManual(0)); });
  $('#shop-btn').innerHTML = iconSvg('shop', 24);
  $('#shop-btn').addEventListener('click', () => openShop({ onManual: () => openManual(3) }));
  net.on('online', ({ count }) => paintOnline(count));
  net.onConnect(() => { if (gameReady) onReconnect(); });
  net.connect();
  $('#acct-create').addEventListener('click', openCreateAccount);
  $('#acct-login').addEventListener('click', openLogin);
  $('#acct-logout').addEventListener('click', logout);
  // 느린 연결에서도 바로 누를 수 있도록 이전 세션 확인보다 먼저 연결
  $('#start-btn').addEventListener('click', start);
  $('#nick-edit').addEventListener('click', () => {
    $('#nick-input').value = user?.nickname || pendingNick || '';
    $('#nick-view').hidden = true; $('#nick-form').hidden = false; nickMsg('');
    $('#nick-input').focus(); $('#nick-input').select();
  });
  $('#nick-cancel').addEventListener('click', () => { showNick(user?.nickname || pendingNick); nickMsg(''); });
  $('#nick-form').addEventListener('submit', saveNick);
  try {
    const { user: u } = await api('/api/me');
    if (u) {
      user = user || u; showNick(u.nickname); paintAccount();
      $('#start-btn').textContent = '내 방으로 들어가기';
      let enter = false;
      try { enter = sessionStorage.getItem('haruEnter') === '1'; sessionStorage.removeItem('haruEnter'); } catch { /* */ }
      if (enter) enterGame(); // 로그인 직후: 바로 원래 방으로
      return;
    }
  } catch { /* 첫 방문 */ }
  paintAccount();
  try { pendingNick = (await api('/api/nickname/suggest')).nickname; } catch { pendingNick = null; }
  showNick(pendingNick || '(바로 시작하기를 누르면 정해져요)');
}

async function saveNick(e) {
  e.preventDefault();
  const name = $('#nick-input').value.replace(/\s+/g, ' ').trim();
  if (!name) return nickMsg('닉네임을 입력해 주세요.', true);
  if ([...new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(name)].length > 12) return nickMsg('닉네임은 12자까지 쓸 수 있어요.', true);
  $('#nick-save').disabled = true;
  try {
    if (user) {
      // 이미 게스트 계정이 있으면 그 계정의 이름만 바꿈 (일기·영상은 그대로)
      const r = await api('/api/me', { method: 'PATCH', body: { nickname: name } });
      user = { ...user, nickname: r.user.nickname };
      showNick(user.nickname); nickMsg('닉네임을 바꿨어요.');
    } else {
      pendingNick = name; showNick(name); nickMsg('입장할 때 이 닉네임을 써요.');
    }
  } catch (err) { nickMsg(err.message, true); } finally { $('#nick-save').disabled = false; }
}

async function start() {
  $('#start-btn').disabled = true;
  try {
    if (!user) {
      const r = await api('/api/guest', { method: 'POST', body: pendingNick ? { nickname: pendingNick } : {} });
      user = r.user;
      await net.reconnect(); // 새 게스트 쿠키로 실시간 연결을 다시 맺음
      paintAccount();
    }
    enterGame();
  } catch (e) {
    $('#start-error').hidden = false; $('#start-error').textContent = e.message;
  } finally { $('#start-btn').disabled = false; }
}

/** 방에서 '← 홈으로': 게스트 세션은 그대로 두고 첫 화면으로 */
function goLanding() {
  closeAllModals();
  roomMusic.stop();
  moveToken++; // 방에서 걷던 동작 취소
  $('#game').hidden = true;
  $('#landing').hidden = false;
  showNick(user.nickname); nickMsg(''); paintAccount();
  $('#start-btn').textContent = '내 방으로 들어가기';
  drawLanding();
}

let gameReady = false;
function enterGame() {
  $('#landing').hidden = true;
  $('#game').hidden = false;
  if (gameReady) { stage.resize(); enterRoom('center'); return; }
  gameReady = true;
  stage = new Stage();
  bindStage();
  bindSocket();
  bindHud();
  setInterval(tickSounds, 110);
  enterRoom('center');
  // 처음 온 사람에게는 사용 설명서를 한 번 펼쳐 줌 (이후엔 상단 책 버튼으로)
  if (!store.get('manualSeen')) { store.set('manualSeen', true); openManual(0); }
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
  $('#home-link').hidden = place !== 'room'; // '← 홈으로'는 개인 방에서만
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
  roomMusic.stop(); // 방에 들어올 때는 늘 조용하게 (직접 켜야 재생)
  stage.setScene(room, PLACES.room, 'room', {});
  const n = PLACES.room.targets[from] || PLACES.room.spawn;
  stage.upsert('me', { nickname: user.nickname, color: user.color, me: true, points: [{ x: n.x, y: n.y }], startAt: net.now(), seat: null });
  setHud();
  refreshRoomBooks();
  if (!store.get('firstHintShown')) {
    store.set('firstHintShown', true);
    firstHint = stage.banner(196, 92, '책상을 눌러 오늘의 한 장을 기록해 보세요', 20000, 'first-hint');
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
  } else if (id === 'cd') {
    // 재생 중이면 바로 정지. 꺼져 있으면 CD 플레이어 앞까지 걸어가 도착하자마자 재생 (한 번만 누르면 됨)
    if (roomMusic.isPlaying()) { moveToken++; roomMusic.stop(); return; }
    roomMusic.prime(); // 클릭 순간에 재생 권한을 얻어 둠 (모바일 자동재생 정책)
    if (await walkLocal(PLACES.room.targets.cd)) { if (place === 'room') roomMusic.play(); } else roomMusic.cancelPrime();
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
    roomMusic.stop();
    if (place === 'rooftop' && placeId !== 'rooftop') radio.leave();
    if (placeId !== 'park') amb.stopNight(); else amb.startNight(); // 공원: 들어서자마자 밤 풀벌레·바람 소리
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
    if (place === 'park') stage.renderBackground({ treeNotes: noteSlots(wishes) });
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
  if (id === 'tree') { net.emit('move', PLACES.park.targets.tree); openTree({ onPosted: () => refreshTree() }); }
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
  stage.on('step', onStep);
}

function bindSocket() {
  net.on('counts', (c) => { counts = c; });
  net.on('session', (s) => { if (user && !s.user) toast('로그인 정보가 바뀌었어요. 새로고침해 주세요.', 6000); });
  net.on('player:join', (p) => { if (place !== 'room') stage.upsert(p.sid, toEntity(p)); });
  net.on('player:leave', ({ sid }) => { if (place !== 'room') stage.remove(sid); });
  net.on('player:rename', ({ sid, nickname }) => {
    const e = stage.entities.get(sid);
    if (!e) return;
    e.nickname = nickname;
    e.tag.textContent = e.me ? `${nickname} (나)` : nickname;
  });
  net.on('player:move', (m) => { if (place !== 'room' && stage.entities.has(m.sid)) stage.upsert(m.sid, { points: m.points, startAt: m.startAt, seat: m.seat }); });
  net.on('chat', ({ sid, text }) => { if (place === 'rooftop') stage.say(sid, text); });
  net.on('wish:float', ({ sid, wishId, until }) => { const e = stage.entities.get(sid); if (e && place !== 'room') e.wish = { wishId, until: localTime(until) }; });
  net.on('star', onStar);
  net.on('radio', (snap) => radio.apply(snap, snap.kind));
  net.on('wish:reaction', ({ kind, text }) => toast(`누군가 내 소원 “${text.slice(0, 20)}${text.length > 20 ? '…' : ''}”에 ${kind === 'cheer' ? '📣 응원' : '🤝 공감'}을 보냈어요`, 4500));
  radio.onStarted((cur) => { if (place === 'rooftop') stage.banner(250, 90, `${cur.requestedBy} 님의 신청곡 ♪`, 7000); });

}

function onReconnect() {
  // 연결이 끊겼다 다시 붙으면 있던 야외 장소에 다시 들어감
  if (place !== 'room') goOutside(place, { silent: true });
}

function bindHud() {
  $('#home-link').addEventListener('click', goLanding);
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

// 공원: 들어가면 풀벌레·바람 소리가 계속(서 있을 때·앉았을 때 모두), 다른 곳에선 멈춤
function tickSounds() {
  if (!stage) return;
  if (place === 'rooftop') stage.sceneState.radioPlaying = radio.isAudible();
  if (place !== 'park') amb.stopNight();
}
/** 내 아바타가 실제로 한 발 내딛을 때(걷기 그림이 바뀔 때)마다 바닥에 맞는 발소리. 멈추거나 앉으면 걸음이 없으니 소리도 없음 */
let lastStepAt = 0;
function onStep(p) {
  if (place !== 'park') return;
  if (performance.now() - lastStepAt < 160) return; // 걷다가 방향을 바꾼 순간 두 발이 겹쳐 들리지 않게
  lastStepAt = performance.now();
  amb.footstep(park.surfaceAt(p.x, p.y));
}

// 디버그/자동 테스트용 읽기 전용 상태
window.__haru = {
  get place() { return place; }, get mySid() { return mySid; }, get user() { return user; },
  entities: () => stage ? [...stage.entities.values()].map((e) => ({ id: e.id, nickname: e.nickname, seat: e.seat, me: e.me, bubble: e.bubble?.el.textContent || null, wish: !!e.wish, pos: stage.pos(e), points: e.points, startAt: e.startAt })) : [],
  radio: () => { const a = document.getElementById('radio-audio'); return { src: a.src, paused: a.paused, muted: a.muted, time: a.currentTime, state: radio.getState() }; },
  ambience: () => amb.isNightOn(),
  steps: () => amb.stepLog(),
  roomMusic: () => roomMusic.state(),
  roomMusicSkip: () => roomMusic._skipToEnd(),
  get star() { return stage?.star; },
  koDate,
};

boot();
