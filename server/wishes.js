import crypto from 'node:crypto';
import express from 'express';
import { getDb, nowIso } from './db.js';
import { requireUser, wrap } from './auth.js';
import { isUserIn, getStar, floatWish, unfloatWish, notifyUser } from './realtime.js';
import { WISH_TTL_DAYS, TREE_NOTES } from '../public/js/shared/limits.js';

// 소원 나무 규칙: 작성 후 7일 동안만 공개. 나뭇가지에는 그중 최근 25개만 쪽지로 (나머지는 '소원 모아보기'에서만)
const TTL_MS = WISH_TTL_DAYS * 24 * 3600_000;
const cutoff = () => new Date(Date.now() - TTL_MS).toISOString();
/** 소원 나무에 건 소원이 7일이 지나 내려갔는지 */
const expired = (w) => !!Number(w.on_tree) && w.created_at < cutoff();

export const WISH_MAX = 80;
export const wishRouter = express.Router();
wishRouter.use('/wishes', requireUser, express.json());

async function wishJson(w, userId) {
  const c = await getDb().all(`SELECT kind, COUNT(*) AS n, SUM(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS mine
    FROM wish_reactions WHERE wish_id = ? GROUP BY kind`, [userId, w.id]);
  const get = (k) => c.find((x) => x.kind === k) || { n: 0, mine: 0 };
  return {
    id: w.id, nickname: w.nickname, text: w.text, place: w.place, source: w.source, isPublic: !!Number(w.is_public), onTree: !!Number(w.on_tree),
    createdAt: w.created_at, isMine: w.user_id === userId,
    // 나무 소원: 내려가는 시각과 나무 쪽지 자리 번호
    ...(Number(w.on_tree) ? { expiresAt: new Date(Date.parse(w.created_at) + TTL_MS).toISOString(), expired: expired(w), treeSeq: Number(w.tree_seq) || 0 } : {}),
    empathy: Number(get('empathy').n), cheer: Number(get('cheer').n), myEmpathy: !!Number(get('empathy').mine), myCheer: !!Number(get('cheer').mine),
  };
}
const wishList = (rows, userId) => Promise.all(rows.map((w) => wishJson(w, userId)));

