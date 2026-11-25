// 공원 자연음: 녹음 파일 없이 Web Audio로 직접 합성 (밤 바람 · 멀리서 가끔 우는 풀벌레 · 잔디/산책로 발소리)
// - 공원에 들어서면 약한 바람이 계속 흐르고, 풀벌레는 멀리서 '가끔' 짧게 울다 쉼 → 사이사이 바람 소리만 들리는 여백
// - 풀벌레는 귀에 튀지 않게 낮은 음(2.4~3.3kHz)으로, 부드러운 여닫힘과 고음 깎기(저역 통과)를 거쳐 작게
// - 발소리는 아바타가 한 발 내딛을 때마다. 바닥마다 비슷한 소리 4가지를 세기를 조금씩 바꿔 번갈아 냄
// 모든 소리 함수는 (오디오 컨텍스트, 출력, 시각)을 받아, 실제 재생과 오프라인 점검(같은 코드로 미리 렌더링)에 함께 씀
let ctx = null;
let master = null;
let night = null;

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
// 브라우저 자동재생 정책: 첫 사용자 입력에서 오디오 컨텍스트를 깨웁니다.
window.addEventListener('pointerdown', () => ensure(), { once: true });

const noiseCache = new WeakMap();
function noise(c) {
  let b = noiseCache.get(c);
  if (!b) {
    b = c.createBuffer(1, c.sampleRate * 3, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(c, b);
  }
  return b;
}
/** 잡음을 필터에 통과시켜 부드러운 여닫힘(attack→decay)으로 한 번 소리 냄 */
function puff(c, out, t, { attack, decay, peak, filters }) {
  const src = c.createBufferSource(); src.buffer = noise(c);
  let node = src;
  for (const [type, freq, q] of filters) { const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; node.connect(f); node = f; }
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack); // 선형으로 천천히 올라가 '딱' 하고 튀지 않게
  g.gain.setTargetAtTime(0.0001, t + attack, decay / 3);
  node.connect(g).connect(out);
  src.start(t, Math.random() * 2.5); src.stop(t + attack + decay + 0.05);
}

// ───────────── 발소리 ─────────────
// 잔디: 풀잎이 살짝 스치는 '사락' (중고역 잡음, 느린 시작)  /  산책로: 부드러운 흙을 가볍게 밟는 '푹' (낮은 잡음 + 아주 약한 잔모래)
const STEP_VARIANTS = {
  grass: [
    { f: 1700, d: 0.2, a: 0.04, f2: 2400 }, { f: 2000, d: 0.17, a: 0.035, f2: 2700 },
    { f: 1500, d: 0.22, a: 0.045, f2: 2200 }, { f: 1850, d: 0.19, a: 0.05, f2: 2900 },
  ],
  path: [
    { f: 520, d: 0.13, a: 0.014, g: 1600 }, { f: 640, d: 0.11, a: 0.012, g: 1900 },
    { f: 460, d: 0.15, a: 0.016, g: 1450 }, { f: 580, d: 0.12, a: 0.013, g: 1750 },
  ],
};
export function stepSound(c, out, t, surface, variant, level = 1) {
  const v = STEP_VARIANTS[surface][variant % 4];
  if (surface === 'path') {
    puff(c, out, t, { attack: v.a, decay: v.d, peak: 0.075 * level, filters: [['lowpass', v.f, 0.7], ['lowpass', v.f * 1.6, 0.5]] });
    puff(c, out, t + 0.012, { attack: 0.01, decay: 0.07, peak: 0.011 * level, filters: [['bandpass', v.g, 0.8], ['lowpass', 3000, 0.5]] });
  } else {
    puff(c, out, t, { attack: v.a, decay: v.d, peak: 0.042 * level, filters: [['bandpass', v.f, 0.6], ['lowpass', 4200, 0.5]] });
    puff(c, out, t + 0.04, { attack: 0.03, decay: v.d * 0.7, peak: 0.016 * level, filters: [['bandpass', v.f2, 0.7], ['lowpass', 4500, 0.5]] });
  }
}

const steps = []; // 최근 발소리 기록 (자동 점검용: 시각·바닥·변형·세기)
export const stepLog = () => steps.slice(-40);
let lastVariant = -1;
/** 한 걸음: 같은 바닥의 비슷한 소리 4가지 중 직전과 다른 것을, 세기를 0.7~1.0 사이로 바꿔 재생 */
export function footstep(surface = 'grass') {
  if (!ensure()) return;
  let variant = Math.floor(Math.random() * 4);
  if (variant === lastVariant) variant = (variant + 1 + Math.floor(Math.random() * 3)) % 4;
  lastVariant = variant;
  const level = 0.7 + Math.random() * 0.3;
  steps.push({ at: Date.now(), surface, variant, level: +level.toFixed(2) }); if (steps.length > 80) steps.splice(0, 40);
  stepSound(ctx, master, ctx.currentTime + 0.005, surface, variant, level);
}

// ───────────── 밤 분위기 ─────────────
/** 약한 밤바람: 저역 통과 잡음이 천천히 일렁임 (계속 흐름) */
export function windNodes(c, out, t) {
  const src = c.createBufferSource(); src.buffer = noise(c); src.loop = true;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
  const g = c.createGain(); g.gain.value = 0.085;
  const lfo = c.createOscillator(); lfo.frequency.value = 0.11; const lg = c.createGain(); lg.gain.value = 0.05; lfo.connect(lg).connect(g.gain);
  const lfo2 = c.createOscillator(); lfo2.frequency.value = 0.063; const lg2 = c.createGain(); lg2.gain.value = 150; lfo2.connect(lg2).connect(lp.frequency);
  src.connect(lp).connect(g).connect(out);
  [src, lfo, lfo2].forEach((n) => n.start(t));
  return [src, lfo, lfo2];
}

