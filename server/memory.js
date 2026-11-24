import express from 'express';
import { getDb } from './db.js';
import { requireUser, wrap } from './auth.js';
import { memorySearch, exampleRecords } from './rag.js';

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

  // 검색은 이 사용자의 기록(또는 개인 기록과 분리된 예시 기록) 안에서만 서버가 수행하고,
  // OpenRouter에는 질문과 검색된 일기의 날짜·문장만 보냅니다 (rag.js memorySearch 참고)
  const docs = mode === 'example'
    ? exampleRecords(today)
    : (await getDb().all('SELECT id, entry_date AS date, sentence FROM diary_entries WHERE user_id = ?', [req.user.id]));
  const result = await memorySearch({ question, docs, today });
  res.json({ mode, question, ...result });
}));
