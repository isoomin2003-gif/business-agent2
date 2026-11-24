// 옥상 라디오 재생기: 서버가 정한 곡/시작 시각에 맞춰 모두 같은 지점을 재생합니다.
import * as net from '../net.js';
import { store } from '../api.js';

const audio = document.getElementById('radio-audio');
const powerBtn = document.getElementById('radio-power');
const muteBtn = document.getElementById('radio-mute');
const volume = document.getElementById('radio-volume');

let state = null;
let active = false;
let blocked = false;
let syncTimer = null;
let onStarted = () => {};

audio.volume = store.get('radioVolume', 0.6);
audio.muted = store.get('radioMuted', false);
volume.value = audio.volume;
const paintMute = () => { muteBtn.textContent = audio.muted ? '🔇' : '🔊'; muteBtn.title = audio.muted ? '음소거 해제' : '음소거'; };
paintMute();
volume.addEventListener('input', () => { audio.volume = Number(volume.value); store.set('radioVolume', audio.volume); if (audio.muted && audio.volume > 0) { audio.muted = false; store.set('radioMuted', false); paintMute(); } });
muteBtn.addEventListener('click', () => { audio.muted = !audio.muted; store.set('radioMuted', audio.muted); paintMute(); });
powerBtn.addEventListener('click', () => { blocked = false; powerBtn.hidden = true; tryPlay(); });

const expectedPosition = () => (state?.current ? (net.now() - state.current.startedAt) / 1000 : 0);

function tryPlay() {
  if (!active || !state?.current) return;
  const p = audio.play();
  p?.catch((e) => {
    if (e.name === 'NotAllowedError') { blocked = true; powerBtn.hidden = false; }
  });
}

function load() {
  const cur = state.current;
  const url = new URL(cur.track.file, location.href).href;
  if (audio.src !== url) {
    audio.src = url;
    audio.addEventListener('loadedmetadata', () => { audio.currentTime = Math.max(0, expectedPosition()); if (!blocked) tryPlay(); }, { once: true });
    audio.load();
  } else {
    sync();
  }
}

function sync() {
  if (!active || !state?.current || audio.readyState < 1) return;
  const pos = expectedPosition();
  const dur = state.current.track.durationSec;
  if (pos >= dur) return; // 다음 곡 정보를 기다리는 중
  if (Math.abs(audio.currentTime - pos) > 1.0) audio.currentTime = pos;
  if (audio.paused && !blocked) tryPlay();
}

export const radio = {
  onStarted(fn) { onStarted = fn; },
  enter(snapshot) {
    active = true;
    document.getElementById('radio-controls').hidden = false;
    this.apply(snapshot);
    clearInterval(syncTimer);
    syncTimer = setInterval(sync, 2000);
  },
  apply(snapshot, kind) {
    if (!snapshot) return;
    const prevRequest = state?.current?.requestId;
    state = snapshot;
    if (!active) return;
    load();
    if (kind === 'started' && snapshot.current.requestedBy && snapshot.current.requestId !== prevRequest) onStarted(snapshot.current);
  },
  leave() {
    active = false;
    clearInterval(syncTimer);
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    powerBtn.hidden = true;
    document.getElementById('radio-controls').hidden = true;
  },
  getState: () => state,
  isPlaying: () => active && !audio.paused && !audio.muted && audio.volume > 0,
  isAudible: () => active && !audio.paused && !audio.muted,
};
