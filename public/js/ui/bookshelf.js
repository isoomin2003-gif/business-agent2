// 책장: 월별 책 + '기억 찾기'(RAG)
import { api, localToday, koDate, store, esc } from '../api.js';
import { openModal } from './modal.js';

const SPINE = ['#e06c75', '#61afef', '#98c379', '#e5c07b', '#c678dd', '#56b6c2', '#ff9b6b', '#d19a66'];
const STATUS = {
  ok: ['ok', '찾았어요'],
  not_found: ['warn', '관련 기록 없음'],
  no_records: ['warn', '기록 없음'],
  empty_range: ['warn', '기간 안에 기록 없음'],
  no_key: ['err', 'AI 연결 안 됨 · API 키 없음'],
  api_error: ['err', 'AI 연결 실패'],
};
const ACTION = {
  answer: '근거 충분 → 날짜와 일기 문장으로 답하기',
  retry: '근거 부족 → 다른 단서로 한 번 더 찾기',
  not_found: '근거 없음 → 찾지 못했다고 알리기',
  error: 'AI 연결 실패',
};
const shortDate = (d) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;

/** '검색 과정 보기' — 실제 사용한 검색어, 찾은 기록 수, AI가 고른 행동 */
function traceHtml(r) {
  const rangeText = r.range ? `${esc(r.range.label)} (${r.range.from} ~ ${r.range.to})` : '전체 기간';
  const rows = r.trace.map((t) => {
    if (t.kind === 'search') {
      return `<li><b>${t.round}차 검색</b> · 기간: ${rangeText}${t.round > 1 ? ' <span class="badge">기간 유지</span>' : ''}<br>
        검색어: ${t.terms.map((w) => `<code>${esc(w)}</code>`).join(' ') || '-'} → <b>${t.found}건</b>${t.dates?.length ? ` (${t.dates.map(shortDate).join(', ')})` : ''}${t.note ? ` · ${esc(t.note)}` : ''}</li>`;
    }
    if (t.kind === 'ai') {
      return `<li><b>AI 판단 ${t.round}</b> · <code>${esc(t.action)}</code> ${esc(ACTION[t.action] || '')}
        ${t.keywords ? `<br>AI가 고른 새 단서: ${t.keywords.map((w) => `<code>${esc(w)}</code>`).join(' ')}${t.reason ? ` — ${esc(t.reason)}` : ''}` : ''}${t.note ? `<br><span class="muted">${esc(t.note)}</span>` : ''}</li>`;
    }
    return `<li class="muted">${esc(t.note || '')}</li>`;
  }).join('');
  return `<details class="trace"><summary>🔎 검색 과정 보기</summary><ol style="padding-left:20px;line-height:1.7;font-size:14px">${rows}</ol>
    ${r.sentToAi?.length ? `<details><summary>외부 AI(OpenRouter)에 보낸 정보 ${r.sentToAi.length}회</summary><pre class="payload">${esc(JSON.stringify(r.sentToAi, null, 2))}</pre></details>`
      : '<p class="muted" style="font-size:13px">외부 AI로는 아무것도 보내지 않았어요.</p>'}</details>`;
}

