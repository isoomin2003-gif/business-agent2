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
let tracksCache = null;
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export async function openRadio({ getState, myUserId }) {
  if (!tracksCache) tracksCache = (await api('/api/radio/tracks')).tracks;
  let cleanup = () => {};
  const m = openModal({
    onClose: () => cleanup(),
    title: '📻 옥상 라디오', label: '라디오',
    html: `<div class="tabs"><button class="tab on" data-tab="now">지금 나오는 곡</button><button class="tab" data-tab="dj">🎧 AI DJ</button><button class="tab" data-tab="req">다음 곡 신청하기</button><button class="tab" data-tab="info">음원 정보</button></div>
      <div data-pane="now"></div>
      <div data-pane="dj" hidden>
        <form class="row" id="dj-form" autocomplete="off">
          <input type="text" id="dj-q" maxlength="120" style="flex:1;min-width:200px" placeholder="밤에 산책할 때 들을 곡인데 너무 쓸쓸하지 않았으면 좋겠어" aria-label="AI DJ에게 요청">
          <button class="btn btn-primary" id="dj-go">추천받기</button>
        </form>
        <p class="ai-note">지금 기분이나 상황을 말하면 AI DJ가 라디오 곡 중에서 골라 줘요. 추천은 나에게만 보이고, 신청하기를 눌러야 대기열에 들어가요.</p>
        <div id="dj-out" aria-live="polite"></div>
      </div>
      <div data-pane="req" hidden></div><div data-pane="info" hidden></div>`,
  });
  const show = (tab) => {
    m.$$('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === tab));
    m.$$('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== tab; });
  };
  m.$$('.tab').forEach((t) => t.addEventListener('click', () => show(t.dataset.tab)));

  const render = () => {
    const st = getState();
    const cur = st?.current;
    const elapsed = cur ? Math.max(0, (net.now() - cur.startedAt) / 1000) : 0;
    const dur = cur?.track?.durationSec || 1;
    const myPending = st?.queue?.some((q) => q.userId === myUserId);
    m.$('[data-pane="now"]').innerHTML = cur ? `<div class="radio-now">
        <div class="t">♪ ${esc(cur.track.title)}</div>
        <div class="muted">${esc(cur.track.artist)} · ${esc(cur.track.genre)}${cur.requestedBy ? ` · <b style="color:var(--accent)">${esc(cur.requestedBy)} 님의 신청곡</b>` : ' · 기본 선곡'}</div>
        <div class="progress" style="margin-top:10px"><i style="width:${Math.min(100, elapsed / dur * 100)}%"></i></div>
        <div class="muted" style="font-size:13px;margin-top:4px">${fmtTime(Math.min(elapsed, dur))} / ${fmtTime(dur)}</div>
      </div>
      <h3 style="margin:14px 0 6px;font-size:16px">다음 순서</h3>
      ${st.queue.length ? `<ol>${st.queue.map((q) => `<li>${esc(q.title)} <span class="muted">— ${esc(q.nickname)} 님 신청</span></li>`).join('')}</ol>`
        : '<p class="muted">대기 중인 신청곡이 없어요. 기본 선곡이 이어서 나와요.</p>'}
      <p class="muted" style="font-size:13px">같은 옥상에 있는 모두가 같은 곡의 같은 지점을 들어요. 음량과 음소거는 나에게만 적용돼요.</p>`
      : '<p>라디오를 준비하는 중…</p>';
    m.$('[data-pane="req"]').innerHTML = `<p class="muted" style="font-size:14px">미리 등록한 선곡표에서만 고를 수 있어요. 지금 곡이 끝나면 접수된 순서대로 나와요. 한 사람당 대기 중인 신청은 한 곡까지예요.</p>
      <div class="track-list">${tracksCache.map((t) => `<div class="track"><div><b>${esc(t.title)}</b><div class="muted" style="font-size:13px">${esc(t.artist)} · ${esc(t.genre)} · ${fmtTime(t.durationSec)}</div></div>
        <button class="btn btn-small btn-primary" data-req="${t.id}" ${myPending ? 'disabled' : ''}>신청</button></div>`).join('')}</div>
      ${myPending ? '<p class="status ok">내 신청곡이 대기 중이에요. 재생이 시작되면 다시 신청할 수 있어요.</p>' : ''}
      <p class="status" id="r-status"></p>`;
    m.$$('[data-req]').forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      const r = await net.emit('radio:request', { trackId: b.dataset.req });
      if (r?.ok) { toast(`신청 완료! 대기 ${r.position}번째예요 ♪`); render(); show('now'); } else { m.$('#r-status').textContent = r?.message || '신청하지 못했어요.'; m.$('#r-status').className = 'status err'; b.disabled = false; }
    }));
  };
  m.$('[data-pane="info"]').innerHTML = `<p class="muted" style="font-size:14px">모든 곡은 제작자가 원본 배포 페이지에서 CC0(퍼블릭 도메인)으로 공개한 녹음이에요. ★는 신청곡이 없을 때 나오는 기본 방송이에요.</p>
    <table class="credits"><tr><th>곡</th><th>제작자</th><th>라이선스</th></tr>
    ${tracksCache.map((t) => `<tr><td>${t.base ? '★ ' : ''}<a href="${esc(t.sourceUrl)}" target="_blank" rel="noopener">${esc(t.title)}</a><div class="muted" style="font-size:12px">${esc([t.genre, ...t.moods].join(' · '))}${t.instruments.length ? ` · ${esc(t.instruments.join(', '))}` : ''}${t.bpm ? ` · ${t.bpm}BPM` : ''}</div><div class="muted" style="font-size:11px">${esc(t.note)}</div></td><td>${esc(t.artist)}</td>
      <td><a href="${esc(t.licenseUrl)}" target="_blank" rel="noopener">${esc(t.license)}</a></td></tr>`).join('')}</table>`;
  // ── AI DJ: 추천 카드(나에게만) → 신청하기를 눌렀을 때만 공용 대기열에 추가 ──
  let djBusy = false;
  const djOut = m.$('#dj-out');
  const djTrace = (r) => (r.demo && r.trace ? `<details class="trace"><summary>추천 과정 보기 <span class="badge">시연 모드</span></summary><ol>${r.trace.map((t) => {
    if (t.kind === 'search') return `<li><b>${t.round}차 검색</b> · 조건 <code>${esc(JSON.stringify(t.args))}</code> → <b>${t.found}곡</b>${t.ids.length ? ` (${t.ids.map(esc).join(', ')})` : ''}</li>`;
    if (t.kind === 'pick') return `<li><b>선택</b> · <code>${esc(t.id)}</code></li>`;
    if (t.kind === 'error') return `<li><b>연결 실패</b> · ${esc(t.status)}${t.code ? ` ${t.code}` : ''}</li>`;
    return `<li><b>${esc(t.note || '추천 없음')}</b></li>`;
  }).join('')}</ol></details>` : '');
  async function recommendNow() {
    const text = m.$('#dj-q').value.trim();
    if (!text || djBusy) return;
    djBusy = true; m.$('#dj-go').disabled = true;
    djOut.innerHTML = '<div class="result searching"><span class="dots"></span> 어울리는 곡을 찾고 있어요…</div>';
    let demoKey = '';
    try { demoKey = localStorage.getItem('haruDemoKey') || ''; } catch { /* */ }
    const r = await net.emit('dj:recommend', { text, ...(demoKey ? { demoKey } : {}) });
    djBusy = false; m.$('#dj-go').disabled = false;
    if (!r?.ok) { djOut.innerHTML = `<div class="result"><p class="answer">${esc(r?.message || '지금은 추천할 수 없어요. 잠시 후 다시 시도해 주세요.')}</p></div>`; return; }
    if (r.status === 'ok') {
      djOut.innerHTML = `<div class="result dj-card" data-status="ok">
        <div class="dj-info"><div class="t">♪ ${esc(r.track.title)}</div><div class="muted">${esc(r.track.artist)}</div><p class="dj-reason">${esc(r.reason)}</p></div>
        <div class="dj-act"><button class="btn btn-primary" id="dj-req" data-id="${esc(r.track.id)}">신청하기</button></div>
        <p class="status" id="dj-status" style="grid-column:1/-1;margin:0"></p></div>${djTrace(r)}`;
      m.$('#dj-req').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true; btn.textContent = '신청 중…';
        const res = await net.emit('radio:request', { trackId: btn.dataset.id });
        if (res?.ok) { btn.textContent = '신청 완료 ✓'; m.$('#dj-status').textContent = `대기 ${res.position}번째예요. 지금 곡이 끝나면 순서대로 나와요.`; m.$('#dj-status').className = 'status ok'; render(); }
        else { btn.disabled = false; btn.textContent = '신청하기'; m.$('#dj-status').textContent = res?.message || '신청하지 못했어요.'; m.$('#dj-status').className = 'status err'; }
      });
    } else if (r.status === 'none') {
      djOut.innerHTML = `<div class="result" data-status="none"><p class="answer">라디오 곡 중에서 딱 맞는 곡을 찾지 못했어요.</p><p class="muted hint-line">분위기나 상황을 조금 다르게 말해 주세요. 예) 차분한, 밝은, 피아노, 기타, 밤, 겨울</p></div>${djTrace(r)}`;
    } else {
      djOut.innerHTML = `<div class="result" data-status="error"><p class="answer">지금은 AI DJ에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.</p><button class="btn btn-small" id="dj-retry">다시 시도</button></div>${djTrace(r)}`;
      m.$('#dj-retry').addEventListener('click', recommendNow);
    }
  }
  m.$('#dj-form').addEventListener('submit', (e) => { e.preventDefault(); recommendNow(); });

  render();
  const timer = setInterval(() => { if (!m.$('[data-pane="now"]').hidden) render(); }, 1000);
  const off = net.on('radio', () => render());
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
