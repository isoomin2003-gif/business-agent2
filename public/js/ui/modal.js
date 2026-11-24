let stack = [];

export function openModal({ title, html = '', wide = false, paper = false, onClose, label } = {}) {
  const root = document.getElementById('modal-root');
  const back = document.createElement('div');
  back.className = 'modal-backdrop';
  back.innerHTML = `<div class="modal${wide ? ' wide' : ''}${paper ? ' paper' : ''}" role="dialog" aria-modal="true" aria-label="${label || title || ''}">
    <button class="btn btn-small close" aria-label="닫기">✕</button>
    ${title ? `<h2>${title}</h2>` : ''}<div class="modal-body">${html}</div></div>`;
  root.appendChild(back);
  const modal = back.querySelector('.modal');
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    back.remove(); stack = stack.filter((m) => m !== api);
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = (e) => { if (e.key === 'Escape' && stack[stack.length - 1] === api) close(); };
  document.addEventListener('keydown', onKey);
  back.addEventListener('pointerdown', (e) => { if (e.target === back) back.dataset.down = '1'; });
  back.addEventListener('click', (e) => { if (e.target === back && back.dataset.down) close(); back.dataset.down = ''; });
  modal.querySelector('.close').addEventListener('click', close);
  const api = { el: modal, body: modal.querySelector('.modal-body'), close, $: (s) => modal.querySelector(s), $$: (s) => modal.querySelectorAll(s) };
  stack.push(api);
  return api;
}

export const closeAllModals = () => [...stack].forEach((m) => m.close());
export const anyModalOpen = () => stack.length > 0;

export function toast(msg, ms = 3200) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), ms);
}
