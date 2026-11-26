// 다이어리를 쓰기 전 AI와 나누는 짧은 대화 (책상)
// - 오늘 첫 클릭: 짧은 인사 + 질문 하나. [답하기] [오늘은 바로 쓰기]
// - 답한 뒤: [다이어리 쓰기] [조금 더 얘기하기] (하루 최대 2개, 두 번째 답 뒤엔 바로 다이어리)
// - AI가 늦거나 실패해도 언제든 바로 다이어리를 쓸 수 있음
import { api, esc } from '../api.js';
import { openModal } from './modal.js';

const ANSWER_MAX = 300;
const WAIT_MS = 15000;

/** 응답이 늦으면 null (서버 쪽 질문은 그대로 저장되므로 다음에 열면 이어짐) */
const withTimeout = (p, ms = WAIT_MS) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))]);

export function openDeskChat({ onWrite }) {
  let done = false;
  const m = openModal({ title: '✏️ 쓰기 전에 잠깐', paper: true, cls: 'desk-chat', label: '다이어리 쓰기 전 짧은 대화', html: '<div class="chat-log" aria-live="polite"></div><div class="chat-act"></div><p class="chat-privacy">답한 내용은 질문을 만들고 주간신문 주제를 고르는 데만 AI에게 보내져요. 닉네임과 계정 정보는 보내지 않아요.</p>' });
  const log = m.$('.chat-log'), act = m.$('.chat-act');
  const write = () => { if (done) return; done = true; m.close(); onWrite(); };

  const bubbles = (turns) => turns.map((t) => `
    ${t.greeting ? `<p class="talk ai greet">${esc(t.greeting)}</p>` : ''}
    <p class="talk ai">${esc(t.question)}</p>
    ${t.answer ? `<p class="talk me">${esc(t.answer)}</p>` : ''}`).join('');

  function busy(text) {
    act.innerHTML = `<p class="chat-wait">${esc(text)}</p><div class="btn-row"><button class="btn" data-a="write">다이어리 바로 쓰기</button></div>`;
    act.querySelector('[data-a=write]').onclick = write;
  }

  function render(s) {
    if (done) return;
    if (!s || s.status === 'unavailable') {
      log.innerHTML = s?.turns?.length ? bubbles(s.turns) : '';
      act.innerHTML = `<p class="chat-wait">지금은 질문을 준비하지 못했어요. 오늘은 바로 써 볼까요?</p><div class="btn-row"><button class="btn btn-primary" data-a="write">다이어리 쓰기</button></div>`;
      act.querySelector('[data-a=write]').onclick = write;
      return;
    }
    if (s.status === 'done') return write(); // 오늘 대화를 이미 마쳤거나 '바로 쓰기'를 골랐음 → 바로 다이어리
    log.innerHTML = bubbles(s.turns);
    log.scrollTop = log.scrollHeight;
    if (s.status === 'ask') {
      act.innerHTML = `<form class="chat-answer"><textarea maxlength="${ANSWER_MAX}" rows="3" placeholder="편하게 한두 문장으로 답해 주세요" aria-label="답"></textarea>
        <div class="chat-count"><span>0</span>/${ANSWER_MAX}</div>
        <div class="btn-row"><button type="button" class="btn" data-a="skip">오늘은 바로 쓰기</button><button class="btn btn-primary" type="submit">답하기</button></div></form>`;
      const ta = act.querySelector('textarea'), count = act.querySelector('.chat-count span');
      ta.oninput = () => { count.textContent = [...ta.value].length; };
      setTimeout(() => ta.focus({ preventScroll: true }), 50);
      act.querySelector('[data-a=skip]').onclick = async () => { busy('다이어리를 펼치는 중…'); await api('/api/chat/skip', { method: 'POST' }).catch(() => {}); write(); };
      act.querySelector('form').onsubmit = async (e) => {
        e.preventDefault();
        const text = ta.value.trim();
        if (!text) { ta.focus(); return; }
        busy('답을 전하는 중…');
        try {
          const r = await api('/api/chat/answer', { method: 'POST', body: { text } });
          if (r.status === 'done') return write(); // 두 번째 답 → 바로 다이어리
          render(r);
        } catch (err) { render(err.data?.turns ? err.data : null); }
      };
    } else if (s.status === 'answered') {
      act.innerHTML = `<p class="chat-wait">들려줘서 고마워요. 이 이야기를 오늘 한 장에 담아 볼까요?</p>
        <div class="btn-row"><button class="btn" data-a="more">조금 더 얘기하기</button><button class="btn btn-primary" data-a="write">다이어리 쓰기</button></div>`;
      act.querySelector('[data-a=write]').onclick = write;
      act.querySelector('[data-a=more]').onclick = async () => {
        busy('다음 질문을 생각하는 중…');
        try { render(await withTimeout(api('/api/chat/more', { method: 'POST' }))); } catch { write(); }
      };
    } else {
      act.innerHTML = `<p class="chat-wait">오늘 이야기는 여기까지예요.</p><div class="btn-row"><button class="btn btn-primary" data-a="write">다이어리 쓰기</button></div>`;
      act.querySelector('[data-a=write]').onclick = write;
    }
  }

  busy('오늘의 질문을 생각하는 중…');
  withTimeout(api('/api/chat/today')).then(render, () => render(null));
  return m;
}
