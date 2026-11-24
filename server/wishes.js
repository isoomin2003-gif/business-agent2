import crypto from 'node:crypto';
import express from 'express';
import { openDb, nowIso } from './db.js';
import { requireUser } from './auth.js';
import { isUserIn, getStar, floatWish, notifyUser } from './realtime.js';

export const WISH_MAX = 80;
export const wishRouter = express.Router();
wishRouter.use(requireUser, express.json());

function wishJson(w, userId) {
  const db = openDb();
  const c = db.prepare('SELECT kind, COUNT(*) n, SUM(user_id = ?) mine FROM wish_reactions WHERE wish_id = ? GROUP BY kind').all(userId, w.id);
  const get = (k) => c.find((x) => x.kind === k) || { n: 0, mine: 0 };
  return {
    id: w.id, nickname: w.nickname, text: w.text, place: w.place, source: w.source, isPublic: !!w.is_public, onTree: !!w.on_tree,
    createdAt: w.created_at, isMine: w.user_id === userId,
    empathy: get('empathy').n, cheer: get('cheer').n, myEmpathy: !!get('empathy').mine, myCheer: !!get('cheer').mine,
  };
}

function cleanText(t) {
  const text = String(t ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return { error: '소원을 적어 주세요.' };
  if ([...text].length > WISH_MAX) return { error: `소원은 ${WISH_MAX}자까지 적을 수 있어요.` };
  return { text };
}

function insertWish(user, fields) {
  const id = crypto.randomUUID();
  openDb().prepare(`INSERT INTO wishes (id, user_id, nickname, place, source, star_id, text, is_public, on_tree, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, user.id, user.nickname, fields.place, fields.source, fields.starId || null,
    fields.text, fields.isPublic ? 1 : 0, fields.onTree ? 1 : 0, nowIso());
  return openDb().prepare('SELECT * FROM wishes WHERE id = ?').get(id);
}

// 소원 나무: 공개 소원 목록 (나무를 눌렀을 때만 불러옵니다)
wishRouter.get('/wishes/tree', (req, res) => {
  const rows = openDb().prepare('SELECT * FROM wishes WHERE on_tree = 1 AND is_public = 1 ORDER BY created_at DESC LIMIT 60').all();
  res.json({ wishes: rows.map((w) => wishJson(w, req.user.id)) });
});

wishRouter.post('/wishes/tree', (req, res) => {
  if (!isUserIn(req.user.id, 'park')) return res.status(400).json({ message: '소원 나무는 공원에 있어요.' });
  const { text, error } = cleanText(req.body?.text);
  if (error) return res.status(400).json({ message: error });
  const w = insertWish(req.user, { place: 'park', source: 'tree', text, isPublic: true, onTree: true });
  res.json({ wish: wishJson(w, req.user.id) });
});

// 별똥별 소원: 공개/비공개 선택, 공원에서는 소원 나무에도 걸 수 있음
wishRouter.post('/wishes/star', (req, res) => {
  const star = getStar(String(req.body?.starId ?? ''));
  if (!star || Date.now() - star.at > 3 * 60000) return res.status(400).json({ message: '별똥별이 이미 멀리 지나갔어요.' });
  if (!isUserIn(req.user.id, star.place)) return res.status(400).json({ message: '별똥별을 본 장소에 있어야 소원을 빌 수 있어요.' });
  const { text, error } = cleanText(req.body?.text);
  if (error) return res.status(400).json({ message: error });
  const isPublic = !!req.body?.isPublic;
  const onTree = star.place === 'park' && isPublic && !!req.body?.alsoTree;
  const w = insertWish(req.user, { place: star.place, source: 'star', starId: req.body.starId, text, isPublic, onTree });
  if (isPublic) floatWish(req.user.id, star.place, w.id);
  res.json({ wish: wishJson(w, req.user.id) });
});

wishRouter.get('/wishes/mine', (req, res) => {
  const rows = openDb().prepare('SELECT * FROM wishes WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.user.id);
  res.json({ wishes: rows.map((w) => wishJson(w, req.user.id)) });
});

wishRouter.get('/wishes/:id', (req, res) => {
  const w = openDb().prepare('SELECT * FROM wishes WHERE id = ?').get(String(req.params.id));
  if (!w || (!w.is_public && w.user_id !== req.user.id)) return res.status(404).json({ message: '볼 수 없는 소원이에요.' });
  res.json({ wish: wishJson(w, req.user.id) });
});

// 공감/응원 (토글). 비공개 소원과 자기 소원에는 보낼 수 없음
wishRouter.post('/wishes/:id/react', (req, res) => {
  const kind = req.body?.kind;
  if (!['empathy', 'cheer'].includes(kind)) return res.status(400).json({ message: '알 수 없는 반응이에요.' });
  const db = openDb();
  const w = db.prepare('SELECT * FROM wishes WHERE id = ?').get(String(req.params.id));
  if (!w || !w.is_public) return res.status(404).json({ message: '볼 수 없는 소원이에요.' });
  if (w.user_id === req.user.id) return res.status(400).json({ message: '내 소원에는 보낼 수 없어요.' });
  const had = db.prepare('SELECT 1 FROM wish_reactions WHERE wish_id = ? AND user_id = ? AND kind = ?').get(w.id, req.user.id, kind);
  if (had) db.prepare('DELETE FROM wish_reactions WHERE wish_id = ? AND user_id = ? AND kind = ?').run(w.id, req.user.id, kind);
  else {
    db.prepare('INSERT INTO wish_reactions (wish_id, user_id, kind, created_at) VALUES (?, ?, ?, ?)').run(w.id, req.user.id, kind, nowIso());
    notifyUser(w.user_id, 'wish:reaction', { wishId: w.id, kind, text: w.text });
  }
  res.json({ wish: wishJson(w, req.user.id) });
});
