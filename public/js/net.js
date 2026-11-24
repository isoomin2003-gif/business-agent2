// Socket.IO 연결과 서버 시각 동기화
const listeners = new Map();
let socket = null;
let offset = 0; // serverTime - Date.now()

export const now = () => Date.now() + offset;

export function on(ev, fn) {
  if (!listeners.has(ev)) listeners.set(ev, new Set());
  listeners.get(ev).add(fn);
  socket?.on(ev, fn);
  return () => { listeners.get(ev).delete(fn); socket?.off(ev, fn); };
}

export function emit(ev, data) {
  return new Promise((resolve) => {
    if (!socket?.connected) return resolve({ ok: false, message: '서버와 연결이 끊겼어요. 잠시 후 다시 시도해 주세요.' });
    const t = setTimeout(() => resolve({ ok: false, message: '서버 응답이 없어요.' }), 6000);
    socket.emit(ev, data, (res) => { clearTimeout(t); resolve(res); });
  });
}

async function syncTime() {
  let best = Infinity;
  for (let i = 0; i < 5; i++) {
    const t0 = Date.now();
    const server = await new Promise((r) => socket.emit('time', r));
    const rtt = Date.now() - t0;
    if (rtt < best) { best = rtt; offset = server + rtt / 2 - Date.now(); }
  }
}

export function connect({ onConnect } = {}) {
  socket = window.io({ transports: ['websocket', 'polling'] });
  for (const [ev, fns] of listeners) fns.forEach((fn) => socket.on(ev, fn));
  socket.on('connect', async () => { await syncTime(); onConnect?.(); });
  setInterval(() => socket.connected && syncTime(), 30000);
  return socket;
}

export const socketId = () => socket?.id;
