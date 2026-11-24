import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import multer from 'multer';
import { getDb, nowIso } from './db.js';
import { getStorage } from './storage.js';
import { config, PATHS } from './config.js';
import { requireUser, wrap } from './auth.js';

export const SAMPLE_VIDEOS = {
  sunset: { file: 'sample-sunset.mp4', poster: '/media/samples/sample-sunset.jpg', title: '노을 지는 창가' },
  rain: { file: 'sample-rain.mp4', poster: '/media/samples/sample-rain.jpg', title: '비 오는 밤 정류장' },
  fireworks: { file: 'sample-fireworks.mp4', poster: '/media/samples/sample-fireworks.jpg', title: '친구들과 불꽃놀이' },
};

const MAX_SENTENCE = 100;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EXT = { 'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm', 'video/3gpp': '.3gp', 'video/x-m4v': '.m4v', 'video/ogg': '.ogv' };

fs.mkdirSync(PATHS.tmp, { recursive: true });

const upload = multer({
  dest: PATHS.tmp,
  limits: { fileSize: config.maxVideoMb * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => cb(null, /^video\//.test(file.mimetype)),
});

/** 작성자 브라우저의 날짜가 서버 시각과 크게 어긋나지 않는지(시간대 차이 ±1일) 확인 */
export function isPlausibleToday(date) {
  if (!DATE_RE.test(date)) return false;
  const d = Date.parse(`${date}T12:00:00Z`);
  if (Number.isNaN(d)) return false;
  return Math.abs(d - Date.now()) <= 1000 * 60 * 60 * 38;
}

/** 영상을 저장소(로컬 디스크 또는 Supabase 비공개 버킷)에 넣고 DB에 기록 */
async function insertVideo(userId, srcPath, mime, source) {
  const id = crypto.randomUUID();
  const key = `${userId}/${id}${EXT[mime] || '.mp4'}`;
  const size = (await fs.promises.stat(srcPath)).size;
  await getStorage().put(key, srcPath, mime);
  await getDb().run('INSERT INTO videos (id, user_id, storage_key, mime, size, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, userId, key, mime, size, source, nowIso()]);
  return { id, size, mime };
}

async function deleteVideoIfUnused(videoId, userId) {
  const db = getDb();
  if (await db.get('SELECT 1 AS used FROM diary_entries WHERE video_id = ?', [videoId])) return;
  const v = await db.get('SELECT storage_key FROM videos WHERE id = ? AND user_id = ?', [videoId, userId]);
  if (!v) return;
  await db.run('DELETE FROM videos WHERE id = ?', [videoId]);
  getStorage().remove(v.storage_key).catch(() => {});
}

const entryJson = (r) => ({
  id: r.id, date: r.entry_date, sentence: r.sentence, videoId: r.video_id,
  videoUrl: `/api/videos/${r.video_id}`, updatedAt: r.updated_at,
});

export const diaryRouter = express.Router();
diaryRouter.use(['/videos', '/diary'], requireUser);

// 영상 업로드(개인 저장소). 저장 전 단계이므로 문장은 클라이언트에 그대로 남아 있습니다.
diaryRouter.post('/videos', (req, res) => {
  upload.single('video')(req, res, async (err) => {
    if (err) {
      const tooBig = err.code === 'LIMIT_FILE_SIZE';
      return res.status(tooBig ? 413 : 400).json({ error: 'upload_failed', message: tooBig ? `영상은 ${config.maxVideoMb}MB 이하만 올릴 수 있어요.` : '업로드 중 문제가 생겼어요.' });
    }
    if (!req.file) return res.status(400).json({ error: 'not_video', message: '영상 파일만 올릴 수 있어요.' });
    const tmp = req.file.path;
    try {
      if (req.file.size < 1024) return res.status(400).json({ error: 'empty_video', message: '영상 파일이 비어 있거나 손상됐어요.' });
      const v = await insertVideo(req.user.id, tmp, req.file.mimetype, 'upload');
      res.json({ videoId: v.id, url: `/api/videos/${v.id}` });
    } catch (e) {
      console.error('[video] upload failed:', e.message);
      res.status(500).json({ error: 'store_failed', message: '영상을 저장하지 못했어요.' });
    } finally {
      fs.rm(tmp, { force: true }, () => {});
    }
  });
});

// 샘플 영상을 내 개인 저장소로 복사합니다(이후에는 일반 기록과 똑같이 본인만 열람).
diaryRouter.post('/videos/sample', express.json(), wrap(async (req, res) => {
  const s = SAMPLE_VIDEOS[req.body?.sampleId];
  if (!s) return res.status(400).json({ error: 'bad_sample', message: '없는 샘플이에요.' });
  try {
    const v = await insertVideo(req.user.id, path.join(PATHS.samples, s.file), 'video/mp4', 'sample');
    res.json({ videoId: v.id, url: `/api/videos/${v.id}` });
  } catch (e) {
    console.error('[video] sample copy failed:', e.message);
    res.status(500).json({ error: 'store_failed', message: '샘플 영상을 준비하지 못했어요.' });
  }
}));

// 영상 열람: 소유자만. 로컬은 Range 스트리밍, Supabase는 5분짜리 서명 주소로 이동
diaryRouter.get('/videos/:id', wrap(async (req, res) => {
  const v = await getDb().get('SELECT storage_key, mime, user_id FROM videos WHERE id = ?', [String(req.params.id)]);
  if (!v || v.user_id !== req.user.id) return res.status(404).json({ error: 'not_found', message: '영상을 찾을 수 없어요.' });
  res.set('Cache-Control', 'private, no-store');
  await getStorage().serve(res, v.storage_key, v.mime);
}));

diaryRouter.get('/diary/day/:date', wrap(async (req, res) => {
  const r = await getDb().get('SELECT * FROM diary_entries WHERE user_id = ? AND entry_date = ?', [req.user.id, String(req.params.date)]);
  res.json({ entry: r ? entryJson(r) : null });
}));

diaryRouter.put('/diary/day/:date', express.json(), wrap(async (req, res) => {
  const date = String(req.params.date);
  const sentence = String(req.body?.sentence ?? '').replace(/\s+/g, ' ').trim();
  const videoId = String(req.body?.videoId ?? '');
  if (!isPlausibleToday(date)) return res.status(400).json({ error: 'bad_date', message: '오늘 날짜의 페이지만 쓸 수 있어요.' });
  if (!sentence) return res.status(400).json({ error: 'empty_sentence', message: '한 문장을 적어 주세요.' });
  if ([...sentence].length > MAX_SENTENCE) return res.status(400).json({ error: 'too_long', message: `문장은 ${MAX_SENTENCE}자까지 적을 수 있어요.` });
  const db = getDb();
  const v = await db.get('SELECT id FROM videos WHERE id = ? AND user_id = ?', [videoId, req.user.id]);
  if (!v) return res.status(400).json({ error: 'no_video', message: '영상을 먼저 골라 주세요.' });
  const prev = await db.get('SELECT * FROM diary_entries WHERE user_id = ? AND entry_date = ?', [req.user.id, date]);
  const t = nowIso();
  if (prev) {
    await db.run('UPDATE diary_entries SET sentence = ?, video_id = ?, updated_at = ? WHERE id = ?', [sentence, videoId, t, prev.id]);
    if (prev.video_id !== videoId) await deleteVideoIfUnused(prev.video_id, req.user.id);
  } else {
    await db.run('INSERT INTO diary_entries (id, user_id, entry_date, sentence, video_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [crypto.randomUUID(), req.user.id, date, sentence, videoId, t, t]);
  }
  const r = await db.get('SELECT * FROM diary_entries WHERE user_id = ? AND entry_date = ?', [req.user.id, date]);
  res.json({ entry: entryJson(r), created: !prev });
}));

diaryRouter.get('/diary/months', wrap(async (req, res) => {
  const rows = await getDb().all(`SELECT substr(entry_date, 1, 7) AS month, COUNT(*) AS count FROM diary_entries
    WHERE user_id = ? GROUP BY substr(entry_date, 1, 7) ORDER BY month`, [req.user.id]);
  res.json({ months: rows.map((r) => ({ month: r.month, count: Number(r.count) })) });
}));

diaryRouter.get('/diary/month/:ym', wrap(async (req, res) => {
  const ym = String(req.params.ym);
  if (!/^\d{4}-\d{2}$/.test(ym)) return res.status(400).json({ error: 'bad_month' });
  const rows = await getDb().all('SELECT * FROM diary_entries WHERE user_id = ? AND entry_date LIKE ? ORDER BY entry_date', [req.user.id, `${ym}-%`]);
  res.json({ month: ym, entries: rows.map(entryJson) });
}));