/** 멀리서 들리는 풀벌레 한 소절: 낮은 음, 부드럽게 여닫히는 짧은 울음 몇 번, 고음 깎기 + 옅은 메아리 */
export function cricketPhrase(c, out, t, rnd = Math.random) {
  const freq = 2400 + rnd() * 900;
  const pulses = 3 + Math.floor(rnd() * 4), gap = 0.07 + rnd() * 0.035;
  const peak = 0.012 + rnd() * 0.009; // 예전(쉬지 않고 울던 4~4.7kHz)보다 최고 세기 약 10dB 낮게
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3600; lp.Q.value = 0.5;
  const pan = c.createStereoPanner ? c.createStereoPanner() : null;
  const echo = c.createDelay(0.5); echo.delayTime.value = 0.13; const eg = c.createGain(); eg.gain.value = 0.25;
  const dest = pan || out;
  if (pan) { pan.pan.value = rnd() * 1.4 - 0.7; pan.connect(out); }
  lp.connect(dest); lp.connect(echo).connect(eg).connect(dest);
  const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
  const g = c.createGain(); g.gain.setValueAtTime(0, t);
  for (let i = 0; i < pulses; i++) {
    const s = t + i * gap;
    g.gain.setValueAtTime(0, s);
    g.gain.linearRampToValueAtTime(peak * (0.8 + rnd() * 0.4), s + 0.014);
    g.gain.linearRampToValueAtTime(0, s + 0.045);
  }
  o.connect(g).connect(lp);
  o.start(t); o.stop(t + pulses * gap + 0.1);
  return t + pulses * gap;
}

/**
 * from~to 사이에 풀벌레 소절을 띄엄띄엄 배치. 한 번 울면 짧게 한두 번 더 이어 울기도 하고,
 * 소절 사이는 2.5~7초, 가끔은 7~11초 동안 바람 소리만. 다음에 울 시각을 돌려줌
 */
export function scheduleCrickets(c, out, from, to, rnd = Math.random) {
  let t = from;
  while (t < to) {
    let end = cricketPhrase(c, out, t, rnd);
    if (rnd() < 0.45) end = cricketPhrase(c, out, end + 0.35 + rnd() * 0.4, rnd); // 이어서 한 번 더
    t = end + (rnd() < 0.25 ? 7 + rnd() * 4 : 2.5 + rnd() * 4.5);
  }
  return t;
}

export function startNight() {
  if (night || !ensure()) return;
  const t = ctx.currentTime;
  const out = ctx.createGain(); out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(1, t + 1.5); out.connect(master);
  const nodes = windNodes(ctx, out, t);
  const n = { out, nodes, next: t + 1.2 + Math.random() * 2 };
  // 몇 초 앞까지 미리 예약해 두고 주기적으로 이어 붙임 (탭이 잠깐 느려져도 끊기지 않게)
  const fill = () => { if (night === n && n.next < ctx.currentTime + 10) n.next = scheduleCrickets(ctx, out, Math.max(n.next, ctx.currentTime + 0.05), ctx.currentTime + 10); };
  night = n;
  fill();
  n.timer = setInterval(fill, 3000);
}

export function stopNight() {
  if (!night || !ctx) return;
  const { out, nodes, timer } = night; night = null;
  clearInterval(timer);
  const t = ctx.currentTime;
  out.gain.cancelScheduledValues(t); out.gain.setValueAtTime(out.gain.value, t); out.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
  setTimeout(() => { nodes.forEach((x) => { try { x.stop(); } catch { /* 이미 정지 */ } }); out.disconnect(); }, 900);
}

export const isNightOn = () => !!night;

/**
 * 점검용 미리 듣기: 같은 소리 함수로 오프라인 렌더링 (실제 재생과 같은 합성 코드)
 * scene 'bench' = 벤치에 가만히 앉은 seconds초 / 'walk' = 잔디를 걷다 산책로로 이어 걷기
 * layers: 'all' | 'wind' | 'crickets' | 'steps'
 */
export async function renderPreview(scene = 'bench', seconds = 30, layers = 'all', seed = 7) {
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const c = new OfflineAudioContext(2, Math.round(44100 * seconds), 44100);
  const out = c.createGain(); out.gain.value = 0.9; out.connect(c.destination);
  const marks = [];
  if (layers === 'all' || layers === 'wind') windNodes(c, out, 0);
  if (layers === 'all' || layers === 'crickets') scheduleCrickets(c, out, 1.2, seconds - 1, rnd);
  if (scene === 'walk' && (layers === 'all' || layers === 'steps')) {
    let last = -1;
    for (let i = 0, t = 1; t < seconds - 0.5; i++, t += 0.24) {
      const surface = t < seconds / 2 ? 'grass' : 'path';
      let v = Math.floor(rnd() * 4); if (v === last) v = (v + 1) % 4; last = v;
      const level = 0.7 + rnd() * 0.3;
      stepSound(c, out, t, surface, v, level);
      marks.push({ t: +t.toFixed(2), surface, v, level: +level.toFixed(2) });
    }
  }
  const buf = await c.startRendering();
  return { sampleRate: buf.sampleRate, left: buf.getChannelData(0), right: buf.getChannelData(1), marks };
}
