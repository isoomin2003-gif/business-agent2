// 월별 책: 페이지마다 날짜, 한 문장, 영상
import { koDate, esc } from '../api.js';
import { openModal } from './modal.js';

export function openBook({ title, entries, index = 0, example = false }) {
  let i = Math.max(0, Math.min(index, entries.length - 1));
  const m = openModal({ title, wide: true, label: '책 읽기', html: `<div id="b-page"></div>
    <div class="book-nav"><button class="btn btn-small" id="b-prev">◀ 이전 페이지</button><span id="b-num" class="muted"></span><button class="btn btn-small" id="b-next">다음 페이지 ▶</button></div>` });
  const render = () => {
    const e = entries[i];
    m.$('#b-page').innerHTML = `<div class="book">
      <div class="left"><div class="diary-date">${koDate(e.date)}</div><div class="sentence">“${esc(e.sentence)}”</div>
      ${example ? '<span class="badge warn">예시 기록 · 내 책장과 분리됨</span>' : '<span class="muted" style="font-size:13px">🔒 나만 볼 수 있는 기록</span>'}</div>
      <div class="right"><div class="video-box"><video src="${esc(e.videoUrl)}#t=0.1" ${e.poster ? `poster="${esc(e.poster)}"` : ''} controls playsinline preload="metadata"></video></div></div>
    </div>`;
    m.$('#b-num').textContent = `${i + 1} / ${entries.length}`;
    m.$('#b-prev').disabled = i === 0; m.$('#b-next').disabled = i === entries.length - 1;
  };
  m.$('#b-prev').addEventListener('click', () => { i--; render(); });
  m.$('#b-next').addEventListener('click', () => { i++; render(); });
  m.el.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' && i > 0) { i--; render(); }
    if (e.key === 'ArrowRight' && i < entries.length - 1) { i++; render(); }
  });
  render();
  return m;
}
