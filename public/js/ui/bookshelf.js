// 책장: 월별 책 + '기억 찾기'
// 일반 화면은 질문 → 짧은 답 → 관련 일기 카드만. 검색 과정(검색어·건수·AI 판단)은 시연 모드에서만 펼쳐 볼 수 있음.
import { api, localToday, koDate, store, esc } from '../api.js';
import { openModal } from './modal.js';

const SPINE = ['#e06c75', '#61afef', '#98c379', '#e5c07b', '#c678dd', '#56b6c2', '#ff9b6b', '#d19a66'];
const shortDate = (d) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;
// 시연 모드: /demo에서 시연 키를 확인한 브라우저에만 켜짐. 서버도 키가 맞을 때만 검색 과정을 돌려줌
const demoKey = () => { try { return localStorage.getItem('haruDemoKey') || ''; } catch { return ''; } };

/** 시연 모드 전용: 서버가 실제로 실행한 단계(trace)를 그대로 풀어 씀 */
function traceHtml(r) {
  const rangeText = r.range ? `${esc(r.range.label)}(${r.range.from} ~ ${r.range.to})` : '전체 기간';
  const words = (ws) => ws.map((w) => `<code>${esc(w)}</code>`).join(' ') || '-';
  const rows = r.trace.map((t) => {
    if (t.kind === 'search') {
      return `<li><b>${t.round}차 검색</b> · ${rangeText}${t.round > 1 ? ' (같은 기간 유지)' : ''} · 검색어 ${words(t.terms)} → <b>${t.found}건</b>${t.dates?.length ? ` (${t.dates.map(shortDate).join(', ')})` : ''}</li>`;
    }
    if (t.kind === 'ai') {
      const what = t.action === 'answer' ? '근거 충분 → 답하기'
        : t.action === 'retry' ? `근거 부족 → 다른 단서로 다시 찾기 · 새 단서 ${words(t.keywords || [])}`
          : t.action === 'not_found' ? '근거 없음' : `연결 실패${t.note ? ` (${esc(t.note)})` : ''}`;
      return `<li><b>AI 판단</b> · ${what}</li>`;
    }
    return `<li><b>${esc(t.note || '')}</b></li>`;
  }).join('');
  const sent = r.sentToAi?.length
    ? `<details><summary>AI에 보낸 내용</summary><pre class="payload">${esc(JSON.stringify(r.sentToAi, null, 2))}</pre></details>`
    : '<p class="muted" style="font-size:13px;margin:4px 0">AI에는 아무것도 보내지 않았어요.</p>';
  return `<details class="trace"><summary>검색 과정 보기 <span class="badge">시연 모드</span></summary><ol>${rows}</ol>${sent}</details>`;
}

