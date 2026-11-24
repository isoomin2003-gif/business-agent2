import express from 'express';
import { getDb } from './db.js';
import { requireUser, wrap } from './auth.js';
import { retrieve, generateAnswer, buildPayload, exampleRecords } from './rag.js';

export const memoryRouter = express.Router();
memoryRouter.use('/memory', requireUser);

const hits = new Map(); // 사용자별 간단한 속도 제한 (분당 12회)
function rateLimited(userId) {
  const now = Date.now();
  const arr = (hits.get(userId) || []).filter((t) => now - t < 60000);
  arr.push(now);
  hits.set(userId, arr);
  return arr.length > 12;
}

memoryRouter.get('/memory/examples', (req, res) => {
  res.json({ records: exampleRecords(String(req.query.today || '')) });
});

memoryRouter.post('/memory/search', express.json(), wrap(async (req, res) => {
  const question = String(req.body?.question ?? '').trim().slice(0, 120);
  const mode = req.body?.mode === 'example' ? 'example' : 'mine';
  const today = String(req.body?.today ?? '');
  if (!question) return res.status(400).json({ error: 'empty', message: '질문을 입력해 주세요.' });
  if (rateLimited(req.user.id)) return res.status(429).json({ error: 'rate', message: '잠시 후 다시 물어봐 주세요.' });

  // 1) Retrieval — 현재 사용자의 기록(또는 분리된 예시 기록)만 서버 안에서 검색
  const docs = mode === 'example'
    ? exampleRecords(today)
    : (await getDb().all('SELECT id, entry_date AS date, sentence, video_id FROM diary_entries WHERE user_id = ?', [req.user.id]))
      .map((r) => ({ id: r.id, date: r.date, sentence: r.sentence, videoUrl: `/api/videos/${r.video_id}` }));
  const r = retrieve(question, docs, today);
  const sources = r.results.map((d) => ({ id: d.id, date: d.date, sentence: d.sentence, score: d.score, example: !!d.example }));
  const base = { mode, question, range: r.range, retrieval: { method: 'date-filter + Korean char n-gram BM25', terms: r.terms.map((t) => t.token), reason: r.reason }, sources };

  if (sources.length === 0) {
    const message = r.reason === 'no_records' ? '아직 검색할 기록이 없어요. 책상에서 오늘의 한 장을 먼저 남겨 보세요.'
      : r.reason === 'empty_range' ? `${r.range.label}에는 남긴 기록이 없어요.`
        : '관련 기록을 찾지 못했어요. 다른 단어로 물어봐 주세요.';
    return res.json({ ...base, status: 'no_results', message, sentToAi: null });
  }

  // 2) Augmentation + 3) Generation — 질문과 검색된 일기의 날짜·문장만 OpenRouter로 전송
  const payload = buildPayload(question, sources, today);
  const gen = await generateAnswer(question, sources, today);
  res.json({ ...base, ...gen, sentToAi: { model: payload.model, question, records: sources.map((s) => ({ date: s.date, sentence: s.sentence })) } });
}));
