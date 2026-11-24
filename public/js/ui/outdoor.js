// 문(장소 선택), 라디오 창, 소원(나무/별똥별) 화면
import { api, esc, koDate } from '../api.js';
import { openModal, toast } from './modal.js';
import { PLACES } from '../shared/places.js';
import * as net from '../net.js';

// ───────── 장소 선택 ─────────
export function openPlaces({ counts, onChoose }) {
  let cleanup = () => {};
  const m = openModal({
    onClose: () => cleanup(),
    title: '어디로 나가 볼까요?', label: '장소 선택',
    html: `<div class="places">${['rooftop', 'park'].map((id) => `
      <button class="place-card ${id}" data-place="${id}">
        <span class="title">${id === 'rooftop' ? '🌃' : '🌳'} ${PLACES[id].name} · <span class="count" data-count="${id}">현재 ${counts[id] ?? 0}명</span></span>
        <span>${esc(PLACES[id].desc)}</span>
      </button>`).join('')}</div>
      <p class="muted" style="font-size:13px">접속자 수는 지금 그 장소에 있는 사람만 세요. 각자의 방에 있는 사람은 포함되지 않아요.</p>`,
  });
  const off = net.on('counts', (c) => m.$$('[data-count]').forEach((el) => { el.textContent = `현재 ${c[el.dataset.count] ?? 0}명`; }));
  api('/api/places').then(({ counts: c }) => m.$$('[data-count]').forEach((el) => { el.textContent = `현재 ${c[el.dataset.count] ?? 0}명`; })).catch(() => {});
  cleanup = off;
  m.$$('.place-card').forEach((b) => b.addEventListener('click', () => { m.close(); onChoose(b.dataset.place); }));
  return m;
}

// ───────── 라디오 ─────────
let radioInfo = null;
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const demoKeyOf = () => { try { return localStorage.getItem('haruDemoKey') || ''; } catch { return ''; } };

/** 외부 곡의 라이선스·저작자 표시 한 줄 */
function creditLine(t) {
  if (!t.external && !t.needsAttribution) return '';
  const lic = t.licenseUrl ? `<a href="${esc(t.licenseUrl)}" target="_blank" rel="noopener">${esc(t.license)}</a>` : esc(t.license);
  const src = t.sourceUrl ? ` · <a href="${esc(t.sourceUrl)}" target="_blank" rel="noopener">원본</a>` : '';
  return `<div class="credit">${t.needsAttribution ? `${esc(t.title)} — ${esc(t.artist)} · ` : ''}${lic}${src}</div>`;
}

