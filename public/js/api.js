export async function api(path, { method = 'GET', body, headers } = {}) {
  const res = await fetch(path, {
    method, credentials: 'same-origin',
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* 빈 응답 */ }
  if (!res.ok) {
    const err = new Error(data?.message || `요청에 실패했어요 (${res.status})`);
    err.status = res.status; err.data = data;
    throw err;
  }
  return data;
}

/** 진행률을 알 수 있는 영상 업로드 */
export function uploadVideo(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/videos');
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data?.message || `업로드에 실패했어요 (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('네트워크 문제로 업로드하지 못했어요.'));
    const fd = new FormData();
    fd.append('video', file);
    xhr.send(fd);
  });
}

export const pad = (n) => String(n).padStart(2, '0');
export function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function koDate(s, withDay = true) {
  const [y, m, d] = s.split('-').map(Number);
  const day = '일월화수목금토'[new Date(y, m - 1, d).getDay()];
  return `${y}년 ${m}월 ${d}일${withDay ? ` (${day})` : ''}`;
}
export const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장소 사용 불가 */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* */ } },
  /** 접두어로 시작하는 항목 모두 지움 (로그아웃 때 다이어리 임시 저장 문장 등) */
  clearPrefix(prefix) { try { Object.keys(localStorage).filter((k) => k.startsWith(prefix)).forEach((k) => localStorage.removeItem(k)); } catch { /* */ } },
};
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
