// '오늘의 단어로 작곡하기' — AI(OpenRouter)가 사용자의 문장으로 새 악보를 쓰고, 서버가 그 악보를 소리로 합성
//
//  1) 사용자의 문장만 AI에게 보냄 (닉네임·계정·일기 정보는 보내지 않음)
//  2) AI는 조성·빠르기·악기·화음·멜로디를 JSON 악보로 씀. 특정 곡을 따라 해 달라는 요청은 거절
//  3) 서버가 악보를 검사·정리(server/synth.js)하고 30초~1분 길이로 펼쳐 8비트풍 WAV로 합성 — 녹음·기존 곡·샘플 음원은 쓰지 않음
//  4) 결과는 만든 사람만 미리 들을 수 있는 임시 곡(1시간 보관). '옥상 라디오에 신청'을 누르면 저장소에 올리고 라디오 목록에 추가
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from './config.js';
import { normalizeScore, render, toWav, plan, SAMPLE_RATE, LEADS, SCALES } from './synth.js';

const DRAFT_DIR = path.join(os.tmpdir(), 'haru-compose');
const DRAFT_TTL = 60 * 60_000;
const drafts = new Map(); // id → { id, owner, file, score, durationMs, createdAt }

const LEAD_KO = { square: '사각파', pulse: '얇은 사각파', triangle: '삼각파', sine: '사인파', musicbox: '오르골', pluck: '뜯는 현' };
const SCALE_KO = { major: '장조', minor: '단조', dorian: '도리안', pentatonic: '5음 장음계', minor_pentatonic: '5음 단음계' };

// 특정 곡을 그대로 따라 해 달라는 요청 (AI 판단 전에 먼저 거름)
const COPY_RE = /(멜로디|노래|곡|반주|음악|부분|후렴|전주)\s*(를|을)?\s*(똑같이|그대로|비슷하게\s*베|따라|베껴|카피|복사)|(똑같이|그대로|베껴|카피)\s*(만들|작곡|불러|연주|해)|커버\s*해|cover|copy|remake|리메이크/i;
export const REFUSE_MESSAGE = '특정 곡의 멜로디를 따라 만들 수는 없어요. 대신 원하는 분위기나 악기를 적어 주세요. 예) 비 오는 오후의 느린 오르골';

export const PROMPT = `너는 '하루 한 장' 옥상 라디오의 AI 작곡가야. 사용자의 짧은 문장(또는 단어 몇 개)에서 떠오르는 분위기로, 세상에 없던 새 연주곡의 악보를 JSON으로 써.
- 가사·노래는 없어. 악보만 써.
- 사용자가 특정 곡·가수·작품의 멜로디를 따라 하거나 비슷하게 만들어 달라고 하면 {"refuse": true} 만 답해. 분위기·장면·악기만 적은 요청은 작곡해.
- 이미 있는 유명한 곡의 멜로디를 쓰지 말고 새로 지어.
- 형식 (다른 설명 없이 JSON 하나만):
{"title":"한국어 곡 제목(12자 이내)","mood":"어떤 분위기로 만들었는지 한국어 한 줄(30자 이내)","bpm":60~140,"key":"C|C#|D|Eb|E|F|F#|G|Ab|A|Bb|B","scale":"major|minor|dorian|pentatonic|minor_pentatonic","lead":"square|pulse|triangle|sine|musicbox|pluck","pad":"sine|triangle|none","bass":"triangle|square|sine|none","drums":"none|soft|beat","sections":{"A":{"chords":[4개],"melody":[[음,길이],...]},"B":{"chords":[4개],"melody":[[음,길이],...]}},"form":["A","A","B","A"]}
- chords: 마디마다 음계의 몇 번째 음 위의 화음인지 1~7 (예: [1,5,6,4]).
- melody: [음, 길이] 목록. 음은 음계의 몇 번째 음(1=으뜸음, 8=한 옥타브 위 으뜸음, 최대 15), 0은 쉼표. 길이는 16분음표 개수(1~16, 4=4분음표). 한 구간(A 또는 B)의 길이 합은 정확히 64(4마디).
- A와 B는 서로 다른 멜로디로, 같은 동기를 조금씩 바꿔 반복하면 노래처럼 들려. 음을 너무 잘게 쪼개지 말고 (구간마다 12~28개 음), 마디 끝은 화음에 맞는 음으로.
- 악기: 오르골 musicbox, 뜯는 현(기타·하프 느낌) pluck, 부드러움 sine·triangle, 8비트 게임 느낌 square·pulse.
- 빠르기·조성·드럼은 문장의 분위기에 맞춰 (잔잔함→느리게·drums none 또는 soft, 신남→빠르게·beat).`;

const brief = (text) => String(text || '').replace(/\s+/g, ' ').trim();

