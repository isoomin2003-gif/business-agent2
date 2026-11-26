// 나만의 주간신문: 한 주(일~토, 한국 시간) 동안 나눈 짧은 대화에서 관심사를 찾아 자료를 검색하고 기사 한 편
//
//  1) 계획: AI가 "어떤 말에서 관심사가 드러났나?"와 "그 말에서 찾아볼 구체적인 질문은?"에 답할 수 있으면 검색어를 정함
//           (검색어엔 주제에 필요한 일반 단어만 — 닉네임·대화 원문 제외). 답할 수 없으면 그 주는 건너뜀
//  2) 검색: 위키백과(한국어 → 영어) 검색 API로 문서를 찾고 원문(본문 앞부분)을 가져옴. 출처가 없으면 건너뜀
//  3) 작성: AI가 가져온 원문에서 확인한 내용만으로 짧은 기사를 씀 + 출처 링크 + '이번 주에 이 주제를 고른 이유' 한 줄
//  4) 발행: 다음 일요일 18:00(KST)부터 읽을 수 있음. 사용자·주차마다 한 줄(UNIQUE)이라 재접속·재시도로 두 번 생기지 않음.
//           서버가 쉬다 깨어나도 주기 작업과 '가판대를 열 때' 확인으로 빠진 호를 다시 만듦
import crypto from 'node:crypto';
import express from 'express';
import { getDb, nowIso } from './db.js';
import { requireUser, wrap } from './auth.js';
import { askJson, line } from './ai.js';
import { now, weekStartOf, issueDateOf, publishAtOf, weekEndOf } from './kst.js';

const WIKI = {
  ko: (process.env.WIKI_API_KO || 'https://ko.wikipedia.org/w/api.php'),
  en: (process.env.WIKI_API_EN || 'https://en.wikipedia.org/w/api.php'),
};
const WIKI_PAGE = { ko: 'https://ko.wikipedia.org/wiki/', en: 'https://en.wikipedia.org/wiki/' };
const UA = 'HaruHanjang/1.0 (personal diary class project; weekly newspaper)';

const PLAN_PROMPT = `[신문-계획] 너는 개인 주간신문의 편집자야. 아래는 사용자가 한 주 동안 일기 앱에서 AI와 짧게 나눈 대화야.
다음 두 가지에 답할 수 있는지 판단해:
 1) 사용자의 어떤 말에서 관심사가 드러났는가?
 2) 그 말에서 자료를 찾아볼 수 있는 구체적인 질문은 무엇인가? (예: "밤에 호수에 비친 불빛을 찍었는데 사진에서는 다 번졌어" → "밤에 찍은 호수 사진에서 불빛은 왜 번질까?")
- 대화가 한 번뿐이어도 두 질문에 답할 수 있으면 기사를 계획해. 관심사가 모호하면(예: "그냥 산책했어") 건너뛰어.
- 검색어는 주제에 필요한 일반 단어만(사람 이름·닉네임·사용자 문장을 그대로 쓰지 마), 백과사전 문서 제목처럼 짧게.
- 마지막 답은 JSON 하나만:
  {"skip":false,"evidence":"관심사가 드러난 사용자의 말을 짧게 요약(25자 이내)","question":"기사로 답할 질문","queries_ko":["한국어 검색어","한국어 검색어"],"query_en":"English search term"}
  또는 {"skip":true,"reason":"건너뛰는 이유"}`;

const WRITE_PROMPT = `[신문-기사] 너는 개인 주간신문의 기자야. 아래 '출처 원문'에서 확인한 내용만으로 질문에 답하는 짧은 기사를 써.
- 출처 원문에 없는 사실, 숫자, 인물은 쓰지 마. 확실하지 않으면 쓰지 마.
- 쉽고 따뜻한 한국어. 본문은 3~4문단, 모두 합쳐 550자 이내. 문단 사이는 빈 줄.
- 제목은 25자 이내.
- reason: 사용자가 했던 말이 이 기사로 이어졌다는 걸 알아볼 수 있게 한 줄(60자 이내). 예) "지난주 호숫가 야경 사진이 번졌다는 이야기에서 시작했어요." 사용자 문장을 길게 그대로 옮기지 마.
- used: 실제로 참고한 출처 번호 목록.
- 마지막 답은 JSON 하나만: {"title":"...","body":"...","reason":"...","used":[1,2]}`;