export async function openBookshelf({ onOpenMonth, onOpenExample, startMode = 'mine' }) {
  const m = openModal({
    title: '내 책장', wide: true, label: '내 책장',
    html: `<div class="shelf" id="s-shelf"><span class="empty-shelf">책장을 여는 중…</span></div>
    <p class="muted" style="font-size:13px;margin:6px 0 0">기록이 있는 달마다 책이 한 권씩 꽂혀요. 🔒 다이어리는 나만 볼 수 있어요.</p>
    <section class="memory">
      <h2 style="margin-bottom:8px">🔎 기억 찾기</h2>
      <div class="tabs" role="tablist">
        <button class="tab on" data-mode="mine" role="tab">내 일기</button>
        <button class="tab" data-mode="example" role="tab">예시 일기로 체험</button>
      </div>
      <form class="row" id="m-form" autocomplete="off">
        <input type="text" id="m-q" maxlength="120" style="flex:1;min-width:200px" placeholder="비 오는 날 창밖을 찍었던 게 언제였지?" aria-label="기억 찾기 질문">
        <button class="btn btn-primary" id="m-go">찾기</button>
      </form>
      <p class="ai-note" id="m-notice" hidden>질문하면 질문과 관련 일기의 <b>날짜·문장</b>이 AI(OpenRouter)로 전송돼요. 영상과 계정 정보는 보내지 않아요.
        <button type="button" class="link-btn" id="m-notice-ok">알겠어요</button></p>
      <div class="chips" id="m-chips" style="margin-top:8px"></div>
      <div id="m-result" aria-live="polite" style="margin-top:12px"></div>
      <div id="m-examples" hidden></div>
    </section>`,
  });
  const $ = m.$;
  let mode = 'mine';
  let examples = [];

  // 외부 AI 사용 안내: 처음 한 번만 (확인을 누르거나 첫 검색을 하면 다음부터 보이지 않음)
  if (!store.get('aiNoticeSeen')) $('#m-notice').hidden = false;
  $('#m-notice-ok').addEventListener('click', () => { store.set('aiNoticeSeen', true); $('#m-notice').hidden = true; });

  // 월별 책 (느린 연결에서도 아래 버튼이 바로 동작하도록 기다리지 않고 불러옴)
  (async () => { try {
    const { months } = await api('/api/diary/months');
    const shelf = $('#s-shelf');
    if (!months.length) {
      shelf.innerHTML = '<span class="empty-shelf">아직 꽂힌 책이 없어요. 책상에서 오늘의 한 장을 남겨 보세요.</span>';
    } else {
      shelf.innerHTML = months.map((mo, i) => {
        const [y, mm] = mo.month.split('-');
        return `<button class="book-spine" data-month="${mo.month}" style="background:${SPINE[(Number(mm) + i) % SPINE.length]}" aria-label="${y}년 ${Number(mm)}월 책, ${mo.count}장">
          <small>${y}</small><span style="font-size:20px">${Number(mm)}월</span><small>${mo.count}장</small></button>`;
      }).join('');
      shelf.querySelectorAll('.book-spine').forEach((b) => b.addEventListener('click', () => { m.close(); onOpenMonth(b.dataset.month); }));
    }
  } catch (e) { $('#s-shelf').innerHTML = `<span class="empty-shelf">${esc(e.message)}</span>`; } })();

  const chips = {
    mine: ['이번 달에 친구랑 웃었던 날이 언제였지?', '비 오는 날 창밖을 찍었던 게 언제였지?'],
    example: ['이번 달에 친구랑 웃었던 날이 언제였지?', '지난달에 비 오는 날 창밖을 찍었던 게 언제였지?', '바다에서 수영한 날이 언제였지?'],
  };
  const renderChips = () => {
    $('#m-chips').innerHTML = chips[mode].map((q) => `<button class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join('');
    $('#m-chips').querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => { $('#m-q').value = c.dataset.q; ask(); }));
  };
  async function setMode(next) {
    mode = next;
    m.$$('.tab').forEach((t) => t.classList.toggle('on', t.dataset.mode === mode));
    $('#m-result').innerHTML = '';
    const box = $('#m-examples');
    if (mode === 'example') {
      const r = await api(`/api/memory/examples?today=${localToday()}`);
      examples = r.records;
      box.hidden = false;
      box.innerHTML = '<p class="muted" style="font-size:13px;margin:12px 0 4px">체험용 예시 일기 (내 책장과 분리되어 있어요)</p>' +
        examples.map((e) => `<button class="source" data-ex="${e.id}"><time>${koDate(e.date, false)}</time>${esc(e.sentence)}</button>`).join('');
      box.querySelectorAll('[data-ex]').forEach((b) => b.addEventListener('click', () => onOpenExample(examples, b.dataset.ex)));
    } else box.hidden = true;
    renderChips();
  }
  m.$$('.tab').forEach((t) => t.addEventListener('click', () => setMode(t.dataset.mode)));
  renderChips();
  if (startMode === 'example') setMode('example');

  const card = (s) => `<button class="memory-card" data-id="${s.id}" data-date="${s.date}">
    <time>${koDate(s.date)}</time><span>“${esc(s.sentence)}”</span></button>`;

  function render(r) {
    const out = $('#m-result');
    let html = '';
    if (r.status === 'ok') {
      html = `<p class="answer">${esc(r.answer)}</p>${r.sources.length ? `<p class="muted cards-label">관련 일기</p>${r.sources.map(card).join('')}` : ''}`;
    } else if (r.status === 'not_found') {
      html = `<p class="answer">관련된 기록을 찾지 못했어요.</p>
        <p class="muted hint-line">다른 단서로 다시 물어봐 주세요. 그날 함께한 사람, 장소, 날씨처럼 일기에 적었을 법한 말을 넣으면 찾기 쉬워요.</p>`;
    } else if (r.status === 'no_key' || r.status === 'api_error') {
      const found = r.candidates || [];
      html = `<p class="answer">지금은 AI에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.</p>
        <button class="btn btn-small" id="m-retry">다시 시도</button>
        ${found.length ? `<p class="muted cards-label">관련 일기</p>${found.map(card).join('')}` : ''}`;
    } else {
      html = `<p class="answer">${esc(r.message)}</p>`; // 기록 없음 / 그 기간에 기록 없음
    }
    if (r.demo && r.trace) html += traceHtml(r);
    out.innerHTML = `<div class="result" data-status="${r.status}">${html}</div>`;
    out.querySelector('#m-retry')?.addEventListener('click', ask);
    out.querySelectorAll('.memory-card').forEach((b) => b.addEventListener('click', () => {
      if (mode === 'example') onOpenExample(examples, b.dataset.id);
      else { m.close(); onOpenMonth(b.dataset.date.slice(0, 7), b.dataset.id); }
    }));
  }

  let busy = false;
  async function ask() {
    const q = $('#m-q').value.trim();
    if (!q || busy) return;
    busy = true; $('#m-go').disabled = true;
    store.set('aiNoticeSeen', true);
    const out = $('#m-result');
    out.innerHTML = '<div class="result searching"><span class="dots"></span> 일기를 찾고 있어요…</div>';
    try {
      const k = demoKey();
      render(await api('/api/memory/search', { method: 'POST', body: { question: q, mode, today: localToday() }, headers: k ? { 'X-Admin-Key': k } : undefined }));
    } catch (e) {
      out.innerHTML = `<div class="result" data-status="error"><p class="answer">${e.status === 429 ? '질문이 너무 잦아요.' : '지금은 기억 찾기를 할 수 없어요.'} 잠시 후 다시 시도해 주세요.</p>
        <button class="btn btn-small" id="m-retry">다시 시도</button></div>`;
      out.querySelector('#m-retry').addEventListener('click', ask);
    } finally { busy = false; $('#m-go').disabled = false; }
  }
  $('#m-form').addEventListener('submit', (e) => { e.preventDefault(); ask(); });
  return m;
}
