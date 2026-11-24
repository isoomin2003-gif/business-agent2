// 옥상 라디오 AI DJ — OpenRouter 도구 호출(tool calling)
// 1) AI가 사용자의 요청(기분·상황)을 해석해 검색 조건을 정하고 search_tracks 도구를 호출
// 2) 서버가 실제 음원 목록(server/tracks.js)에서 조건에 맞는 곡을 찾아 결과를 돌려줌
// 3) AI가 결과 중 한 곡을 고르거나, 맞는 곡이 없으면 요청의 핵심을 유지한 채 조건을 바꿔 한 번 더 검색(검색은 최대 2회)
// 4) 끝까지 없으면 '없음'. 고른 곡은 반드시 검색 결과에 있던 곡이어야 함(서버가 확인)
// 추천은 요청한 사람에게만 돌려주고, 공용 대기열에는 사용자가 '신청하기'를 눌렀을 때만 들어감.
// OpenRouter에는 사용자의 요청 문장과 음원 목록 정보(제목·분위기 등)만 보냄 — 닉네임·계정·일기 정보 없음.
import { config } from './config.js';
import { TRACKS, TRACK_BY_ID, VOCAB } from './tracks.js';

export const MAX_SEARCHES = 2;
const MAX_TURNS = 5;

/** 도구 실행: 조건에 맞는 곡을 점수순으로 최대 5곡 */
export function searchTracks(args = {}) {
  const list = (v) => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []);
  const moods = list(args.moods), scenes = list(args.scenes), instruments = list(args.instruments), avoid = list(args.avoid_moods);
  const tempo = VOCAB.tempo.includes(args.tempo) ? args.tempo : null;
  const hasCriteria = moods.length || scenes.length || instruments.length || tempo;
  const results = TRACKS
    .filter((t) => !t.moods.some((m) => avoid.includes(m)))
    .map((t) => {
      const mm = t.moods.filter((m) => moods.includes(m));
      const sm = t.scenes.filter((s) => scenes.includes(s));
      const im = t.instruments.filter((i) => instruments.includes(i));
      const score = mm.length * 2 + sm.length * 2 + im.length + (tempo && t.tempo === tempo ? 1 : 0);
      return { t, score, matched: [...mm, ...sm, ...im, ...(tempo && t.tempo === tempo ? [`빠르기 ${tempo}`] : [])] };
    })
    .filter((r) => (hasCriteria ? r.score > 0 : true))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ t, matched }) => ({ id: t.id, title: t.title, artist: t.artist, genre: t.genre, moods: t.moods, scenes: t.scenes, instruments: t.instruments, tempo: t.tempo, bpm: t.bpm, matched }));
  return { count: results.length, results };
}

export const SEARCH_TOOL = {
  type: 'function',
  function: {
    name: 'search_tracks',
    description: '옥상 라디오의 실제 음원 목록에서 조건에 맞는 곡을 찾는다. 결과는 맞은 조건이 많은 순서로 최대 5곡.',
    parameters: {
      type: 'object',
      properties: {
        moods: { type: 'array', items: { type: 'string', enum: VOCAB.moods }, description: '원하는 분위기' },
        scenes: { type: 'array', items: { type: 'string', enum: VOCAB.scenes }, description: '어울리는 장면·상황 (있을 때만)' },
        tempo: { type: 'string', enum: VOCAB.tempo, description: '빠르기' },
        instruments: { type: 'array', items: { type: 'string', enum: VOCAB.instruments }, description: '원하는 악기 (요청에 있을 때만)' },
        avoid_moods: { type: 'array', items: { type: 'string', enum: VOCAB.moods }, description: '피하고 싶은 분위기 (이 분위기가 있는 곡은 제외)' },
      },
    },
  },
};

