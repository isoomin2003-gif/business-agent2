// 공원 자연음: 외부 음원 없이 Web Audio로 직접 합성 (잔디·산책로 발소리 / 밤 풀벌레 / 약한 바람)
// 공원에 들어서면 밤 소리가 계속되고(서 있을 때·앉았을 때 모두), 나가면 서서히 멈춤. 배경음악은 없음
let ctx = null;
let night = null;
let master = null;

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

function noiseBuffer(sec = 2) {
  const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

const steps = []; // 최근 발소리 기록 (자동 점검용: 시각·바닥)
export const stepLog = () => steps.slice(-40);

/** 짧은 잡음 한 덩어리를 대역 필터로 걸러 소리 냄 */
function grain(t, { dur, freq, q = 1, gain, attack = 0.003, type = 'bandpass' }) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(Math.max(0.05, dur + 0.02));
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master); src.start(t); src.stop(t + dur + 0.02);
}

/**
 * 한 걸음 발소리.
 * - grass: 풀잎이 눌리며 사락 — 높은 대역의 부드러운 잡음 + 아주 약한 낮은 울림
 * - path : 흙·잔자갈 — 낮은 '툭' + 짧은 자갈 알갱이 소리 여러 개를 잘게 흩뿌림
 */
export function footstep(surface = 'grass') {
  if (!ensure()) return;
  const t = ctx.currentTime + 0.005;
  steps.push({ at: Date.now(), surface }); if (steps.length > 80) steps.splice(0, 40);
  const v = 0.85 + Math.random() * 0.3; // 걸음마다 조금씩 다르게
  if (surface === 'path') {
    grain(t, { dur: 0.07, freq: 180, q: 0.8, gain: 0.16 * v, attack: 0.004, type: 'lowpass' });
    const n = 5 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) grain(t + 0.004 + Math.random() * 0.09, { dur: 0.012 + Math.random() * 0.018, freq: 1800 + Math.random() * 2600, q: 2.5, gain: (0.05 + Math.random() * 0.06) * v, attack: 0.001 });
  } else {
    grain(t, { dur: 0.06, freq: 140, q: 0.7, gain: 0.05 * v, attack: 0.01, type: 'lowpass' });
    grain(t + 0.01, { dur: 0.2, freq: 2600 + Math.random() * 900, q: 0.6, gain: 0.07 * v, attack: 0.03 });
    grain(t + 0.05, { dur: 0.14, freq: 5200, q: 0.9, gain: 0.025 * v, attack: 0.02 });
  }
}

export function startNight() {
  if (night || !ensure()) return;
  const t = ctx.currentTime;
  const out = ctx.createGain(); out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(1, t + 1.5); out.connect(master);
  // 바람: 저역 통과 노이즈 + 느린 흔들림
  const wind = ctx.createBufferSource(); wind.buffer = noiseBuffer(4); wind.loop = true;
  const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 420;
  const wg = ctx.createGain(); wg.gain.value = 0.10;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.12; const lg = ctx.createGain(); lg.gain.value = 0.07; lfo.connect(lg).connect(wg.gain);
  const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.07; const lg2 = ctx.createGain(); lg2.gain.value = 180; lfo2.connect(lg2).connect(wf.frequency);
  wind.connect(wf).connect(wg).connect(out);
  // 풀벌레: 고음 사인파를 빠르게 여닫는 맥박(찌르르) + 느린 쉼
  const cricket = (freq, rate, pan, delay) => {
    const o = ctx.createOscillator(); o.frequency.value = freq;
    // 사각파(-1~1)에 같은 크기의 기본값을 더해 0~1로 여닫히게 합니다.
    const trem = ctx.createGain(); trem.gain.value = 0.5;
    const pulse = ctx.createOscillator(); pulse.type = 'square'; pulse.frequency.value = rate;
    const pg = ctx.createGain(); pg.gain.value = 0.5; pulse.connect(pg).connect(trem.gain);
    const phrase = ctx.createGain(); phrase.gain.value = 0.022;
    const slow = ctx.createOscillator(); slow.type = 'square'; slow.frequency.value = 0.55 + Math.random() * 0.3;
    const sg = ctx.createGain(); sg.gain.value = 0.022; slow.connect(sg).connect(phrase.gain);
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (p.pan) p.pan.value = pan;
    o.connect(trem).connect(phrase).connect(p).connect(out);
    [o, pulse, slow].forEach((n) => n.start(t + delay));
    return [o, pulse, slow];
  };
  const nodes = [wind, lfo, lfo2, ...cricket(4300, 28, -0.6, 0), ...cricket(4700, 34, 0.5, 0.7), ...cricket(3900, 22, 0.1, 1.3)];
  wind.start(t); lfo.start(t); lfo2.start(t);
  // 멀리서 가끔 들리는 '찌르-찌르' (위치·높이가 매번 조금씩 달라 가만히 서 있어도 밤공원이 살아 있게)
  const chirp = () => {
    if (!night) return;
    const t0 = ctx.currentTime + 0.02, f = 3400 + Math.random() * 2200, reps = 2 + Math.floor(Math.random() * 3);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) { pan.pan.value = Math.random() * 1.6 - 0.8; pan.connect(out); }
    for (let i = 0; i < reps; i++) {
      const o = ctx.createOscillator(); o.frequency.value = f;
      const g = ctx.createGain(); const s0 = t0 + i * 0.16;
      g.gain.setValueAtTime(0.0001, s0); g.gain.exponentialRampToValueAtTime(0.012, s0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, s0 + 0.11);
      o.connect(g).connect(pan || out); o.start(s0); o.stop(s0 + 0.12);
    }
    night.chirpTimer = setTimeout(chirp, 1400 + Math.random() * 3200);
  };
  night = { out, nodes, chirpTimer: setTimeout(chirp, 900) };
}

export function stopNight() {
  if (!night || !ctx) return;
  const { out, nodes, chirpTimer } = night; night = null;
  clearTimeout(chirpTimer);
  const t = ctx.currentTime;
  out.gain.cancelScheduledValues(t); out.gain.setValueAtTime(out.gain.value, t); out.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
  setTimeout(() => nodes.forEach((n) => { try { n.stop(); } catch { /* 이미 정지 */ } }), 900);
}

export const isNightOn = () => !!night;
