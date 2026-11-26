// 다이어리를 쓰기 전 AI와 나누는 짧은 대화
// - 한 주(한국 시간 일요일~토요일)의 첫 대화에서 AI가 새 주제와 첫 질문을 정함. 최근 몇 주의 주제·질문과 겹치지 않게
// - 그 주의 다음 대화부터는 사용자가 실제로 한 말에서 이어지는 질문 (관심사가 모호하면 무엇이 눈에 들어왔는지)
// - 하루 질문은 기본 1개, 사용자가 '조금 더 얘기하기'를 누를 때만 2개째. 같은 날 다시 와도 상태가 그대로
// - AI 응답이 늦거나 실패해도 일기는 바로 쓸 수 있음 (질문 없이 'unavailable')
import crypto from 'node:crypto';
import express from 'express';
import { getDb, nowIso } from './db.js';
import { requireUser, wrap } from './auth.js';
import { askJson, line } from './ai.js';
import { now, kstDate, weekStartOf, addDays } from './kst.js';

export const MAX_DAILY_QUESTIONS = 2;
export const ANSWER_MAX = 300;

const FIRST_PROMPT = `[대화-첫질문] 너는 '하루 한 장' 다이어리 앱에서 일기를 쓰기 전에 사용자와 짧게 이야기하는 다정한 친구야.
이번 주에 이야기할 새 주제 하나와 첫 질문을 정해.
- 아래 '최근 주제와 질문'과 비슷한 주제는 피해서 새로운 쪽으로 골라.
- 주제는 사용자의 관심사가 드러나기 쉬운 일상 소재로 (예: 요즘 자주 듣는 소리나 노래, 손으로 만들어 본 것, 길에서 본 풍경, 먹고 싶은 것, 배우고 싶은 것, 하늘과 날씨, 찍어 둔 사진, 좋아하는 장소 등).
- 인사는 짧은 한 문장(30자 이내). 질문은 하나만 묻는 한 문장(45자 이내), 답하기 쉽고 구체적으로.
- "오늘 하루는 어땠어?" 같은 막연한 질문은 하지 마.
- 마지막 답은 JSON 하나만: {"topic":"짧은 주제(12자 이내)","greeting":"인사","question":"질문"}`;

const FOLLOW_PROMPT = `[대화-이어가기] 너는 '하루 한 장' 다이어리 앱에서 일기를 쓰기 전에 사용자와 짧게 이야기하는 다정한 친구야.
이번 주 주제와 지금까지 나눈 대화를 보고 다음 질문 하나를 만들어.
- 사용자가 실제로 한 말 속 구체적인 것(사람, 물건, 장소, 노래, 장면, 느낌)을 짚어, 그와 이어지는 기억이나 이유, 궁금한 점을 물어.
- 사용자의 답이 아직 모호하면(예: "그냥 산책했어") 그때 무엇이 눈에 들어왔는지 자연스럽게 물어.
- 이미 한 질문을 되풀이하지 마. 질문은 하나만 묻는 한 문장(45자 이내).
- 인사는 짧은 한 문장(30자 이내). 같은 날 두 번째 질문이면 인사는 빈 문자열.
- 마지막 답은 JSON 하나만: {"greeting":"인사 또는 빈 문자열","question":"질문"}`;

const rowsOfDay = (userId, day) => getDb().all('SELECT * FROM chat_turns WHERE user_id = ? AND day = ? ORDER BY seq', [userId, day]);
const turnJson = (t) => ({ seq: Number(t.seq), greeting: t.greeting || '', question: t.question, answer: t.answer || null, status: t.status });

/** 오늘 대화 상태: ask(질문에 답할 차례) | answered(1개 답함, 더 얘기할 수 있음) | done(오늘 대화 끝) */
function stateOf(turns) {
  if (!turns.length) return 'none';
  const last = turns[turns.length - 1];
  if (turns.some((t) => t.status === 'skipped')) return 'done';
  if (last.status === 'asked') return 'ask';
  if (Number(last.seq) >= MAX_DAILY_QUESTIONS) return 'done';
  return 'answered';
}
const view = (turns, extra = {}) => ({ status: stateOf(turns), turns: turns.map(turnJson), maxQuestions: MAX_DAILY_QUESTIONS, ...extra });

/** 이번 주 대화 기록 (질문·답) */
async function weekTurns(userId, weekStart) {
  return getDb().all("SELECT * FROM chat_turns WHERE user_id = ? AND week_start = ? AND status != 'skipped' ORDER BY day, seq", [userId, weekStart]);
}

