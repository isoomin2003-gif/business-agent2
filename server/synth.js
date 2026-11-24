// 'AI 작곡' 연주기: AI가 쓴 악보(JSON)를 검사·정리해 30초~1분 길이로 펼치고, 8비트풍 소리로 합성해 WAV로 만듭니다.
// 녹음 파일이나 기존 곡을 쓰지 않고 음표마다 파형(사각·삼각·사인·오르골·뜯는 소리)을 직접 계산합니다.

export const SAMPLE_RATE = 22050;
export const MIN_SEC = 30, MAX_SEC = 60, TARGET_SEC = 44;

const KEYS = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  pentatonic: [0, 2, 4, 7, 9],
  minor_pentatonic: [0, 3, 5, 7, 10],
};
// 화음은 7음 음계 기준 (5음 음계는 같은 성격의 장·단조로)
const CHORD_SCALE = { major: SCALES.major, minor: SCALES.minor, dorian: SCALES.dorian, pentatonic: SCALES.major, minor_pentatonic: SCALES.minor };
export const LEADS = ['square', 'pulse', 'triangle', 'sine', 'musicbox', 'pluck'];
const PADS = ['sine', 'triangle', 'none'];
const BASSES = ['triangle', 'square', 'sine', 'none'];
const DRUMS = ['none', 'soft', 'beat'];
const STEPS = 64; // 한 구간 = 4마디 × 16분음표 16칸

const clampInt = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const pick = (v, list, d) => (list.includes(v) ? v : d);

/** AI가 쓴 악보를 검사·정리. 잘못된 값은 기본값으로, 음표 길이는 구간마다 정확히 4마디가 되게 맞춤 */
export function normalizeScore(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const scale = pick(s.scale, Object.keys(SCALES), 'major');
  const key = Object.hasOwn(KEYS, s.key) ? s.key : 'C';
  const sections = {};
  for (const name of ['A', 'B']) {
    const sec = s.sections?.[name];
    if (!sec) continue;
    const chords = (Array.isArray(sec.chords) ? sec.chords : []).slice(0, 4).map((c) => clampInt(c, 1, 7, 1));
    while (chords.length < 4) chords.push(chords.length ? chords[chords.length - 1] : 1);
    const melody = [];
    let used = 0;
    for (const n of Array.isArray(sec.melody) ? sec.melody : []) {
      if (used >= STEPS) break;
      const deg = clampInt(Array.isArray(n) ? n[0] : n?.deg, 0, 15, 0);
      const len = Math.min(STEPS - used, clampInt(Array.isArray(n) ? n[1] : n?.len, 1, 16, 2));
      melody.push([deg, len]); used += len;
    }
    if (used < STEPS) melody.push([0, STEPS - used]); // 모자라면 쉼표로 채움
    if (melody.some(([d]) => d > 0)) sections[name] = { chords, melody };
  }
  if (!sections.A) throw Object.assign(new Error('악보에 멜로디가 없어요.'), { code: 'bad_score' });
  if (!sections.B) sections.B = sections.A;
  const form = (Array.isArray(s.form) ? s.form : ['A', 'B']).filter((x) => x === 'A' || x === 'B').slice(0, 8);
  return {
    title: String(s.title || '이름 없는 곡').replace(/\s+/g, ' ').trim().slice(0, 24),
    mood: String(s.mood || '').replace(/\s+/g, ' ').trim().slice(0, 60),
    bpm: clampInt(s.bpm, 60, 140, 96), key, scale,
    lead: pick(s.lead, LEADS, 'square'), pad: pick(s.pad, PADS, 'sine'), bass: pick(s.bass, BASSES, 'triangle'), drums: pick(s.drums, DRUMS, 'soft'),
    sections, form: form.length ? form : ['A', 'B'],
  };
}

/** 구간을 몇 번 반복할지: 끝맺음 1마디를 더해 30~60초 (가능하면 44초 근처) */
export function plan(score) {
  const bar = (4 * 60) / score.bpm;
  const sec = bar * 4;
  const lo = Math.ceil((MIN_SEC - bar) / sec), hi = Math.floor((MAX_SEC - bar) / sec);
  const count = Math.max(1, Math.min(hi, Math.max(lo, Math.round((TARGET_SEC - bar) / sec))));
  const order = Array.from({ length: count }, (_, i) => score.form[i % score.form.length]);
  return { bar, order, seconds: count * sec + bar };
}

const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