export const DJ_PROMPT = `너는 '하루 한 장' 옥상 라디오의 AI DJ야. 사용자의 기분이나 상황을 듣고 음원 목록에서 어울리는 곡 하나를 추천해.
- 먼저 요청을 검색 조건(moods 분위기, scenes 장면, tempo 빠르기, instruments 악기, avoid_moods 피할 분위기)으로 바꿔 search_tracks 도구를 호출해. 값은 도구에 적힌 목록에서만 골라.
- 결과가 없거나 요청에 맞는 곡이 없으면, 요청의 핵심(예: '밤', '너무 쓸쓸하지 않게')은 지키면서 덜 중요한 조건을 빼거나 비슷한 말로 바꿔 한 번만 더 검색해. 검색은 최대 ${MAX_SEARCHES}번이야.
- 추천 곡은 반드시 검색 결과에 있던 곡의 id여야 해.
- 너는 곡을 직접 들을 수 없어. 추천 이유는 검색 결과에 적힌 분위기·장면·빠르기·악기 정보만 근거로 한국어 한 문장으로 쓰고, 들어 보지 않은 소리를 지어내지 마.
- 사용자가 '틀어줘', '재생해줘'라고 해도 너는 추천만 해. 신청은 사용자가 버튼으로 해.
- 마지막 답은 JSON 하나만 출력해: {"track_id":"곡 id","reason":"한 문장"} 또는 끝까지 맞는 곡이 없으면 {"track_id":null,"reason":"짧은 이유"}`;

async function chat(messages) {
  if (!config.openrouter.apiKey) return { ok: false, status: 'no_key' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.openrouter.timeoutMs);
  try {
    const res = await fetch(`${config.openrouter.baseUrl}/chat/completions`, {
      method: 'POST', signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${config.openrouter.apiKey}`, 'Content-Type': 'application/json',
        ...(config.publicUrl ? { 'HTTP-Referer': config.publicUrl } : {}), 'X-Title': 'Haru Hanjang AI DJ',
      },
      body: JSON.stringify({ model: config.openrouter.model, temperature: 0.3, max_tokens: 400, messages, tools: [SEARCH_TOOL], tool_choice: 'auto' }),
    });
    if (!res.ok) {
      console.warn(`[dj] OpenRouter HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
      return { ok: false, status: 'api_error', code: res.status };
    }
    const data = await res.json();
    return { ok: true, message: data?.choices?.[0]?.message || {}, model: data.model };
  } catch (e) {
    console.warn(`[dj] OpenRouter error: ${e.message}`);
    return { ok: false, status: 'api_error' };
  } finally { clearTimeout(timer); }
}

function parseFinal(content) {
  const m = String(content || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

/** 요청 문장 → { status: 'ok'|'none'|'no_key'|'api_error', track?, reason?, trace } */
export async function recommend(text) {
  const trace = [];
  const seen = new Set(); // 검색 결과로 실제로 보여 준 곡
  let searches = 0;
  const messages = [{ role: 'system', content: DJ_PROMPT }, { role: 'user', content: String(text).slice(0, 200) }];
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const r = await chat(messages);
    if (!r.ok) { trace.push({ kind: 'error', status: r.status, code: r.code }); return { status: r.status, trace }; }
    const msg = r.message;
    const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
    if (calls.length) {
      messages.push({ role: 'assistant', content: msg.content || '', tool_calls: calls });
      for (const call of calls) {
        let args = {};
        try { args = JSON.parse(call.function?.arguments || '{}'); } catch { /* 잘못된 인자 */ }
        let result;
        if (call.function?.name !== 'search_tracks') result = { error: '알 수 없는 도구' };
        else if (searches >= MAX_SEARCHES) result = { error: `검색은 ${MAX_SEARCHES}번까지예요. 지금까지의 결과에서 고르거나, 없으면 track_id를 null로 답하세요.` };
        else {
          searches++;
          result = searchTracks(args);
          result.results.forEach((x) => seen.add(x.id));
          trace.push({ kind: 'search', round: searches, args, found: result.count, ids: result.results.map((x) => x.id) });
        }
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      }
      continue;
    }
    const final = parseFinal(msg.content);
    const id = final?.track_id;
    if (id && seen.has(id) && TRACK_BY_ID[id]) {
      const t = TRACK_BY_ID[id];
      trace.push({ kind: 'pick', id });
      return { status: 'ok', track: { id: t.id, title: t.title, artist: t.artist, genre: t.genre }, reason: String(final.reason || '').slice(0, 160), trace };
    }
    trace.push({ kind: 'none', note: id ? '검색 결과에 없던 곡이라 추천하지 않음' : (final ? '적합한 곡 없음' : '답 형식 오류') });
    return { status: 'none', reason: final?.reason ? String(final.reason).slice(0, 160) : '', trace };
  }
  trace.push({ kind: 'none', note: '대화 횟수 초과' });
  return { status: 'none', trace };
}