async function askScore(text) {
  if (!config.openrouter.apiKey) return { ok: false, status: 'no_key' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Math.max(config.openrouter.timeoutMs, 45000));
  try {
    const res = await fetch(`${config.openrouter.baseUrl}/chat/completions`, {
      method: 'POST', signal: ctrl.signal,
      headers: { Authorization: `Bearer ${config.openrouter.apiKey}`, 'Content-Type': 'application/json', ...(config.publicUrl ? { 'HTTP-Referer': config.publicUrl } : {}), 'X-Title': 'Haru Hanjang Compose' },
      body: JSON.stringify({ model: config.openrouter.model, temperature: 0.9, max_tokens: 2500, messages: [{ role: 'system', content: PROMPT }, { role: 'user', content: text }] }),
    });
    if (!res.ok) { console.warn(`[compose] OpenRouter HTTP ${res.status}`); return { ok: false, status: 'api_error' }; }
    const content = String((await res.json())?.choices?.[0]?.message?.content || '');
    try { return { ok: true, json: JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] || '') }; } catch { return { ok: false, status: 'bad_score' }; }
  } catch (e) {
    console.warn(`[compose] OpenRouter error: ${e.message}`);
    return { ok: false, status: 'api_error' };
  } finally { clearTimeout(timer); }
}

function cleanup() {
  const now = Date.now();
  for (const [id, d] of drafts) if (now - d.createdAt > DRAFT_TTL) { drafts.delete(id); fs.rm(d.file, { force: true }, () => {}); }
}

/**
 * 문장 → 새 곡(임시). { status: 'ok', draft } | { status: 'refused'|'no_key'|'api_error'|'bad_score'|'bad_text', message? }
 */
export async function compose(rawText, ownerId) {
  const text = brief(rawText);
  if (!text) return { status: 'bad_text', message: '문장이나 단어를 적어 주세요.' };
  if ([...text].length > 60) return { status: 'bad_text', message: '60자 이내로 적어 주세요.' };
  if (COPY_RE.test(text)) return { status: 'refused', message: REFUSE_MESSAGE };
  // AI가 형식에 맞지 않는 악보를 쓰면 한 번 더 요청
  let score = null, last = null;
  for (let i = 0; i < 2 && !score; i++) {
    last = await askScore(text);
    if (!last.ok) { if (last.status !== 'bad_score') break; continue; }
    if (last.json?.refuse) return { status: 'refused', message: REFUSE_MESSAGE };
    try { score = normalizeScore(last.json); } catch { last = { ok: false, status: 'bad_score' }; }
  }
  if (!score) return { status: last?.status || 'api_error' };
  const samples = render(score);
  const wav = toWav(samples);
  cleanup();
  fs.mkdirSync(DRAFT_DIR, { recursive: true });
  const id = crypto.randomBytes(9).toString('base64url');
  const file = path.join(DRAFT_DIR, `${id}.wav`);
  await fs.promises.writeFile(file, wav);
  const durationMs = Math.round((samples.length / SAMPLE_RATE) * 1000);
  const draft = { id, owner: ownerId, file, score, durationMs, createdAt: Date.now(), text };
  drafts.set(id, draft);
  return { status: 'ok', draft: publicDraft(draft) };
}

export function publicDraft(d) {
  const s = d.score;
  return {
    id: `ai:${d.id}`, title: s.title, mood: s.mood, durationSec: Math.round(d.durationMs / 100) / 10, bpm: s.bpm,
    key: `${s.key} ${SCALE_KO[s.scale]}`, lead: LEAD_KO[s.lead], sections: plan(s).order.join('·'), previewUrl: `/api/compose/${d.id}/audio`,
  };
}

/** 만든 사람만 접근 가능한 임시 곡 */
export function getDraft(id, ownerId) {
  const d = drafts.get(String(id).replace(/^ai:/, ''));
  return d && d.owner === ownerId && fs.existsSync(d.file) ? d : null;
}

/** 라디오 목록에 등록할 곡 정보 */
export function draftTrack(d) {
  return {
    id: `ai:${d.id}`, kind: 'generated', source: 'haru-ai', title: d.score.title, artist: 'AI 작곡',
    audioUrl: `/api/radio/audio/ai:${d.id}`, sourceUrl: '', license: 'generated', licenseVersion: '', licenseUrl: '',
    attribution: `${d.score.mood ? `${d.score.mood} · ` : ''}${d.score.bpm} BPM · ${d.score.key} ${SCALE_KO[d.score.scale]} · ${LEAD_KO[d.score.lead]}`,
    durationMs: d.durationMs, genres: [], tags: [d.score.lead, d.score.scale],
  };
}

export const storageKey = (trackId) => `radio/${String(trackId).replace(':', '-')}.wav`;
export const _test = { drafts, LEADS, SCALES };
