// '새 노래 추천받기' — 라디오에 없는 곡을 외부 음악 목록(Openverse)에서 찾아 AI가 3곡을 고름
//
//  1) AI(OpenRouter 도구 호출)가 요청을 영어 검색어로 바꿔 search_music 도구를 호출
//  2) 서버가 Openverse 음원 검색 API로 실제 곡을 찾음
//     - 라이선스: 공개 웹 라디오에서 조건 없이(또는 저작자 표시만으로) 재생할 수 있는 CC0·PDM·CC BY·CC BY-SA만 (NC·ND 제외)
//     - 45초~8분, https 오디오 파일만, 이미 라디오에 있거나 재생·대기 중이거나 이번에 보여 준 곡은 제외
//  3) AI가 후보의 장르·태그(악기·분위기)를 보고 서로 다른 곡 최대 3개를 고르고 이유 한 줄을 씀
//     - 고른 id가 후보에 없으면 버림(곡명·주소를 지어낼 수 없음). 후보가 없으면 검색어를 바꿔 1회 더
//  4) 고른 곡의 오디오 주소를 실제로 요청해(앞부분 범위 요청) 재생 가능한 곡만 돌려줌
import { config } from './config.js';
import { TRACKS } from './tracks.js';

const OPENVERSE = (process.env.OPENVERSE_BASE_URL || 'https://api.openverse.org/v1').replace(/\/$/, '');
const OPENVERSE_TOKEN = process.env.OPENVERSE_TOKEN || '';
export const LICENSES = ['cc0', 'pdm', 'by', 'by-sa'];
export const MAX_PICKS = 3;
const MAX_SEARCHES = 2;
const MIN_MS = 45_000, MAX_MS = 480_000;