/** AI에게 질문 하나를 받아 저장 (같은 사람의 동시 요청은 한 번만) */
const making = new Map();
async function makeQuestion(user, day, weekStart, seq) {
  const key = `${user.id}:${day}:${seq}`;
  if (making.has(key)) return making.get(key);
  const job = (async () => {
    const db = getDb();
    const existing = await db.get('SELECT * FROM chat_turns WHERE user_id = ? AND day = ? AND seq = ?', [user.id, day, seq]);
    if (existing) return { ok: true };
    const history = await weekTurns(user.id, weekStart);
    const week = await db.get('SELECT topic FROM chat_weeks WHERE user_id = ? AND week_start = ?', [user.id, weekStart]);
    let r, topic = week?.topic || null;
    if (!week && !history.length) {
      // 이번 주 첫 대화: 최근 6주의 주제와 첫 질문을 참고해 새 주제 (닉네임·계정 정보는 보내지 않음)
      const recent = await db.all(`SELECT w.week_start, w.topic, (SELECT question FROM chat_turns t WHERE t.user_id = w.user_id AND t.week_start = w.week_start ORDER BY day, seq LIMIT 1) AS q
        FROM chat_weeks w WHERE w.user_id = ? AND w.week_start >= ? ORDER BY w.week_start DESC`, [user.id, addDays(weekStart, -42)]);
      const list = recent.length ? recent.map((w) => `- ${w.topic}: ${w.q || ''}`).join('\n') : '(없음)';
      r = await askJson(FIRST_PROMPT, `최근 주제와 질문:\n${list}\n\n오늘: ${day}`, { maxTokens: 1200, temperature: 0.9, timeoutMs: 20000 });
      if (r.ok) topic = line(r.json.topic, 30) || '이번 주 이야기';
    } else {
      const convo = history.map((t) => `질문: ${t.question}\n답: ${t.answer || '(아직 답하지 않음)'}`).join('\n');
      r = await askJson(FOLLOW_PROMPT, `이번 주 주제: ${topic || '(없음)'}\n같은 날 ${seq}번째 질문\n\n이번 주 대화:\n${convo || '(없음)'}`, { maxTokens: 1200, temperature: 0.8, timeoutMs: 20000 });
    }
    if (!r.ok) return { ok: false, status: r.status };
    const question = line(r.json.question, 120);
    if (!question) return { ok: false, status: 'bad_json' };
    const greeting = seq === 1 ? line(r.json.greeting, 80) : '';
    if (topic && !week) await db.run('INSERT INTO chat_weeks (user_id, week_start, topic, created_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING', [user.id, weekStart, topic, nowIso()]);
    await db.run(`INSERT INTO chat_turns (id, user_id, week_start, day, seq, greeting, question, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'asked', ?) ON CONFLICT DO NOTHING`, [crypto.randomUUID(), user.id, weekStart, day, seq, greeting, question, nowIso()]);
    return { ok: true };
  })().finally(() => making.delete(key));
  making.set(key, job);
  return job;
}

export const chatRouter = express.Router();
chatRouter.use('/chat', requireUser, express.json());

// 책상을 눌렀을 때: 오늘 대화 상태 (처음이면 질문을 만듦)
chatRouter.get('/chat/today', wrap(async (req, res) => {
  const t = now(), day = kstDate(t), weekStart = weekStartOf(t);
  let turns = await rowsOfDay(req.user.id, day);
  if (!turns.length) {
    const r = await makeQuestion(req.user, day, weekStart, 1);
    if (!r.ok) return res.json({ status: 'unavailable', reason: r.status, turns: [], day });
    turns = await rowsOfDay(req.user.id, day);
  }
  res.json({ ...view(turns), day, weekStart });
}));

chatRouter.post('/chat/answer', wrap(async (req, res) => {
  const day = kstDate();
  const text = String(req.body?.text ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return res.status(400).json({ message: '한마디만 적어 주세요.' });
  if ([...text].length > ANSWER_MAX) return res.status(400).json({ message: `${ANSWER_MAX}자까지 적을 수 있어요.` });
  const turns = await rowsOfDay(req.user.id, day);
  const asked = turns.find((x) => x.status === 'asked');
  if (!asked) return res.status(409).json({ message: '지금 답할 질문이 없어요.', ...view(turns) });
  await getDb().run("UPDATE chat_turns SET answer = ?, status = 'answered', answered_at = ? WHERE id = ? AND status = 'asked'", [text, nowIso(), asked.id]);
  res.json(view(await rowsOfDay(req.user.id, day)));
}));

// '조금 더 얘기하기': 오늘 첫 질문에 답한 뒤에만, 하루 최대 2개
chatRouter.post('/chat/more', wrap(async (req, res) => {
  const t = now(), day = kstDate(t), weekStart = weekStartOf(t);
  const turns = await rowsOfDay(req.user.id, day);
  if (stateOf(turns) !== 'answered') return res.status(409).json({ message: turns.length >= MAX_DAILY_QUESTIONS ? '오늘 질문은 여기까지예요. 다이어리를 써 볼까요?' : '먼저 지금 질문에 답해 주세요.', ...view(turns) });
  const r = await makeQuestion(req.user, day, weekStart, turns.length + 1);
  if (!r.ok) return res.json({ ...view(turns), status: 'unavailable', reason: r.status });
  res.json(view(await rowsOfDay(req.user.id, day)));
}));

// '오늘은 바로 쓰기': 답하지 않은 오늘 질문을 건너뜀 (다시 와도 바로 다이어리)
chatRouter.post('/chat/skip', wrap(async (req, res) => {
  const day = kstDate();
  await getDb().run("UPDATE chat_turns SET status = 'skipped' WHERE user_id = ? AND day = ? AND status = 'asked'", [req.user.id, day]);
  res.json(view(await rowsOfDay(req.user.id, day)));
}));