export async function openRadio({ getState, myUserId }) {
  radioInfo = await api('/api/radio/tracks');
  const compose = !!radioInfo.features?.compose; // 작곡 서비스가 연결되어 실제로 쓸 수 있을 때만 공개
  let cleanup = () => {};
  const m = openModal({
    onClose: () => cleanup(),
    title: '📻 옥상 라디오', label: '라디오',
    html: `<div id="r-now"></div>
      <div class="radio-choices">
        <button class="choice-card on" data-go="discover"><b>🎵 새 노래 추천받기</b><span>원하는 분위기를 말하면 라디오에 없는 곡을 찾아 줘요</span></button>
        ${compose ? '<button class="choice-card" data-go="compose"><b>🎹 오늘의 단어로 작곡하기</b><span>짧은 문장이나 단어로 새 연주곡을 만들어요</span></button>' : ''}
      </div>
      <div data-pane="discover">
        <form class="row" id="dc-form" autocomplete="off">
          <input type="text" id="dc-q" maxlength="120" style="flex:1;min-width:200px" placeholder="비 오는 밤에 어울리는 잔잔한 기타곡" aria-label="원하는 분위기">
          <button class="btn btn-primary" id="dc-go">추천받기</button>
        </form>
        <p class="ai-note">추천은 나에게만 보여요. 곡 옆의 신청을 눌러야 옥상 대기열에 들어가요.</p>
        <div id="dc-out" aria-live="polite"></div>
      </div>
      ${compose ? '<div data-pane="compose" hidden></div>' : ''}
      <div class="radio-links"><button class="link-btn" data-go="queue">기본 선곡표에서 신청</button> · <button class="link-btn" data-go="info">음원 정보</button></div>
      <div data-pane="queue" hidden></div><div data-pane="info" hidden></div>`,
  });
  const show = (pane) => {
    m.$$('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== pane; });
    m.$$('.choice-card').forEach((c) => c.classList.toggle('on', c.dataset.go === pane));
  };
  m.$$('[data-go]').forEach((b) => b.addEventListener('click', () => show(b.dataset.go)));

  // ── 지금 나오는 곡 + 다음 순서 ──
  const renderNow = () => {
    const st = getState();
    const cur = st?.current;
    if (!cur?.track) { m.$('#r-now').innerHTML = '<p>라디오를 준비하는 중…</p>'; return; }
    const elapsed = Math.max(0, (net.now() - cur.startedAt) / 1000), dur = cur.track.durationSec || 1;
    m.$('#r-now').innerHTML = `<div class="radio-now">
      <div class="t">♪ ${esc(cur.track.title)}</div>
      <div class="muted">${esc(cur.track.artist)}${cur.track.genre ? ` · ${esc(cur.track.genre)}` : ''}${cur.requestedBy ? ` · <b style="color:var(--accent)">${esc(cur.requestedBy)} 님의 신청곡</b>` : ' · 기본 선곡'}</div>
      ${creditLine(cur.track)}
      <div class="progress" style="margin-top:8px"><i style="width:${Math.min(100, elapsed / dur * 100)}%"></i></div>
      <div class="muted" style="font-size:13px;margin-top:4px">${fmtTime(Math.min(elapsed, dur))} / ${fmtTime(dur)}${st.queue.length ? ` · 다음: ${st.queue.map((q) => `${esc(q.title)}(${esc(q.nickname)})`).join(', ')}` : ''}</div>
    </div>`;
  };

  // ── 기본 선곡표에서 신청 ──
  const renderQueue = () => {
    const st = getState();
    const myPending = st?.queue?.some((q) => q.userId === myUserId);
    const queued = new Set([st?.current?.trackId, ...(st?.queue || []).map((q) => q.trackId)]);
    m.$('[data-pane="queue"]').innerHTML = `<p class="muted" style="font-size:14px">미리 등록한 선곡표의 곡이에요. 한 사람당 대기 중인 신청은 한 곡까지예요.</p>
      <div class="track-list">${radioInfo.tracks.map((t) => `<div class="track"><div><b>${esc(t.title)}</b><div class="muted" style="font-size:13px">${esc(t.artist)} · ${esc(t.genre)} · ${fmtTime(t.durationSec)}</div></div>
        <button class="btn btn-small btn-primary" data-req="${t.id}" ${myPending || queued.has(t.id) ? 'disabled' : ''}>${queued.has(t.id) ? '이미 신청됨' : '신청'}</button></div>`).join('')}</div>
      <p class="status" id="q-status"></p>`;
    m.$$('[data-req]').forEach((b) => b.addEventListener('click', () => requestTrack(b, b.dataset.req, m.$('#q-status'))));
  };

  // ── 음원 정보 ──
  const renderInfo = () => {
    m.$('[data-pane="info"]').innerHTML = `<p class="muted" style="font-size:14px">★ 기본 방송과 선곡표는 제작자가 CC0으로 공개한 녹음이에요. 아래 ‘신청되어 추가된 곡’은 공개 라이선스(CC0·CC BY·CC BY-SA) 곡이고, 저작자 표시가 필요한 곡은 함께 표시해요.</p>
      <table class="credits"><tr><th>곡</th><th>제작자</th><th>라이선스</th></tr>
      ${radioInfo.tracks.map((t) => `<tr><td>${t.base ? '★ ' : ''}<a href="${esc(t.sourceUrl)}" target="_blank" rel="noopener">${esc(t.title)}</a><div class="muted" style="font-size:12px">${esc([t.genre, ...t.moods].join(' · '))}</div></td><td>${esc(t.artist)}</td>
        <td><a href="${esc(t.licenseUrl)}" target="_blank" rel="noopener">${esc(t.license)}</a></td></tr>`).join('')}</table>
      ${radioInfo.added?.length ? `<h3 style="margin:14px 0 6px">신청되어 추가된 곡</h3><table class="credits"><tr><th>곡</th><th>제작자</th><th>라이선스</th></tr>
      ${radioInfo.added.map((t) => `<tr><td><a href="${esc(t.sourceUrl)}" target="_blank" rel="noopener">${esc(t.title)}</a><div class="muted" style="font-size:12px">${esc(t.attribution || '')}</div></td><td>${esc(t.artist)}</td>
        <td>${t.licenseUrl ? `<a href="${esc(t.licenseUrl)}" target="_blank" rel="noopener">${esc(t.license)}</a>` : esc(t.license)}</td></tr>`).join('')}</table>` : ''}`;
  };

  /** 신청 버튼 공통: 서버가 등록을 확인한 뒤에만 '신청 완료' */
  async function requestTrack(btn, trackId, statusEl) {
    btn.disabled = true; const label = btn.textContent; btn.textContent = '신청 중…';
    const res = await net.emit('radio:request', { trackId });
    if (res?.ok) { btn.textContent = '신청 완료 ✓'; if (statusEl) { statusEl.textContent = `대기 ${res.position}번째예요. 지금 곡이 끝나면 순서대로 나와요.`; statusEl.className = 'status ok'; } toast(`신청 완료! 대기 ${res.position}번째예요 ♪`); }
    else if (res?.code === 'already') { btn.textContent = '이미 신청됨'; }
    else { btn.disabled = false; btn.textContent = label; if (statusEl) { statusEl.textContent = res?.message || '신청하지 못했어요.'; statusEl.className = 'status err'; } }
    radioInfo = await api('/api/radio/tracks').catch(() => radioInfo);
  }

  // ── 새 노래 추천받기 ──
  let busy = false, lastText = '';
  const out = m.$('#dc-out');
  const traceHtml = (r) => (r.demo && r.trace ? `<details class="trace"><summary>추천 과정 보기 <span class="badge">시연 모드</span></summary><ol>${r.trace.map((t) => {
    if (t.kind === 'search') return `<li><b>${t.round}차 검색</b> · 검색어 <code>${esc(t.query)}</code> → <b>${t.found}곡</b></li>`;
    if (t.kind === 'search_error') return `<li><b>${t.round}차 검색 실패</b> · ${esc(t.note)}</li>`;
    if (t.kind === 'unplayable') return `<li>재생 확인 실패로 제외 · <code>${esc(t.id)}</code></li>`;
    if (t.kind === 'pick') return `<li><b>선택</b> · ${t.ids.length}곡${t.dropped ? ` (후보에 없거나 중복·재생 불가로 ${t.dropped}곡 제외)` : ''}</li>`;
    return `<li><b>연결 실패</b> · ${esc(t.status)}</li>`;
  }).join('')}</ol></details>` : '');
  async function discoverNow(more = false) {
    const text = more ? lastText : m.$('#dc-q').value.trim();
    if (!text || busy) return;
    busy = true; lastText = text; m.$('#dc-go').disabled = true;
    out.innerHTML = '<div class="result searching"><span class="dots"></span> 어울리는 곡을 찾고 있어요…</div>';
    const demoKey = demoKeyOf();
    // AI 판단 + 음악 검색 + 재생 확인까지 걸리므로 넉넉히 기다림
    const r = await net.emit('radio:discover', { text, more, ...(demoKey ? { demoKey } : {}) }, { timeout: 60000 });
    busy = false; m.$('#dc-go').disabled = false;
    if (!r?.ok) { out.innerHTML = `<div class="result"><p class="answer">${esc(r?.message || '지금은 추천할 수 없어요. 잠시 후 다시 시도해 주세요.')}</p></div>`; return; }
    if (r.status === 'ok') {
      const st = getState();
      const queued = new Set([st?.current?.trackId, ...(st?.queue || []).map((q) => q.trackId)]);
      out.innerHTML = `<div class="result" data-status="ok">
        ${r.picks.length < 3 ? `<p class="muted hint-line">조건에 맞는 곡을 ${r.picks.length}곡 찾았어요.</p>` : ''}
        <div class="pick-list">${r.picks.map((p) => `<div class="pick">
          <div class="pick-info"><div class="t">${esc(p.title)}</div><div class="muted">${esc(p.artist)} · ${fmtTime(p.seconds)}</div>
            <p class="dj-reason">${esc(p.reason)}</p>${creditLine({ ...p, external: true })}</div>
          <button class="btn btn-primary btn-small" data-pick="${esc(p.id)}" ${queued.has(p.id) ? 'disabled' : ''}>${queued.has(p.id) ? '이미 신청됨' : '신청'}</button></div>`).join('')}</div>
        <p class="status" id="dc-status"></p>
        <button class="btn btn-small" id="dc-more">다른 곡 보기</button></div>${traceHtml(r)}`;
      m.$$('[data-pick]').forEach((b) => b.addEventListener('click', () => requestTrack(b, b.dataset.pick, m.$('#dc-status'))));
      m.$('#dc-more').addEventListener('click', () => discoverNow(true));
    } else if (r.status === 'none') {
      out.innerHTML = `<div class="result" data-status="none"><p class="answer">${more ? '더 보여 드릴 곡을 찾지 못했어요.' : '조건에 맞는 곡을 찾지 못했어요.'}</p>
        <p class="muted hint-line">분위기나 악기를 바꿔 다시 검색해 보세요. 예) 잔잔한 피아노, 신나는 어쿠스틱 기타, 몽환적인 신시사이저</p></div>${traceHtml(r)}`;
      m.$('#dc-q').focus();
    } else {
      out.innerHTML = `<div class="result" data-status="error"><p class="answer">${r.status === 'search_error' ? '지금은 음악 목록을 검색하지 못했어요.' : '지금은 추천 AI에 연결하지 못했어요.'} 잠시 후 다시 시도해 주세요.</p>
        <button class="btn btn-small" id="dc-retry">다시 시도</button></div>${traceHtml(r)}`;
      m.$('#dc-retry').addEventListener('click', () => discoverNow(more));
    }
  }
  m.$('#dc-form').addEventListener('submit', (e) => { e.preventDefault(); discoverNow(false); });

  renderNow(); renderQueue(); renderInfo();
  const timer = setInterval(renderNow, 1000);
  const off = net.on('radio', () => { renderNow(); if (!m.$('[data-pane="queue"]').hidden) renderQueue(); });
  cleanup = () => { clearInterval(timer); off(); };
  return m;
}

// ───────── 소원 ─────────
function wishCard(w) {
  const when = koDate(w.createdAt.slice(0, 10), false);
  const react = (kind, label, n, on) => w.isMine || !w.isPublic
    ? `<span class="react" style="cursor:default">${label} ${n}</span>`
    : `<button class="react ${on ? 'on' : ''}" data-react="${kind}" data-id="${w.id}">${label} ${n}</button>`;
  return `<div class="wish" data-wish="${w.id}">
    <div class="meta">${esc(w.nickname)}${w.isMine ? ' (나)' : ''} · ${when} · ${w.source === 'star' ? '🌠 별똥별 소원' : '🌳 소원 나무'}${w.isPublic ? '' : ' · 🔒 비공개(나만 보기)'}</div>
    <div class="text">${esc(w.text)}</div>
    <div class="row" style="margin-top:6px">${react('empathy', '🤝 공감', w.empathy, w.myEmpathy)}${react('cheer', '📣 응원', w.cheer, w.myCheer)}
      ${w.isMine ? `<button class="react" data-del="${w.id}" style="margin-left:auto">🗑 삭제</button>` : ''}</div>
  </div>`;
}

function bindReactions(root, refresh, onRemoved) {
  root.querySelectorAll('[data-react]').forEach((b) => b.addEventListener('click', async () => {
    try {
      const { wish } = await api(`/api/wishes/${b.dataset.id}/react`, { method: 'POST', body: { kind: b.dataset.react } });
      refresh(wish);
    } catch (e) { toast(e.message); }
  }));
  // 내 소원 삭제: 한 번 누르면 확인 문구로 바뀌고, 한 번 더 누르면 삭제
  root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!b.dataset.armed) {
      b.dataset.armed = '1'; b.classList.add('on'); b.textContent = '정말 지울까요? 한 번 더 누르기';
      setTimeout(() => { if (b.isConnected && b.dataset.armed) { delete b.dataset.armed; b.classList.remove('on'); b.textContent = '🗑 삭제'; } }, 4000);
      return;
    }
    b.disabled = true;
    try {
      await api(`/api/wishes/${b.dataset.del}`, { method: 'DELETE' });
      b.closest('.wish')?.remove();
      toast('소원을 지웠어요.');
      onRemoved?.(b.dataset.del);
    } catch (e) { toast(e.message); b.disabled = false; }
  }));
}

