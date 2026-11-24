// 책상: 오늘의 영상 다이어리 쓰기/수정
import { api, uploadVideo, localToday, koDate, store, esc } from '../api.js';
import { openModal, toast } from './modal.js';

const MAX = 100;
// 모달을 닫았다 열어도 작성 중인 내용이 유지되도록 모듈 범위에 보관
const draft = { date: null, sentence: '', videoId: null, videoUrl: null, saved: null };

export async function openDiary({ onViewInShelf } = {}) {
  const today = localToday();
  if (draft.date !== today) Object.assign(draft, { date: today, sentence: store.get(`draft:${today}`, ''), videoId: null, videoUrl: null, saved: null });
  const touch = matchMedia('(pointer: coarse)').matches;
  const m = openModal({
    title: '오늘의 한 장', paper: true, label: '다이어리 쓰기',
    html: `
      <div class="stack">
        <div class="diary-date">${koDate(today)}</div>
        <div class="video-box" id="d-video"><span>오늘 가장 기억에 남는 순간의 영상을 골라 주세요</span></div>
        <div class="progress" id="d-prog" hidden><i></i></div>
        <div class="row">
          <label class="btn btn-small" for="d-file">🎞️ 영상 파일 선택</label>
          <input id="d-file" type="file" accept="video/*" hidden>
          ${touch ? `<label class="btn btn-small" for="d-cam">📷 직접 촬영</label><input id="d-cam" type="file" accept="video/*" capture="environment" hidden>` : ''}
          <button class="btn btn-small" id="d-sample-btn">✨ 샘플 영상으로 써보기</button>
        </div>
        <div class="samples" id="d-samples" hidden></div>
        <label for="d-text"><b>오늘의 한 문장</b> <span class="muted" id="d-count"></span></label>
        <textarea id="d-text" rows="2" maxlength="${MAX}" placeholder="예) 퇴근길 버스에서 본 노을이 오늘 제일 예뻤다."></textarea>
        <div id="d-first" class="notice" hidden>
          <b>게스트 기록 안내</b><br>
          이 기록은 <b>지금 이 브라우저</b>의 게스트 세션에 저장돼요. 같은 브라우저에서 쿠키를 지우지 않으면(최대 180일) 다시 열 수 있어요.
          시크릿 창을 닫거나, 쿠키를 지우거나, 다른 기기·브라우저로 접속하면 다시 열 수 없어요.
          <div class="row" style="margin-top:8px"><button class="btn btn-small btn-primary" id="d-confirm">알겠어요, 저장할게요</button></div>
        </div>
        <div class="row">
          <button class="btn btn-primary" id="d-save">저장하기</button>
          <button class="btn" id="d-view" hidden>📚 책장에서 보기</button>
        </div>
        <p class="status" id="d-status" role="status"></p>
      </div>`,
  });
  const $ = m.$;
  const text = $('#d-text'), status = $('#d-status'), count = $('#d-count');
  const setStatus = (msg, kind = '') => { status.textContent = msg; status.className = `status ${kind}`; };
  const showVideo = (url) => {
    $('#d-video').innerHTML = `<video src="${esc(url)}#t=0.1" controls playsinline preload="metadata"></video>`;
  };
  const updateCount = () => { count.textContent = `${[...text.value].length}/${MAX}`; };

  text.value = draft.sentence; updateCount();
  if (draft.videoUrl) showVideo(draft.videoUrl);
  // 오늘 이미 쓴 페이지는 아래(버튼 연결 뒤)에서 불러옵니다. 느린 연결에서도 버튼이 바로 동작하도록.

  text.addEventListener('input', () => { draft.sentence = text.value; store.set(`draft:${today}`, text.value); updateCount(); });

  async function handleFile(input) {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return; // 선택 취소: 작성 중인 문장은 그대로
    if (!file.type.startsWith('video/')) return setStatus('영상 파일만 고를 수 있어요.', 'err');
    const prog = $('#d-prog');
    prog.hidden = false; prog.firstElementChild.style.width = '0%';
    setStatus('영상을 올리는 중이에요…');
    try {
      const r = await uploadVideo(file, (p) => { prog.firstElementChild.style.width = `${Math.round(p * 100)}%`; });
      draft.videoId = r.videoId; draft.videoUrl = r.url;
      showVideo(r.url);
      setStatus('영상을 골랐어요. 한 문장을 적고 저장해 주세요.', 'ok');
    } catch (e) {
      setStatus(`${e.message} 작성 중인 문장은 그대로 남아 있어요.`, 'err');
    } finally { prog.hidden = true; }
  }
  $('#d-file').addEventListener('change', (e) => handleFile(e.target));
  $('#d-cam')?.addEventListener('change', (e) => handleFile(e.target));

  $('#d-sample-btn').addEventListener('click', async () => {
    const box = $('#d-samples');
    if (!box.hidden) { box.hidden = true; return; }
    const { samples } = await api('/api/samples');
    box.innerHTML = samples.map((s) => `<button class="sample" data-id="${s.id}"><img src="${s.poster}" alt=""><span>${esc(s.title)}</span></button>`).join('');
    box.hidden = false;
    box.querySelectorAll('.sample').forEach((b) => b.addEventListener('click', async () => {
      box.querySelectorAll('.sample').forEach((x) => x.classList.remove('on')); b.classList.add('on');
      setStatus('샘플 영상을 내 책장용으로 준비하는 중…');
      try {
        const r = await api('/api/videos/sample', { method: 'POST', body: { sampleId: b.dataset.id } });
        draft.videoId = r.videoId; draft.videoUrl = r.url; showVideo(r.url);
        setStatus('샘플 영상을 골랐어요. 이제 직접 한 문장을 적어 저장해 보세요.', 'ok');
        text.focus();
      } catch (e) { setStatus(`${e.message} 작성 중인 문장은 그대로예요.`, 'err'); }
    }));
  });

  async function save() {
    const sentence = text.value.trim();
    if (!draft.videoId) return setStatus('영상을 먼저 골라 주세요. (샘플 영상으로도 써볼 수 있어요)', 'err');
    if (!sentence) { text.focus(); return setStatus('오늘의 한 문장을 적어 주세요.', 'err'); }
    $('#d-save').disabled = true;
    setStatus('저장하는 중…');
    try {
      const r = await api(`/api/diary/day/${today}`, { method: 'PUT', body: { sentence, videoId: draft.videoId } });
      draft.saved = r.entry; draft.sentence = r.entry.sentence;
      store.del(`draft:${today}`); store.set('guestNoticeSeen', true);
      setStatus(r.created ? '책장에 오늘의 한 장을 꽂았어요!' : '오늘의 페이지를 고쳐 저장했어요.', 'ok');
      $('#d-view').hidden = false; $('#d-save').textContent = '수정 저장하기';
      toast('저장 완료 — 책장에서 다시 볼 수 있어요 📚');
    } catch (e) {
      setStatus(`${e.message} 작성 중인 문장은 그대로 남아 있어요.`, 'err');
    } finally { $('#d-save').disabled = false; }
  }
  $('#d-save').addEventListener('click', () => {
    if (!store.get('guestNoticeSeen', false) && !draft.saved) { $('#d-first').hidden = false; $('#d-first').scrollIntoView({ block: 'nearest' }); return; }
    save();
  });
  $('#d-confirm').addEventListener('click', () => { $('#d-first').hidden = true; store.set('guestNoticeSeen', true); save(); });
  $('#d-view').addEventListener('click', () => { const e = draft.saved; m.close(); onViewInShelf?.(e.date.slice(0, 7), e.id); });

  // 오늘 이미 쓴 페이지가 있으면 불러와 수정할 수 있게 (그 사이 사용자가 고른 영상·문장은 덮어쓰지 않음)
  try {
    const { entry } = await api(`/api/diary/day/${today}`);
    if (entry) {
      if (!draft.saved || draft.saved.updatedAt <= entry.updatedAt) draft.saved = entry;
      if (!draft.videoId) { draft.videoId = entry.videoId; draft.videoUrl = entry.videoUrl; showVideo(entry.videoUrl); }
      if (!text.value.trim()) { text.value = entry.sentence; draft.sentence = entry.sentence; updateCount(); }
      $('#d-view').hidden = false;
      if (!status.textContent) setStatus('오늘 이미 남긴 페이지예요. 영상이나 문장을 바꿔 다시 저장할 수 있어요.');
      $('#d-save').textContent = '수정 저장하기';
    }
  } catch (e) { if (!status.textContent) setStatus(e.message, 'err'); }
  return m;
}