function noteMidi(score, deg, base) {
  const sc = SCALES[score.scale];
  const i = deg - 1;
  return base + KEYS[score.key] + sc[((i % sc.length) + sc.length) % sc.length] + 12 * Math.floor(i / sc.length);
}

function chordMidis(score, degree, base) {
  const sc = CHORD_SCALE[score.scale];
  return [0, 2, 4].map((k) => { const i = degree - 1 + k; return base + KEYS[score.key] + sc[i % 7] + 12 * Math.floor(i / 7); });
}

// ── 파형 ──
function osc(type, phase) {
  const p = phase - Math.floor(phase);
  switch (type) {
    case 'square': return p < 0.5 ? 1 : -1;
    case 'pulse': return p < 0.25 ? 1 : -1;
    case 'triangle': return 1 - 4 * Math.abs(p - 0.5);
    default: return Math.sin(2 * Math.PI * p);
  }
}

/** 한 음을 buf의 start 위치부터 더함 */
function addNote(buf, start, durSec, hz, type, gain) {
  const sr = SAMPLE_RATE;
  const n = Math.min(buf.length - start, Math.floor((durSec + (type === 'musicbox' || type === 'pluck' ? 0.6 : 0.08)) * sr));
  if (n <= 0) return;
  if (type === 'pluck') { // Karplus-Strong: 잡음을 짧은 지연선에 돌려 줄 뜯는 소리
    const period = Math.max(2, Math.round(sr / hz));
    const line = new Float32Array(period);
    let seed = (hz * 1000) | 0;
    for (let i = 0; i < period; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; line[i] = (seed / 0x7fffffff) * 2 - 1; }
    let idx = 0;
    for (let i = 0; i < n; i++) {
      const next = (idx + 1) % period;
      const v = line[idx];
      line[idx] = 0.497 * (v + line[next]);
      idx = next;
      buf[start + i] += v * gain * (i > n - 200 ? (n - i) / 200 : 1);
    }
    return;
  }
  const attack = type === 'musicbox' ? 0.004 : 0.01, release = 0.08;
  const sustainEnd = durSec;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let env;
    if (type === 'musicbox') env = Math.exp(-t * 4.5);
    else if (t < attack) env = t / attack;
    else if (t < sustainEnd) env = 0.85 + 0.15 * Math.exp(-(t - attack) * 6);
    else env = Math.max(0, 0.85 * (1 - (t - sustainEnd) / release));
    if (t < attack) env = Math.min(env, t / attack);
    const ph = hz * t;
    const v = type === 'musicbox' ? Math.sin(2 * Math.PI * ph) + 0.35 * Math.sin(4 * Math.PI * ph) * Math.exp(-t * 9) : osc(type, ph);
    buf[start + i] += v * env * gain;
  }
}

function addPad(buf, start, durSec, midis, type, gain) {
  const sr = SAMPLE_RATE;
  const n = Math.min(buf.length - start, Math.floor((durSec + 0.3) * sr));
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = Math.min(1, t / 0.35) * (t > durSec ? Math.max(0, 1 - (t - durSec) / 0.3) : 1);
    let v = 0;
    for (const m of midis) v += osc(type, midiHz(m) * t) * (1 + 0.003 * Math.sin(2 * Math.PI * 5 * t));
    buf[start + i] += (v / midis.length) * env * gain;
  }
}

let noiseSeed = 7;
const noise = () => { noiseSeed = (noiseSeed * 1664525 + 1013904223) >>> 0; return noiseSeed / 2147483648 - 1; };
function addDrum(buf, start, kind, gain) {
  const sr = SAMPLE_RATE;
  const len = Math.floor((kind === 'kick' ? 0.22 : kind === 'snare' ? 0.16 : 0.05) * sr);
  let lp = 0, phase = 0;
  for (let i = 0; i < len && start + i < buf.length; i++) {
    const t = i / sr;
    let v;
    if (kind === 'kick') { phase += (45 + 110 * Math.exp(-t * 30)) / sr; v = Math.sin(2 * Math.PI * phase) * Math.exp(-t * 14); }
    else if (kind === 'snare') { lp += 0.6 * (noise() - lp); v = (lp * 0.8 + 0.3 * Math.sin(2 * Math.PI * 190 * t)) * Math.exp(-t * 22); }
    else { const x = noise(); v = (x - lp) * Math.exp(-t * 70); lp = x; }
    buf[start + i] += v * gain;
  }
}

