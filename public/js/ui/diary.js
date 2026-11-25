// 책상: 오늘의 다이어리 쓰기/수정 — 사진 또는 영상 하나 + 한 문장
import { api, uploadVideo, localToday, koDate, store, esc } from '../api.js';
import { openModal, toast } from './modal.js';

const MAX = 100;
// 모달을 닫았다 열어도 작성 중인 내용이 유지되도록 모듈 범위에 보관
const draft = { date: null, sentence: '', videoId: null, videoUrl: null, mediaType: null, saved: null };

/** 책에서 오늘 페이지를 지웠을 때, 다이어리 창이 지워진 페이지를 '수정'하려 하지 않도록 초기화 */
export function forgetEntry(entryId) {
  if (draft.saved?.id !== entryId) return;
  if (draft.videoId === draft.saved.videoId) { draft.videoId = null; draft.videoUrl = null; draft.mediaType = null; }
  if (draft.sentence === draft.saved.sentence) draft.sentence = '';
  draft.saved = null;
}

export async function openDiary({ onViewInShelf, onSaved } = {}) {
  const today = localToday();
  if (draft.date !== today) Object.assign(draft, { date: today, sentence: store.get(`draft:${today}`, ''), videoId: null, videoUrl: null, mediaType: null, saved: null });
  const touch = matchMedia('(pointer: coarse)').matches;
  const m = openModal({
    title: '오늘의 한 장', paper: true, label: '다이어리 쓰기',
    html: `
      <div class="stack">
        <div class="diary-date">${koDate(today)}</div>
        <div class="video-box" id="d-video"><span>오늘 가장 기억에 남는 순간의 사진이나 영상을 골라 주세요</span></div>
        <div class="progress" id="d-prog" hidden><i></i></div>
        <div class="row">
          <label class="btn btn-small" for="d-file" id="d-file-label">📎 사진 또는 영상 추가</label>
          <input id="d-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/*" hidden>
          ${touch ? `<label class="btn btn-small" for="d-cam">📷 직접 촬영</label><input id="d-cam" type="file" accept="video/*" capture="environment" hidden>` : ''}
          <button class="btn btn-small" id="d-sample-btn">✨ 샘플 영상으로 써보기</button>
          <button class="btn btn-small" id="d-clear" hidden>✕ 첨부 지우기</button>
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
  // 미리보기: 사진은 이미지, 영상은 기존처럼 재생 가능한 영상. 첨부가 있으면 '지우기'와 '바꾸기'
  const showVideo = (url, type = draft.mediaType) => {
    $('#d-video').innerHTML = !url ? '<span>오늘 가장 기억에 남는 순간의 사진이나 영상을 골라 주세요</span>'
      : type === 'photo' ? `<img src="${esc(url)}" alt="오늘의 사진 미리보기">`
        : `<video src="${esc(url)}#t=0.1" controls playsinline preload="metadata"></video>`;
    $('#d-clear').hidden = !url;
    $('#d-file-label').textContent = url ? '📎 다른 사진·영상으로 바꾸기' : '📎 사진 또는 영상 추가';
  };
  /** 저장 전 첨부를 바꾸거나 지울 때, 아직 어느 일기에도 쓰이지 않은 이전 파일은 서버에서 지움 */
  const dropUnsaved = (id) => { if (id && id !== draft.saved?.videoId) api(`/api/videos/${id}`, { method: 'DELETE' }).catch(() => {}); };
  const setMedia = (r) => { const prev = draft.videoId; draft.videoId = r.videoId; draft.videoUrl = r.url; draft.mediaType = r.mediaType || 'video'; showVideo(r.url); if (prev !== r.videoId) dropUnsaved(prev); };
  const updateCount = () => { count.textContent = `${[...text.value].length}/${MAX}`; };

  text.value = draft.sentence; updateCount();
  if (draft.videoUrl) showVideo(draft.videoUrl);
  // 오늘 이미 쓴 페이지는 아래(버튼 연결 뒤)에서 불러옵니다. 느린 연결에서도 버튼이 바로 동작하도록.

  text.addEventListener('input', () => { draft.sentence = text.value; store.set(`draft:${today}`, text.value); updateCount(); });
  // 휴대폰에서 키보드가 올라오면 입력란이 가려지지 않게, 저장 버튼까지 보이도록 창 안에서 스크롤
  text.addEventListener('focus', () => setTimeout(() => $('#d-save').scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 350));

  async function handleFile(input) {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return; // 선택 취소: 작성 중인 문장은 그대로
    const isPhoto = file.type.startsWith('image/');
    if (!isPhoto && !file.type.startsWith('video/')) return setStatus('사진이나 영상 파일만 고를 수 있어요.', 'err');
    if (/heic|heif/i.test(file.type)) return setStatus('HEIC 사진은 아직 열 수 없어요. JPG나 PNG로 골라 주세요.', 'err');
    const prog = $('#d-prog');
    prog.hidden = false; prog.firstElementChild.style.width = '0%';
    setStatus(isPhoto ? '사진을 올리는 중이에요…' : '영상을 올리는 중이에요…');
    try {
      const r = await uploadVideo(file, (p) => { prog.firstElementChild.style.width = `${Math.round(p * 100)}%`; });
      setMedia(r);
      setStatus(`${r.mediaType === 'photo' ? '사진' : '영상'}을 골랐어요. 한 문장을 적고 저장해 주세요.`, 'ok');
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
        setMedia(r);
        setStatus('샘플 영상을 골랐어요. 이제 직접 한 문장을 적어 저장해 보세요.', 'ok');
        text.focus();
      } catch (e) { setStatus(`${e.message} 작성 중인 문장은 그대로예요.`, 'err'); }
    }));
  });

  $('#d-clear').addEventListener('click', () => {
    dropUnsaved(draft.videoId);
    Object.assign(draft, { videoId: null, videoUrl: null, mediaType: null });
    showVideo(null);
    setStatus(draft.saved ? '첨부를 지웠어요. 다른 사진이나 영상을 골라 주세요. (저장된 페이지는 다시 저장할 때 바뀌어요)' : '첨부를 지웠어요. 작성 중인 문장은 그대로예요.');
  });

  async function save() {
    const sentence = text.value.trim();
    if (!draft.videoId) return setStatus('사진이나 영상을 먼저 골라 주세요. (샘플 영상으로도 써볼 수 있어요)', 'err');
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
      if (r.created) onSaved?.(r.entry); // 새 기록이면 방 책장에 책등 하나가 색을 입음
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
      if (!draft.videoId) { draft.videoId = entry.videoId; draft.videoUrl = entry.videoUrl; draft.mediaType = entry.mediaType; showVideo(entry.videoUrl); }
      if (!text.value.trim()) { text.value = entry.sentence; draft.sentence = entry.sentence; updateCount(); }
      $('#d-view').hidden = false;
      if (!status.textContent) setStatus('오늘 이미 남긴 페이지예요. 사진·영상이나 문장을 바꿔 다시 저장할 수 있어요.');
      $('#d-save').textContent = '수정 저장하기';
    }
  } catch (e) { if (!status.textContent) setStatus(e.message, 'err'); }
  return m;
}