function cleanText(t) {
  const text = String(t ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return { error: '소원을 적어 주세요.' };
  if ([...text].length > WISH_MAX) return { error: `소원은 ${WISH_MAX}자까지 적을 수 있어요.` };
  return { text };
}

async function insertWish(user, fields) {
  const id = crypto.randomUUID();
  // 나무에 거는 소원은 건 순서 번호를 붙임 → 쪽지 자리 = (번호-1) % 25 (26번째는 가장 오래된 쪽지 자리에)
  const seq = fields.onTree ? Number((await getDb().get('SELECT MAX(tree_seq) AS n FROM wishes WHERE on_tree = 1'))?.n || 0) + 1 : null;
  await getDb().run(`INSERT INTO wishes (id, user_id, nickname, place, source, star_id, text, is_public, on_tree, tree_seq, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, user.id, user.nickname, fields.place, fields.source, fields.starId || null,
    fields.text, fields.isPublic ? 1 : 0, fields.onTree ? 1 : 0, seq, nowIso()]);
  return getDb().get('SELECT * FROM wishes WHERE id = ?', [id]);
}

// 소원 나무 쪽지: 아직 만료되지 않은 소원 중 최근 25개 (나무 그림·쪽지 자리용)
wishRouter.get('/wishes/tree', wrap(async (req, res) => {
  const db = getDb();
  const rows = await db.all(`SELECT * FROM wishes WHERE on_tree = 1 AND is_public = 1 AND created_at >= ? ORDER BY created_at DESC LIMIT ${TREE_NOTES}`, [cutoff()]);
  const total = Number((await db.get('SELECT COUNT(*) AS n FROM wishes WHERE on_tree = 1 AND is_public = 1 AND created_at >= ?', [cutoff()]))?.n || 0);
  res.json({ wishes: await wishList(rows, req.user.id), total, ttlDays: WISH_TTL_DAYS, max: TREE_NOTES });
}));

// 소원 모아보기: 나무에서 내려간 쪽지까지 포함해 최근 7일 동안의 소원 전체
wishRouter.get('/wishes/tree/all', wrap(async (req, res) => {
  const rows = await getDb().all('SELECT * FROM wishes WHERE on_tree = 1 AND is_public = 1 AND created_at >= ? ORDER BY created_at DESC LIMIT 500', [cutoff()]);
  const onTree = new Set(rows.slice(0, TREE_NOTES).map((w) => w.id));
  const list = await wishList(rows, req.user.id);
  res.json({ wishes: list.map((w) => ({ ...w, onBranch: onTree.has(w.id) })), ttlDays: WISH_TTL_DAYS, max: TREE_NOTES });
}));

wishRouter.post('/wishes/tree', wrap(async (req, res) => {
  if (!isUserIn(req.user.id, 'park')) return res.status(400).json({ message: '소원 나무는 공원에 있어요.' });
  const { text, error } = cleanText(req.body?.text);
  if (error) return res.status(400).json({ message: error });
  const w = await insertWish(req.user, { place: 'park', source: 'tree', text, isPublic: true, onTree: true });
  res.json({ wish: await wishJson(w, req.user.id) });
}));

// 별똥별 소원: 공개/비공개 선택, 공원에서는 소원 나무에도 걸 수 있음
wishRouter.post('/wishes/star', wrap(async (req, res) => {
  const star = getStar(String(req.body?.starId ?? ''));
  if (!star || Date.now() - star.at > 3 * 60000) return res.status(400).json({ message: '별똥별이 이미 멀리 지나갔어요.' });
  if (!isUserIn(req.user.id, star.place)) return res.status(400).json({ message: '별똥별을 본 장소에 있어야 소원을 빌 수 있어요.' });
  const { text, error } = cleanText(req.body?.text);
  if (error) return res.status(400).json({ message: error });
  const isPublic = !!req.body?.isPublic;
  const onTree = star.place === 'park' && isPublic && !!req.body?.alsoTree;
  const w = await insertWish(req.user, { place: star.place, source: 'star', starId: req.body.starId, text, isPublic, onTree });
  if (isPublic) floatWish(req.user.id, star.place, w.id);
  res.json({ wish: await wishJson(w, req.user.id) });
}));

wishRouter.get('/wishes/mine', wrap(async (req, res) => {
  const rows = await getDb().all('SELECT * FROM wishes WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', [req.user.id]);
  res.json({ wishes: await wishList(rows, req.user.id) });
}));

wishRouter.get('/wishes/:id', wrap(async (req, res) => {
  const w = await getDb().get('SELECT * FROM wishes WHERE id = ?', [String(req.params.id)]);
  if (!w || ((!Number(w.is_public) || expired(w)) && w.user_id !== req.user.id)) return res.status(404).json({ message: '볼 수 없는 소원이에요.' });
  res.json({ wish: await wishJson(w, req.user.id) });
}));

// 내 소원 삭제 (소원 나무·별똥별 소원 모두). 다른 사람의 소원은 404. 받은 공감/응원도 함께 지움
wishRouter.delete('/wishes/:id', wrap(async (req, res) => {
  const db = getDb();
  const w = await db.get('SELECT id FROM wishes WHERE id = ? AND user_id = ?', [String(req.params.id), req.user.id]);
  if (!w) return res.status(404).json({ message: '지울 수 있는 소원이 없어요.' });
  await db.run('DELETE FROM wish_reactions WHERE wish_id = ?', [w.id]);
  await db.run('DELETE FROM wishes WHERE id = ? AND user_id = ?', [w.id, req.user.id]);
  unfloatWish(w.id);
  res.json({ ok: true });
}));

// 공감/응원 (토글). 비공개 소원과 자기 소원에는 보낼 수 없음
wishRouter.post('/wishes/:id/react', wrap(async (req, res) => {
  const kind = req.body?.kind;
  if (!['empathy', 'cheer'].includes(kind)) return res.status(400).json({ message: '알 수 없는 반응이에요.' });
  const db = getDb();
  const w = await db.get('SELECT * FROM wishes WHERE id = ?', [String(req.params.id)]);
  if (!w || !Number(w.is_public)) return res.status(404).json({ message: '볼 수 없는 소원이에요.' });
  if (expired(w)) return res.status(410).json({ message: `${WISH_TTL_DAYS}일이 지나 공원에서 내려간 소원이에요.` });
  if (w.user_id === req.user.id) return res.status(400).json({ message: '내 소원에는 보낼 수 없어요.' });
  const removed = await db.run('DELETE FROM wish_reactions WHERE wish_id = ? AND user_id = ? AND kind = ?', [w.id, req.user.id, kind]);
  if (!removed.changes) {
    await db.run('INSERT INTO wish_reactions (wish_id, user_id, kind, created_at) VALUES (?, ?, ?, ?)', [w.id, req.user.id, kind, nowIso()]);
    notifyUser(w.user_id, 'wish:reaction', { wishId: w.id, kind, text: w.text });
  }
  res.json({ wish: await wishJson(w, req.user.id) });
}));
