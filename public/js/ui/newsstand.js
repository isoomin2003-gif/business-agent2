// 나만의 주간신문 가판대: 1~12월 고정 12칸 (해가 바뀌어도 같은 달 칸에 쌓임)
// - 달을 누르면 가장 최근 기사부터, 넘기면 이전 기사로. 연도 바로가기
// - 비어 있는 달은 표지와 '아직 이달에 발행된 신문이 없어요'
import { api, esc, koDate } from '../api.js';
import { openModal, toast } from './modal.js';

const IMG = '/img/scenes/newsstand.webp';
const W = 1672, H = 941;
const COLS = [[245, 555], [578, 880], [900, 1205], [1225, 1530]];
const ROWS = [[70, 315], [345, 575], [610, 860]];
/** 그림 속 n월 신문의 위치 (원본 px) */
const slot = (month) => { const [x0, x1] = COLS[(month - 1) % 4], [y0, y1] = ROWS[Math.floor((month - 1) / 4)]; return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; };
const pct = (v, total) => `${(v / total) * 100}%`;
/** n월 표지를 그림에서 잘라 보여 주는 배경 스타일 */
const coverStyle = (month) => { const s = slot(month); return `background-image:url(${IMG});background-size:${(W / s.w) * 100}% auto;background-position:${(s.x / (W - s.w)) * 100}% ${(s.y / (H - s.h)) * 100}%;aspect-ratio:${s.w}/${s.h}`; };

const paragraphs = (text) => String(text || '').split(/\n+/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join('');
const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };

export async function openNewsstand() {
  const m = openModal({ title: '🗞️ 나만의 주간신문', wide: true, cls: 'newsstand', label: '주간신문 가판대', html: '<p class="news-loading">가판대를 여는 중…</p>' });
  let data;
  try { data = await api('/api/news'); } catch (e) { m.close(); toast(e.message); return; }
  if (!m.el.isConnected) return;

  function stand() {
    m.body.innerHTML = `
      <div class="stand" style="aspect-ratio:${W}/${H}">
        <img src="${IMG}" alt="1월부터 12월까지 칸이 있는 신문 가판대" draggable="false">
        ${Array.from({ length: 12 }, (_, i) => {
          const month = i + 1, s = slot(month), n = data.months[month].length;
          return `<button class="stand-slot" data-m="${month}" style="left:${pct(s.x, W)};top:${pct(s.y, H)};width:${pct(s.w, W)};height:${pct(s.h, H)}" aria-label="${month}월 신문 ${n ? `${n}부` : '없음'}">${n ? `<span class="stand-count">${n}</span>` : ''}</button>`;
        }).join('')}
      </div>
      <p class="hint-line">매주 일요일 저녁 6시, 지난 일요일~토요일의 대화에서 고른 기사 한 편이 발행일의 달 칸에 꽂혀요.${data.printing ? ' <b>지금 이번 호를 인쇄하고 있어요. 잠시 뒤 다시 열어 보세요.</b>' : ''}</p>`;
    m.body.querySelectorAll('.stand-slot').forEach((b) => { b.onclick = () => reader(Number(b.dataset.m), 0); });
  }

  function reader(month, idx) {
    const list = data.months[month];
    const back = '<button class="btn btn-small" data-a="stand">← 가판대</button>';
    if (!list.length) {
      m.body.innerHTML = `<div class="news-paper empty">${back}<div class="news-cover" style="${coverStyle(month)}" role="img" aria-label="${month}월호 표지"></div><p class="news-empty">아직 이달에 발행된 신문이 없어요</p></div>`;
    } else {
      const a = list[idx];
      const years = [...new Set(list.map((x) => x.year))];
      m.body.innerHTML = `<article class="news-paper">
        <div class="news-top">${back}<span class="news-pos">${month}월 · ${idx + 1} / ${list.length}</span></div>
        ${years.length > 1 ? `<div class="news-years" role="group" aria-label="연도 바로가기">${years.map((y) => `<button class="chip${y === a.year ? ' on' : ''}" data-y="${y}">${y}년</button>`).join('')}</div>` : ''}
        <header class="news-mast"><span>하루 한 장 주간신문</span><time datetime="${a.issueDate}">${koDate(a.issueDate)} 발행</time></header>
        <h3 class="news-title">${esc(a.title)}</h3>
        <div class="news-body">${paragraphs(a.body)}</div>
        ${a.reason ? `<p class="news-reason"><b>이번 주에 이 주제를 고른 이유</b> ${esc(a.reason)}</p>` : ''}
        ${a.sources?.length ? `<div class="news-sources"><b>출처</b><ol>${a.sources.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title || s.url)}</a> <small>${esc(host(s.url))}</small></li>`).join('')}</ol></div>` : ''}
        <nav class="news-nav"><button class="btn" data-a="newer" ${idx === 0 ? 'disabled' : ''}>← 최신 호</button><button class="btn" data-a="older" ${idx >= list.length - 1 ? 'disabled' : ''}>이전 호 →</button></nav>
      </article>`;
      m.body.querySelector('[data-a=newer]').onclick = () => reader(month, idx - 1);
      m.body.querySelector('[data-a=older]').onclick = () => reader(month, idx + 1);
      m.body.querySelectorAll('[data-y]').forEach((b) => { b.onclick = () => reader(month, list.findIndex((x) => x.year === Number(b.dataset.y))); });
    }
    m.body.querySelector('[data-a=stand]').onclick = stand;
    m.body.scrollTop = 0; m.el.scrollTop = 0;
  }
  stand();
}