export async function openTree({ onPosted } = {}) {
  const m = openModal({
    title: '🌳 소원 나무', paper: true, label: '소원 나무',
    html: `<div class="notice"><b>공개 안내</b> — 소원 나무에 건 글은 <b>공원을 찾는 모든 방문자</b>에게 임시 닉네임과 함께 공개되고, 내가 떠난 뒤에도 남아 다른 사람이 읽고 공감·응원할 수 있어요.</div>
      <div class="stack" style="margin-top:10px">
        <textarea id="t-text" rows="2" maxlength="80" placeholder="나무에 걸 소원을 적어 주세요 (최대 80자)"></textarea>
        <label class="choice"><input type="checkbox" id="t-agree"> <span>다른 방문자에게 공개된다는 것을 확인했어요.</span></label>
        <div class="row"><button class="btn btn-primary" id="t-post" disabled>소원 걸기</button><span class="status" id="t-status"></span></div>
      </div>
      <h3 style="margin:16px 0 8px">나무에 걸린 소원</h3><div class="wish-list" id="t-list">불러오는 중…</div>`,
  });
  const list = m.$('#t-list');
  const removed = () => {
    const n = list.querySelectorAll('.wish').length;
    if (!n) list.innerHTML = '<p class="muted">아직 걸린 소원이 없어요. 첫 소원을 걸어 보세요.</p>';
    onPosted?.(n);
  };
  const rebind = (w) => {
    const el = list.querySelector(`[data-wish="${w.id}"]`);
    if (!el) return;
    const tmp = document.createElement('div'); tmp.innerHTML = wishCard(w);
    const fresh = tmp.firstElementChild; el.replaceWith(fresh); bindReactions(fresh, rebind, removed);
  };
  async function loadSafe() {
    try {
      const { wishes } = await api('/api/wishes/tree');
      list.innerHTML = wishes.length ? wishes.map(wishCard).join('') : '<p class="muted">아직 걸린 소원이 없어요. 첫 소원을 걸어 보세요.</p>';
      bindReactions(list, rebind, removed);
      onPosted?.(wishes.length);
    } catch (e) { list.textContent = e.message; }
  }
  const sync = () => { m.$('#t-post').disabled = !(m.$('#t-agree').checked && m.$('#t-text').value.trim()); };
  m.$('#t-agree').addEventListener('change', sync); m.$('#t-text').addEventListener('input', sync);
  m.$('#t-post').addEventListener('click', async () => {
    m.$('#t-post').disabled = true;
    try {
      await api('/api/wishes/tree', { method: 'POST', body: { text: m.$('#t-text').value } });
      m.$('#t-text').value = ''; m.$('#t-status').textContent = '소원을 나무에 걸었어요 🌟'; m.$('#t-status').className = 'status ok';
      await loadSafe();
    } catch (e) { m.$('#t-status').textContent = e.message; m.$('#t-status').className = 'status err'; }
    sync();
  });
  loadSafe();
  return m;
}

