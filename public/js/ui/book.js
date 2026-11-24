// 월별 책: 페이지마다 날짜, 한 문장, 영상 (+ 내 페이지 삭제)
import { api, koDate, esc } from '../api.js';
import { openModal, toast } from './modal.js';

export function openBook({ title, entries, index = 0, example = false, onDeleted }) {
  let i = Math.max(0, Math.min(index, entries.length - 1));
  const m = openModal({ title, wide: true, label: '책 읽기', html: `<div id="b-page"></div>
    <div class="book-nav"><button class="btn btn-small" id="b-prev">◀ 이전 페이지</button><span id="b-num" class="muted"></span><button class="btn btn-small" id="b-next">다음 페이지 ▶</button></div>` });
  const render = () => {
    const e = entries[i];
    m.$('#b-page').innerHTML = `<div class="book">
      <div class="left"><div class="diary-date">${koDate(e.date)}</div><div class="sentence">“${esc(e.sentence)}”</div>
      ${example ? '<span class="badge warn">예시 기록 · 내 책장과 분리됨</span>' : `<span class="muted" style="font-size:13px">🔒 나만 볼 수 있는 기록</span>
        <div style="margin-top:auto">
          <button class="btn btn-small btn-ghost" id="b-del" style="color:#8a3b2a">🗑 이 페이지 삭제</button>
          <div id="b-confirm" class="notice" hidden>이 날의 문장과 영상을 지울까요? <b>되돌릴 수 없어요.</b>
            <div class="row" style="margin-top:6px"><button class="btn btn-small" id="b-yes" style="background:#c8553d;color:#fff">삭제</button><button class="btn btn-small" id="b-no">취소</button></div>
          </div>
        </div>`}</div>
      <div class="right"><div class="video-box"><video src="${esc(e.videoUrl)}#t=0.1" ${e.poster ? `poster="${esc(e.poster)}"` : ''} controls playsinline preload="metadata"></video></div></div>
    </div>`;
    m.$('#b-num').textContent = `${i + 1} / ${entries.length}`;
    m.$('#b-prev').disabled = i === 0; m.$('#b-next').disabled = i === entries.length - 1;
    if (example) return;
    m.$('#b-del').addEventListener('click', () => { m.$('#b-del').hidden = true; m.$('#b-confirm').hidden = false; });
    m.$('#b-no').addEventListener('click', () => { m.$('#b-del').hidden = false; m.$('#b-confirm').hidden = true; });
    m.$('#b-yes').addEventListener('click', async () => {
      m.$('#b-yes').disabled = true;
      try {
        await api(`/api/diary/entry/${e.id}`, { method: 'DELETE' });
        entries.splice(i, 1);
        onDeleted?.(e, entries.length);
        if (!entries.length) { m.close(); toast('페이지를 지웠어요. 이 달의 책이 책장에서 빠졌어요.'); return; }
        i = Math.min(i, entries.length - 1);
        toast('페이지를 지웠어요.');
        render();
      } catch (err) { toast(err.message); m.$('#b-yes').disabled = false; }
    });
  };
  m.$('#b-prev').addEventListener('click', () => { i--; render(); });
  m.$('#b-next').addEventListener('click', () => { i++; render(); });
  m.el.addEventListener('keydown', (e) => {
    if (e.target.closest?.('button') && e.key === 'Enter') return;
    if (e.key === 'ArrowLeft' && i > 0) { i--; render(); }
    if (e.key === 'ArrowRight' && i < entries.length - 1) { i++; render(); }
  });
  render();
  return m;
}