// Openverse 제목·이름은 HTML 엔티티로 이스케이프되어 오는 경우가 있어 원래 글자로 되돌림
const decode = (s) => String(s || '').replace(/&(amp|lt|gt|quot|#39|apos);/g, (m, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'" }[e])).trim();
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
const BASE_KEYS = new Set(TRACKS.map((t) => `${norm(t.title)}|${norm(t.artist)}`));

/** Openverse 결과 1건 → 후보 곡 (조건에 안 맞으면 null) */
function toCandidate(r) {
  if (!LICENSES.includes(r.license)) return null;
  if (!r.url || !(/^https:\/\//.test(r.url) || /^http:\/\/127\.0\.0\.1:/.test(r.url)) || !r.duration || r.duration < MIN_MS || r.duration > MAX_MS) return null;
  if (BASE_KEYS.has(`${norm(r.title)}|${norm(r.creator)}`)) return null; // 기본 수록곡과 같은 곡
  return {
    id: `ov:${r.id}`, source: r.source || r.provider, title: decode(r.title), artist: decode(r.creator) || '(작자 미상)',
    audioUrl: r.url, sourceUrl: r.foreign_landing_url || '', license: r.license, licenseVersion: r.license_version || '',
    licenseUrl: r.license_url || '', attribution: decode(r.attribution), durationMs: r.duration,
    genres: (r.genres || []).slice(0, 4), tags: (r.tags || []).map((t) => t.name).filter(Boolean).slice(0, 10),
  };
}

/** 도구 실행: Openverse 음원 검색 */
const cache = new Map(); // 검색어 → { at, results } (10분) — 익명 이용 한도(분당 20회)를 아끼기 위해
async function openverseQuery(q) {
  const hit = cache.get(q);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.results;
  const url = `${OPENVERSE}/audio/?${new URLSearchParams({ q: q.slice(0, 80), category: 'music', license: LICENSES.join(','), page_size: '20', mature: 'false' })}`;
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'HaruHanjang/1.0 (class project radio)', ...(OPENVERSE_TOKEN ? { Authorization: `Bearer ${OPENVERSE_TOKEN}` } : {}) } });
  if (res.status === 429) throw Object.assign(new Error('음악 검색 요청이 너무 많아요.'), { code: 'rate' });
  if (!res.ok) throw Object.assign(new Error(`음악 검색 실패 (HTTP ${res.status})`), { code: 'search' });
  const results = (await res.json()).results || [];
  cache.set(q, { at: Date.now(), results });
  return results;
}

/**
 * 도구 실행: Openverse 음원 검색. queries: 1~2낱말짜리 짧은 검색어 최대 3개
 * (Openverse는 검색어의 모든 낱말이 맞아야 해서 긴 검색어는 결과가 거의 없음 → 짧은 검색어 여러 개를 합침)
 * 결과가 적으면 마지막 검색어의 낱말 하나씩으로 넓히고, 요청 낱말이 장르·태그·제목에 많이 든 곡부터 정렬.
 */
export async function searchMusic(queries, exclude) {
  const list = (Array.isArray(queries) ? queries : [queries]).map((q) => String(q || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const words = [...new Set(list.join(' ').split(' ').filter((w) => w.length > 1))];
  const plans = [...new Set([...list.slice(0, 3), ...(list.at(-1) || '').split(' ').filter((w) => w.length > 2)])];
  const seenKey = new Set(), out = new Map();
  let calls = 0;
  for (const q of plans) {
    if (calls >= 4 || (calls >= Math.min(3, list.length) && out.size >= 8)) break;
    calls++;
    for (const r of await openverseQuery(q)) {
      const c = toCandidate(r);
      if (!c || exclude.has(c.id) || out.has(c.id)) continue;
      const k = `${norm(c.title)}|${norm(c.artist)}`;
      if (seenKey.has(k)) continue; // 같은 곡의 중복 항목
      seenKey.add(k);
      const hay = `${c.title} ${c.genres.join(' ')} ${c.tags.join(' ')}`.toLowerCase();
      out.set(c.id, { ...c, _score: words.filter((w) => hay.includes(w)).length });
    }
  }
  return [...out.values()].sort((a, b) => b._score - a._score).slice(0, 15).map(({ _score, ...c }) => c);
}

/** 오디오 주소를 실제로 요청해 재생 가능한지 확인 (앞부분 2KB 범위 요청) */
export async function isPlayable(audioUrl) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(audioUrl, { headers: { Range: 'bytes=0-2047' }, redirect: 'follow', signal: ctrl.signal });
    const type = res.headers.get('content-type') || '';
    await res.body?.cancel().catch(() => {});
    return (res.status === 206 || res.status === 200) && /audio|ogg|mpeg|octet-stream/.test(type);
  } catch { return false; } finally { clearTimeout(timer); }
}

export const SEARCH_TOOL = {
  type: 'function',
  function: {
    name: 'search_music',
    description: '공개 라이선스 음악 목록(Openverse)에서 곡을 검색한다. 결과에는 곡 id, 제목, 아티스트, 길이, 장르, 태그(악기·분위기·빠르기)가 있다.',
    parameters: { type: 'object', properties: { queries: { type: 'array', items: { type: 'string' }, maxItems: 3, description: '영어로 된 1~2낱말짜리 짧은 검색어 2~3개 (예: ["rain guitar", "acoustic guitar", "calm guitar"])' } }, required: ['queries'] },
  },
};

export const PROMPT = `너는 '하루 한 장' 옥상 라디오의 음악 추천 도우미야. 사용자가 원하는 분위기를 듣고, 라디오에 아직 없는 공개 라이선스 곡을 최대 ${MAX_PICKS}곡 골라.
- 먼저 요청을 영어로 된 짧은 검색어 2~3개(각 1~2낱말, 악기·장르·분위기 중심)로 바꿔 search_music 도구를 호출해. 이 검색은 검색어의 모든 낱말이 맞아야 하니 길게 쓰지 마.
- 결과가 없거나 어울리는 곡이 부족하면, 요청의 핵심(예: 기타, 잔잔함)은 지키면서 다른 짧은 검색어로 한 번만 더 검색해. 검색은 최대 ${MAX_SEARCHES}번.
- 검색 결과의 장르·태그(악기·분위기·빠르기)를 보고 요청에 가장 가까운 서로 다른 곡을 골라. 완벽히 맞지 않아도 핵심(악기나 분위기)이 맞으면 골라도 돼. 같은 아티스트의 비슷한 곡을 여러 개 고르지 마.
- 태그에 vocal, male, female이 있으면 노래가 있는 곡이야. 요청이 연주곡이면 instrumental 태그가 있는 곡을 우선해.
- 반드시 검색 결과에 있는 id만 써. 곡명이나 주소를 지어내지 마. 어울리는 곡이 3개보다 적으면 찾은 만큼만 골라.
- 너는 곡을 들을 수 없어. 추천 이유는 검색 결과에 적힌 장르·태그만 근거로 한국어 한 줄로 써.
- 마지막 답은 JSON 하나만: {"picks":[{"id":"ov:...","reason":"한 줄"}]} (없으면 {"picks":[]})`;

async function chat(messages) {
  if (!config.openrouter.apiKey) return { ok: false, status: 'no_key' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.openrouter.timeoutMs);
  try {
    const res = await fetch(`${config.openrouter.baseUrl}/chat/completions`, {
      method: 'POST', signal: ctrl.signal,
      headers: { Authorization: `Bearer ${config.openrouter.apiKey}`, 'Content-Type': 'application/json', ...(config.publicUrl ? { 'HTTP-Referer': config.publicUrl } : {}), 'X-Title': 'Haru Hanjang Radio' },
      body: JSON.stringify({ model: config.openrouter.model, temperature: 0.4, max_tokens: 600, messages, tools: [SEARCH_TOOL], tool_choice: 'auto' }),
    });
    if (!res.ok) { console.warn(`[discover] OpenRouter HTTP ${res.status}`); return { ok: false, status: 'api_error', code: res.status }; }
    const data = await res.json();
    return { ok: true, message: data?.choices?.[0]?.message || {} };
  } catch (e) {
    console.warn(`[discover] OpenRouter error: ${e.message}`);
    return { ok: false, status: 'api_error' };
  } finally { clearTimeout(timer); }
}

const brief = (c) => ({ id: c.id, title: c.title, artist: c.artist, seconds: Math.round(c.durationMs / 1000), genres: c.genres, tags: c.tags });

/**
 * 요청 → { status: 'ok'|'none'|'no_key'|'api_error'|'search_error', picks: [{...곡, reason}], trace }
 * exclude: 제외할 곡 id 집합 (라디오에 추가된 곡·재생/대기 중·이번 세션에서 이미 보여 준 곡)
 */
export async function discover(text, exclude) {
  const trace = [];
  const pool = new Map(); // 실제 검색 결과로 받은 후보만
  let searches = 0;
  const messages = [{ role: 'system', content: PROMPT }, { role: 'user', content: String(text).slice(0, 200) }];
  for (let turn = 0; turn < 5; turn++) {
    const r = await chat(messages);
    if (!r.ok) { trace.push({ kind: 'error', status: r.status }); return { status: r.status, picks: [], trace }; }
    const msg = r.message;
    const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
    if (calls.length) {
      messages.push({ role: 'assistant', content: msg.content || '', tool_calls: calls });
      for (const call of calls) {
        let args = {};
        try { args = JSON.parse(call.function?.arguments || '{}'); } catch { /* */ }
        let result;
        if (call.function?.name !== 'search_music') result = { error: '알 수 없는 도구' };
        else if (searches >= MAX_SEARCHES) result = { error: `검색은 ${MAX_SEARCHES}번까지예요. 지금까지의 결과에서 고르세요.` };
        else {
          searches++;
          try {
            const queries = Array.isArray(args.queries) ? args.queries : [args.query || text];
            const found = await searchMusic(queries, exclude);
            found.forEach((c) => pool.set(c.id, c));
            trace.push({ kind: 'search', round: searches, query: queries.join(' / '), found: found.length });
            result = { count: found.length, results: found.map(brief) };
          } catch (e) {
            trace.push({ kind: 'search_error', round: searches, query: (args.queries || [args.query]).join(' / '), note: e.message });
            if (!pool.size) return { status: 'search_error', picks: [], trace };
            result = { error: e.message };
          }
        }
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      }
      continue;
    }
    trace.push({ kind: 'raw', content: String(msg.content || '').slice(0, 800) }); // TEMP-DIAG
    // 최종 선택: 후보에 있는 서로 다른 곡만, 실제 재생 확인을 통과한 곡만
    let picks = [];
    try { picks = JSON.parse(String(msg.content || '').match(/\{[\s\S]*\}/)?.[0] || '{}').picks || []; } catch { picks = []; }
    const chosen = [];
    for (const p of picks) {
      const c = pool.get(p?.id);
      if (!c || chosen.some((x) => x.id === c.id || norm(x.title) === norm(c.title))) continue;
      if (!(await isPlayable(c.audioUrl))) { trace.push({ kind: 'unplayable', id: c.id }); continue; }
      chosen.push({ ...c, reason: String(p.reason || '').slice(0, 120) });
      if (chosen.length >= MAX_PICKS) break;
    }
    trace.push({ kind: 'pick', ids: chosen.map((c) => c.id), dropped: picks.length - chosen.length });
    return { status: chosen.length ? 'ok' : 'none', picks: chosen, trace };
  }
  return { status: 'none', picks: [], trace };
}