export function openStarWish({ starId, place, onDone }) {
  const inPark = place === 'park';
  const m = openModal({
    title: '🌠 소원 빌기', paper: true, label: '별똥별 소원',
    html: `<div class="stack">
      <textarea id="w-text" rows="2" maxlength="80" placeholder="별똥별에게 빌 소원 (최대 80자)"></textarea>
      <label class="choice"><input type="radio" name="w-vis" value="private" checked> <span><b>비공개</b> — 나만 볼 수 있어요.</span></label>
      <label class="choice"><input type="radio" name="w-vis" value="public"> <span><b>공개</b> — 지금 ${inPark ? '공원' : '옥상'}에 함께 있는 사람들이 내 머리 위 ✦를 눌러 읽고 공감·응원할 수 있어요. 닉네임과 함께 보여요.</span></label>
      ${inPark ? '<label class="choice"><input type="checkbox" id="w-tree" disabled> <span>🌳 <b>소원 나무에도 걸기</b> — 같은 글을 나무에 남겨, 내가 떠난 뒤에도 다른 방문자가 읽을 수 있어요. (공개 소원만 가능)</span></label>' : ''}
      <div class="row"><button class="btn btn-primary" id="w-post">소원 빌기</button><span class="status" id="w-status"></span></div>
    </div>`,
  });
  const vis = () => m.el.querySelector('input[name="w-vis"]:checked').value;
  m.$$('input[name="w-vis"]').forEach((r) => r.addEventListener('change', () => {
    const t = m.$('#w-tree'); if (t) { t.disabled = vis() !== 'public'; if (t.disabled) t.checked = false; }
  }));
  m.$('#w-post').addEventListener('click', async () => {
    m.$('#w-post').disabled = true;
    try {
      const { wish } = await api('/api/wishes/star', { method: 'POST', body: { starId, text: m.$('#w-text').value, isPublic: vis() === 'public', alsoTree: !!m.$('#w-tree')?.checked } });
      m.close();
      toast(wish.isPublic ? (wish.onTree ? '소원을 빌고 소원 나무에도 걸었어요 🌟' : '공개 소원을 빌었어요. 머리 위에 ✦가 잠시 떠 있어요.') : '비공개 소원을 빌었어요. ‘내 소원’에서 볼 수 있어요.');
      onDone?.(wish);
    } catch (e) { m.$('#w-status').textContent = e.message; m.$('#w-status').className = 'status err'; m.$('#w-post').disabled = false; }
  });
  return m;
}

export async function openWish(wishId) {
  const m = openModal({ title: '✦ 별똥별 소원', paper: true, html: '<div id="w-one">불러오는 중…</div>' });
  const box = m.$('#w-one');
  const draw = (w) => { box.innerHTML = wishCard(w); bindReactions(box, draw, () => m.close()); };
  try { draw((await api(`/api/wishes/${wishId}`)).wish); } catch (e) { box.textContent = e.message; }
  return m;
}

export async function openMyWishes() {
  const m = openModal({ title: '내 소원', paper: true, html: '<div class="wish-list" id="mw">불러오는 중…</div>' });
  try {
    const { wishes } = await api('/api/wishes/mine');
    const empty = '<p class="muted">아직 빈 소원이 없어요. 별똥별이 지나가거나 공원의 소원 나무에서 빌 수 있어요.</p>';
    const box = m.$('#mw');
    box.innerHTML = wishes.length ? wishes.map(wishCard).join('') : empty;
    bindReactions(box, () => {}, () => { if (!box.querySelector('.wish')) box.innerHTML = empty; });
  } catch (e) { m.$('#mw').textContent = e.message; }
  return m;
}
