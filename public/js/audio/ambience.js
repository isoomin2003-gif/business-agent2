// 공원 자연음: 외부 음원 없이 Web Audio로 직접 합성 (발소리 / 풀벌레 / 바람)
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

export function footstep() {
  if (!ensure()) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(0.12);
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 520 + Math.random() * 260; f.Q.value = 0.9;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
  src.connect(f).connect(g).connect(master); src.start(t); src.stop(t + 0.13);
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
  night = { out, nodes };
}

export function stopNight() {
  if (!night || !ctx) return;
  const { out, nodes } = night; night = null;
  const t = ctx.currentTime;
  out.gain.cancelScheduledValues(t); out.gain.setValueAtTime(out.gain.value, t); out.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
  setTimeout(() => nodes.forEach((n) => { try { n.stop(); } catch { /* 이미 정지 */ } }), 900);
}

export const isNightOn = () => !!night;