/** 위키백과 검색 → 원문(본문 앞부분) 확인. [{ title, url, text }] */
async function wikiSearch(lang, query, limit = 2) {
  const call = async (params) => {
    const url = `${WIKI[lang]}?${new URLSearchParams({ format: 'json', formatversion: '2', origin: '*', ...params })}`;
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 10000);
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA }, signal: ctrl.signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } finally { clearTimeout(timer); }
  };
  const found = await call({ action: 'query', list: 'search', srsearch: query, srlimit: String(limit), srnamespace: '0' });
  const titles = (found?.query?.search || []).map((s) => s.title).slice(0, limit);
  if (!titles.length) return [];
  const pages = await call({ action: 'query', prop: 'extracts', explaintext: '1', exchars: '1800', redirects: '1', titles: titles.join('|') });
  return (pages?.query?.pages || []).filter((p) => p.extract && p.extract.length > 120)
    .map((p) => ({ title: p.title, url: WIKI_PAGE[lang] + encodeURIComponent(p.title.replace(/ /g, '_')), text: p.extract.replace(/\s+/g, ' ').slice(0, 1800) }));
}

/** 사용자 대화 원문이 검색어에 그대로 들어가지 않게 (8자 이상 겹치면 버림) */
function cleanQuery(q, answers, nickname) {
  const s = line(q, 40).replace(/["'“”‘’]/g, '');
  if (!s) return null;
  if (nickname && s.includes(nickname)) return null;
  const flat = answers.join(' ');
  if (s.length >= 8 && flat.includes(s)) return null;
  return s;
}

/** 한 사람의 한 주 기사 만들기 → 'published' | 'skipped' 줄을 저장 (AI·검색 연결 실패는 저장하지 않고 다음에 다시) */
async function buildIssue(user, weekStart) {
  const db = getDb();
  const turns = await db.all("SELECT question, answer FROM chat_turns WHERE user_id = ? AND week_start = ? AND status = 'answered' ORDER BY day, seq", [user.id, weekStart]);
  const save = (fields) => db.run(`INSERT INTO newspapers (id, user_id, week_start, issue_date, publish_at, status, skip_reason, title, body, reason, question, sources, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`, [crypto.randomUUID(), user.id, weekStart, issueDateOf(weekStart), new Date(publishAtOf(weekStart)).toISOString(),
    fields.status, fields.skip_reason || null, fields.title || null, fields.body || null, fields.reason || null, fields.question || null, fields.sources ? JSON.stringify(fields.sources) : null, nowIso()]);
  if (!turns.length) { await save({ status: 'skipped', skip_reason: 'no_conversation' }); return 'skipped'; }
  // 1) 계획 (대화의 질문과 답만 보냄 — 닉네임·계정 정보 없음)
  const convo = turns.map((t) => `질문: ${t.question}\n답: ${t.answer}`).join('\n');
  const plan = await askJson(PLAN_PROMPT, `이번 주 대화:\n${convo}`, { maxTokens: 400, temperature: 0.3, title: 'Haru Hanjang Newspaper' });
  if (!plan.ok) return 'retry';
  if (plan.json.skip || !plan.json.question) { await save({ status: 'skipped', skip_reason: `vague: ${line(plan.json.reason, 80)}` }); return 'skipped'; }
  const answers = turns.map((t) => t.answer);
  const queries = [
    ...(Array.isArray(plan.json.queries_ko) ? plan.json.queries_ko : []).map((q) => ['ko', cleanQuery(q, answers, user.nickname)]),
    ['en', cleanQuery(plan.json.query_en, answers, user.nickname)],
  ].filter(([, q]) => q).slice(0, 3);
  // 2) 검색 (검색어만 외부로)
  const sources = [];
  try {
    for (const [lang, q] of queries) {
      for (const s of await wikiSearch(lang, q)) if (!sources.some((x) => x.url === s.url) && sources.length < 4) sources.push(s);
    }
  } catch (e) { console.warn('[news] search failed:', e.message); return 'retry'; }
  if (!sources.length) { await save({ status: 'skipped', skip_reason: 'no_sources' }); return 'skipped'; }
  // 3) 작성: 원문에서 확인한 내용만
  const srcText = sources.map((s, i) => `[${i + 1}] ${s.title} (${s.url})\n원문: ${s.text}`).join('\n\n');
  const art = await askJson(WRITE_PROMPT, `질문: ${line(plan.json.question, 100)}\n관심사가 드러난 말(요약): ${line(plan.json.evidence, 60)}\n\n출처 원문:\n${srcText}`, { maxTokens: 1200, temperature: 0.4, timeoutMs: 40000, title: 'Haru Hanjang Newspaper' });
  if (!art.ok) return 'retry';
  const used = (Array.isArray(art.json.used) ? art.json.used : []).map(Number).filter((n) => n >= 1 && n <= sources.length);
  const title = line(art.json.title, 60), body = String(art.json.body || '').trim().slice(0, 1400), reason = line(art.json.reason, 120);
  if (!title || !body || !used.length) { await save({ status: 'skipped', skip_reason: 'no_grounded_article' }); return 'skipped'; }
  await save({ status: 'published', title, body, reason, question: line(plan.json.question, 100), sources: [...new Set(used)].map((n) => ({ title: sources[n - 1].title, url: sources[n - 1].url })) });
  return 'published';
}

/** 아직 기사를 만들지 않은 지난 주들 (주가 끝난 뒤, 대화가 있는 주) */
async function pendingWeeks(userId = null, limit = 20) {
  const t = now();
  const current = weekStartOf(t);
  const rows = await getDb().all(`SELECT DISTINCT c.user_id, c.week_start FROM chat_turns c
    WHERE c.status = 'answered' AND c.week_start < ? ${userId ? 'AND c.user_id = ?' : ''}
      AND NOT EXISTS (SELECT 1 FROM newspapers n WHERE n.user_id = c.user_id AND n.week_start = c.week_start)
    ORDER BY c.week_start LIMIT ${limit}`, userId ? [current, userId] : [current]);
  return rows.filter((r) => weekEndOf(r.week_start) <= t);
}

const running = new Map(); // `${user}:${week}` → 진행 중 작업 (같은 호를 동시에 두 번 만들지 않음)
async function ensure(userId, weekStart) {
  const key = `${userId}:${weekStart}`;
  if (running.has(key)) return running.get(key);
  const job = (async () => {
    const user = await getDb().get('SELECT id, nickname FROM users WHERE id = ?', [userId]);
    if (!user) return 'skipped';
    return buildIssue(user, weekStart);
  })().catch((e) => { console.error('[news] build failed:', e.message); return 'retry'; }).finally(() => running.delete(key));
  running.set(key, job);
  return job;
}

/** 빠진 호 만들기 (한 사람 또는 전체) */
export async function catchUp(userId = null) {
  const out = [];
  for (const r of await pendingWeeks(userId)) out.push([r.week_start, await ensure(r.user_id, r.week_start)]);
  return out;
}

/** 서버가 켜져 있는 동안 주기적으로 (잠들었다 깨어나도 첫 주기에 밀린 호를 만듦) */
export function startNewsScheduler(intervalMs = 10 * 60_000) {
  const tick = () => catchUp().catch((e) => console.error('[news] catch-up failed:', e.message));
  setTimeout(tick, 15_000).unref?.();
  setInterval(tick, intervalMs).unref?.();
}

const articleJson = (r) => {
  const [y, m] = r.issue_date.split('-').map(Number);
  return { id: r.id, issueDate: r.issue_date, year: y, month: m, weekStart: r.week_start, title: r.title, body: r.body, reason: r.reason, question: r.question, sources: JSON.parse(r.sources || '[]') };
};

export const newsRouter = express.Router();
newsRouter.use('/news', requireUser);

// 가판대: 발행 시각이 지난 내 기사만 (월별 12칸 — 연도와 상관없이 발행일의 달에 쌓임, 최신순)
newsRouter.get('/news', wrap(async (req, res) => {
  // 들어올 때마다 이 사람의 빠진 호를 확인 (오래 걸리면 기다리지 않고 '인쇄 중'으로 알림)
  const job = catchUp(req.user.id);
  const done = await Promise.race([job.then(() => true), new Promise((r) => setTimeout(() => r(false), Number(req.query.wait ?? 12000)))]);
  const rows = await getDb().all("SELECT * FROM newspapers WHERE user_id = ? AND status = 'published' AND publish_at <= ? ORDER BY issue_date DESC", [req.user.id, new Date(now()).toISOString()]);
  const months = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, []]));
  for (const r of rows) { const a = articleJson(r); months[a.month].push(a); }
  // 발행 시각이 지났는데 아직 만드는 중인 호가 있으면 알려 줌
  const waiting = !done || (await pendingWeeks(req.user.id, 5)).some((w) => publishAtOf(w.week_start) <= now());
  res.json({ months, total: rows.length, printing: waiting });
}));
