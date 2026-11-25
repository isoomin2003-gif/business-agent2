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

export function emit(ev, data, { timeout = 6000 } = {}) {
  return new Promise((resolve) => {
    if (!socket?.connected) return resolve({ ok: false, message: '서버와 연결이 끊겼어요. 잠시 후 다시 시도해 주세요.' });
    const t = setTimeout(() => resolve({ ok: false, message: '서버 응답이 없어요. 잠시 후 다시 시도해 주세요.' }), timeout);
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

/** 이 브라우저를 구분하는 방문자 id (탭이 여러 개여도 같은 값 → 전체 접속자 수에서 1명) */
function visitorId() {
  try {
    let v = localStorage.getItem('haruVisitor');
    if (!v || !/^[A-Za-z0-9_-]{8,64}$/.test(v)) {
      const b = new Uint8Array(16); crypto.getRandomValues(b);
      v = btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      localStorage.setItem('haruVisitor', v);
    }
    return v;
  } catch { return ''; }
}

const connectFns = new Set();
export const onConnect = (fn) => connectFns.add(fn);

/** 첫 화면부터 연결 (접속자 수에 포함). 세션 쿠키가 바뀌면 reconnect()로 다시 인증 */
export function connect() {
  if (socket) return socket;
  socket = window.io({ transports: ['websocket', 'polling'], auth: { visitor: visitorId() } });
  for (const [ev, fns] of listeners) fns.forEach((fn) => socket.on(ev, fn));
  socket.on('connect', async () => { await syncTime(); connectFns.forEach((fn) => fn()); });
  setInterval(() => socket.connected && syncTime(), 30000);
  return socket;
}

/** 게스트 생성·로그인 직후: 새 쿠키로 연결을 다시 맺음 */
export function reconnect() {
  if (!socket) return connect();
  return new Promise((resolve) => {
    socket.once('connect', () => resolve());
    socket.disconnect(); socket.connect();
  });
}

export const socketId = () => socket?.id;