export async function openBookshelf({ onOpenMonth, onOpenExample, startMode = 'mine' }) {
  const m = openModal({
    title: '내 책장', wide: true, label: '내 책장',
    html: `<div class="shelf" id="s-shelf"><span class="empty-shelf">책장을 여는 중…</span></div>
    <p class="muted" style="font-size:13px;margin:6px 0 0">기록이 있는 달마다 책이 한 권씩 꽂혀요. 책을 누르면 책상에 앉아 펼쳐 볼 수 있어요. 🔒 다이어리는 나만 볼 수 있어요.</p>
    <section class="memory">
      <h2 style="margin-bottom:4px">🔎 기억 찾기</h2>
      <div class="notice" id="m-notice">
        질문하면 <b>서버가 내 일기에서 관련 기록을 최대 3개</b> 찾고, <b>질문과 찾은 일기의 날짜·문장만</b> 외부 AI 서비스(OpenRouter)로 보내요.
        AI는 근거가 충분하면 답하고, 부족하면 다른 단서로 한 번 더 찾게 해요(같은 기간 안에서).
        영상, 영상 주소, 닉네임, 계정 정보는 보내지 않아요.
        <button class="btn btn-small" id="m-notice-ok" style="margin-left:6px">확인</button>
      </div>
      <div class="tabs" role="tablist">
        <button class="tab on" data-mode="mine" role="tab">내 기록에서</button>
        <button class="tab" data-mode="example" role="tab">예시 기록으로 체험</button>
      </div>
      <div id="m-examples" hidden></div>
      <form class="row" id="m-form" autocomplete="off">
        <input type="text" id="m-q" maxlength="120" style="flex:1;min-width:200px" placeholder="이번 달에 친구랑 웃었던 날이 언제였지?" aria-label="기억 찾기 질문">
        <button class="btn btn-primary">찾기</button>
      </form>
      <div class="chips" id="m-chips" style="margin-top:8px"></div>
      <div id="m-result" style="margin-top:12px"></div>
    </section>`,
  });
  const $ = m.$;
  let mode = 'mine';
  let examples = [];

  if (store.get('aiNoticeSeen')) $('#m-notice-ok').hidden = true;
  $('#m-notice-ok').addEventListener('click', () => { store.set('aiNoticeSeen', true); $('#m-notice-ok').hidden = true; });

  // 월별 책 (느린 연결에서도 아래 버튼이 바로 동작하도록 기다리지 않고 불러옴)
  (async () => { try {
    const { months } = await api('/api/diary/months');
    const shelf = $('#s-shelf');
    if (!months.length) {
      shelf.innerHTML = '<span class="empty-shelf">아직 꽂힌 책이 없어요. 책상에서 오늘의 한 장을 남겨 보세요.<br>아래 ‘예시 기록으로 체험’으로 기억 찾기를 먼저 써볼 수도 있어요.</span>';
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
    mine: [['', '이번 달에 친구랑 웃었던 날이 언제였지?'], ['', '비 오는 날 창밖을 찍었던 게 언제였지?']],
    example: [['첫 검색에서 찾기', '이번 달에 친구랑 웃었던 날이 언제였지?'], ['검색어 바꿔 찾기', '지난달에 비 오는 날 창밖을 찍었던 게 언제였지?'], ['근거 없음', '바다에서 수영한 날이 언제였지?']],
  };
  const renderChips = () => {
    $('#m-chips').innerHTML = chips[mode].map(([k, q]) => `<button class="chip" data-q="${esc(q)}">${k ? `<b>${k}</b>` : ''}${esc(q)}</button>`).join('');
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
      box.innerHTML = '<p class="muted" style="font-size:13px;margin:4px 0">체험용 예시 기록 3개 (내 책장과 분리되어 있고 저장되지 않아요)</p>' +
        examples.map((e) => `<button class="source" data-ex="${e.id}"><time>${koDate(e.date, false)}</time>${esc(e.sentence)}</button>`).join('');
      box.querySelectorAll('[data-ex]').forEach((b) => b.addEventListener('click', () => onOpenExample(examples, b.dataset.ex)));
    } else box.hidden = true;
    renderChips();
  }
  m.$$('.tab').forEach((t) => t.addEventListener('click', () => setMode(t.dataset.mode)));
  renderChips();
  if (startMode === 'example') setMode('example');

  async function ask() {
    const q = $('#m-q').value.trim();
    if (!q) return;
    store.set('aiNoticeSeen', true);
    const out = $('#m-result');
    out.innerHTML = '<div class="result">기록을 찾는 중…</div>';
    try {
      const r = await api('/api/memory/search', { method: 'POST', body: { question: q, mode, today: localToday() } });
      const [cls, label] = STATUS[r.status] || ['err', r.status];
      const body = r.status === 'ok' ? esc(r.answer) : esc(r.message);
      const btn = (s) => `<button class="source" data-id="${s.id}" data-date="${s.date}"><time>${koDate(s.date)}</time>${esc(s.sentence)}</button>`;
      const others = r.status === 'ok' ? [] : (r.candidates || []);
      out.innerHTML = `<div class="result" data-status="${r.status}">
        <span class="badge ${cls}">${label}</span>${r.range ? ` <span class="badge">기간: ${esc(r.range.label)}</span>` : ''}
        <p class="answer">${body}</p>
        ${r.sources.length ? `<p class="muted" style="font-size:13px;margin:4px 0">근거가 된 일기 — 누르면 그날의 영상 페이지가 열려요</p>${r.sources.map(btn).join('')}` : ''}
        ${others.length ? `<p class="muted" style="font-size:13px;margin:8px 0 4px">${r.status === 'not_found' ? '검색에 걸렸지만 질문의 근거로 보기 어려운 기록' : '검색으로 찾은 기록 — 직접 열어볼 수 있어요'}</p>${others.map(btn).join('')}` : ''}
        ${traceHtml(r)}
      </div>`;
      out.querySelectorAll('.source').forEach((b) => b.addEventListener('click', () => {
        if (mode === 'example') onOpenExample(examples, b.dataset.id);
        else { m.close(); onOpenMonth(b.dataset.date.slice(0, 7), b.dataset.id); }
      }));
    } catch (e) {
      out.innerHTML = `<div class="result"><span class="badge err">오류</span><p class="answer">${esc(e.message)}</p></div>`;
    }
  }
  $('#m-form').addEventListener('submit', (e) => { e.preventDefault(); ask(); });
  return m;
}