/** 악보 → 오디오 샘플 (Float32, 모노) */
export function render(score) {
  const { bar, order, seconds } = plan(score);
  const sr = SAMPLE_RATE;
  const step = bar / 16;
  const total = Math.ceil((seconds + 1.2) * sr);
  const buf = new Float32Array(total);
  const at = (sec) => Math.floor(sec * sr);
  const leadGain = { square: 0.17, pulse: 0.15, triangle: 0.34, sine: 0.32, musicbox: 0.4, pluck: 0.5 }[score.lead];
  let t0 = 0;
  order.forEach((name, si) => {
    const sec = score.sections[name];
    const last = si === order.length - 1;
    // 화음 반주와 베이스 (마디마다)
    sec.chords.forEach((deg, b) => {
      const bs = t0 + b * bar;
      if (score.pad !== 'none') addPad(buf, at(bs), bar, chordMidis(score, deg, 60), score.pad, 0.06);
      if (score.bass !== 'none') {
        const root = chordMidis(score, deg, 36)[0];
        const hits = score.drums === 'beat' ? [0, 1, 2, 3] : [0, 2];
        for (const q of hits) addNote(buf, at(bs + q * bar / 4), bar / 4 * 0.9, midiHz(q === 3 && score.drums === 'beat' ? root + 7 : root), score.bass, score.bass === 'square' ? 0.045 : 0.1);
      }
      // 리듬: 첫 구간은 조용히 시작하고 둘째 구간부터
      if (score.drums !== 'none' && (si > 0 || order.length === 1)) {
        for (let s = 0; s < 16; s++) {
          const ts = at(bs + s * step);
          if (score.drums === 'beat') {
            if (s === 0 || s === 8 || s === 10) addDrum(buf, ts, 'kick', 0.5);
            if (s === 4 || s === 12) addDrum(buf, ts, 'snare', 0.22);
            if (s % 2 === 0) addDrum(buf, ts, 'hat', 0.07);
          } else {
            if (s === 0) addDrum(buf, ts, 'kick', 0.35);
            if (s % 4 === 2) addDrum(buf, ts, 'hat', 0.05);
          }
        }
      }
    });
    // 멜로디 (마지막 반복은 한 옥타브 위 메아리를 살짝 더함)
    let s = 0;
    for (const [deg, len] of sec.melody) {
      if (deg > 0) {
        const hz = midiHz(noteMidi(score, deg, 60));
        addNote(buf, at(t0 + s * step), len * step * 0.92, hz, score.lead, leadGain);
        if (last && order.length > 2) addNote(buf, at(t0 + s * step + step / 2), len * step * 0.6, hz * 2, 'sine', 0.05);
      }
      s += len;
    }
    t0 += bar * 4;
  });
  // 끝맺음: 첫 화음을 한 마디 길게 + 으뜸음
  addPad(buf, at(t0), bar, chordMidis(score, 1, 60), score.pad === 'none' ? 'sine' : score.pad, 0.1);
  addNote(buf, at(t0), bar * 0.9, midiHz(noteMidi(score, 1, 60)), score.lead, leadGain * 0.8);
  if (score.bass !== 'none') addNote(buf, at(t0), bar * 0.9, midiHz(chordMidis(score, 1, 36)[0]), score.bass, 0.09);

  // 공간감: 짧은 메아리 두 겹 + 부드럽게(1차 저역 통과)
  const out = new Float32Array(Math.ceil(seconds * sr));
  const d1 = Math.floor(0.19 * sr), d2 = Math.floor(0.31 * sr);
  let lp = 0;
  for (let i = 0; i < out.length; i++) {
    let v = buf[i] + (i >= d1 ? 0.22 * buf[i - d1] : 0) + (i >= d2 ? 0.12 * buf[i - d2] : 0);
    lp += 0.55 * (v - lp); v = lp;
    out[i] = v;
  }
  // 음량 맞춤(최고치 -1dB)과 마지막 1.5초 페이드아웃
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  const g = peak > 0 ? 0.89 / peak : 1;
  const fade = Math.floor(1.5 * sr);
  for (let i = 0; i < out.length; i++) out[i] *= g * (i > out.length - fade ? (out.length - i) / fade : 1) * (i < 200 ? i / 200 : 1);
  return out;
}

/** 16비트 PCM 모노 WAV */
export function toWav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SAMPLE_RATE, 24); h.writeUInt32LE(SAMPLE_RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
