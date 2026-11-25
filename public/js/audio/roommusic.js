// 내 방 CD 플레이어: 나에게만 들리는 방 전용 음악 (옥상 공용 라디오·신청 대기열과 무관)
// - 방에 들어오면 늘 꺼진 상태. CD 플레이어를 누르면 무작위 순서로 한 바퀴 → 끝나면 다시 섞어 반복
// - 곡은 이 사이트에 함께 올린 CC0 음원 중 방에 어울리는 잔잔한 8곡 (출처는 README '라디오 음원' 표)
import { store } from '../api.js';

export const PLAYLIST = [
  { file: '/media/music/catmint.mp3', title: 'Catmint', artist: 'Kistol' },
  { file: '/media/music/etirwer.mp3', title: 'Etirwer', artist: 'Kistol' },
  { file: '/media/music/friends-2018.mp3', title: 'Friends, 2018', artist: 'Loyalty Freak Music' },
  { file: '/media/music/november-snow.mp3', title: 'November Snow', artist: 'cynicmusic' },
  { file: '/media/music/chill-lofi-inspired.mp3', title: 'Chill lofi inspired', artist: 'omfgdude' },
  { file: '/media/music/ladada-guitar.mp3', title: 'LaDaDa Guitar', artist: 'Pro Sensory' },
  { file: '/media/music/champ-de-tournesol.mp3', title: 'Champ de tournesol', artist: 'Loyalty Freak Music' },
  { file: '/media/music/agaisnt-wanderlust.mp3', title: 'Agaisnt Wanderlust', artist: 'poinl' },
];

const audio = new Audio();
audio.preload = 'none';
audio.volume = store.get('roomVolume', 0.55);

let order = [];   // 이번 바퀴의 재생 순서 (PLAYLIST 번호)
let pos = -1;     // order 안의 현재 위치
let playing = false;
let primed = false;
let rounds = 0;   // 몇 바퀴째인지 (점검용)
const history = []; // 재생한 곡 기록 (점검용)
// CD 회전: 재생 중에만 각도가 늘어나고, 멈추면 그 각도에서 정지
let angle = 0, spinFrom = null;
const SPIN = (Math.PI * 2) / 4000; // 4초에 한 바퀴 (천천히)

function shuffle(last) {
  const a = PLAYLIST.map((_, i) => i);
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  if (a.length > 1 && a[0] === last) [a[0], a[1]] = [a[1], a[0]]; // 바퀴가 바뀔 때 같은 곡이 연달아 나오지 않게
  return a;
}

function load(i) {
  audio.src = PLAYLIST[i].file;
  history.push(i);
  if (history.length > 50) history.splice(0, 25);
}

function next() {
  pos++;
  if (pos >= order.length) { order = shuffle(order[order.length - 1]); pos = 0; rounds++; }
  load(order[pos]);
  audio.play().catch(() => {});
}
audio.addEventListener('ended', () => { if (playing) next(); });
audio.addEventListener('error', () => { if (playing) setTimeout(next, 300); }); // 읽지 못한 곡은 건너뜀

/** 클릭한 그 순간에 호출: 모바일 브라우저가 나중의 재생을 막지 않도록 조용히 재생 권한을 얻어 둠 */
export function prime() {
  if (playing || primed) return;
  primed = true;
  order = shuffle(null); pos = 0; rounds = 1; history.length = 0;
  load(order[0]);
  audio.muted = true;
  audio.play().catch(() => {});
}
export function cancelPrime() {
  if (!primed || playing) return;
  primed = false;
  audio.pause(); audio.muted = false; audio.removeAttribute('src'); audio.load();
}

/** CD 플레이어 앞에 도착했을 때: 첫 곡을 처음부터 재생 */
export function play() {
  if (playing) return;
  if (!primed) prime();
  primed = false;
  playing = true;
  audio.muted = false;
  try { audio.currentTime = 0; } catch { /* 아직 불러오는 중 */ }
  audio.play().catch(() => {});
  spinFrom = performance.now();
}

export function stop() {
  primed = false;
  if (spinFrom !== null) { angle += (performance.now() - spinFrom) * SPIN; spinFrom = null; }
  if (!playing && !audio.src) return;
  playing = false;
  audio.pause(); audio.muted = false;
  audio.removeAttribute('src'); audio.load();
}

export const isPlaying = () => playing;
export const cdAngle = () => angle + (spinFrom !== null ? (performance.now() - spinFrom) * SPIN : 0);
export const state = () => ({
  playing, paused: audio.paused, src: audio.src ? decodeURIComponent(new URL(audio.src).pathname) : '', time: audio.currentTime,
  order: order.map((i) => PLAYLIST[i].title), pos, rounds, played: history.map((i) => PLAYLIST[i].title), angle: cdAngle(),
});
/** 점검용: 지금 곡을 끝부분으로 옮겨 다음 곡으로 넘어가는지 확인 */
export const _skipToEnd = () => { if (audio.duration) audio.currentTime = Math.max(0, audio.duration - 1); };
