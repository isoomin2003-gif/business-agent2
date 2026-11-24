import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import multer from 'multer';
import { openDb, nowIso } from './db.js';
import { config, PATHS } from './config.js';
import { requireUser } from './auth.js';

export const SAMPLE_VIDEOS = {
  sunset: { file: 'sample-sunset.mp4', poster: '/media/samples/sample-sunset.jpg', title: '노을 지는 창가' },
  rain: { file: 'sample-rain.mp4', poster: '/media/samples/sample-rain.jpg', title: '비 오는 밤 정류장' },
  fireworks: { file: 'sample-fireworks.mp4', poster: '/media/samples/sample-fireworks.jpg', title: '친구들과 불꽃놀이' },
};

const MAX_SENTENCE = 100;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EXT = { 'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm', 'video/3gpp': '.3gp', 'video/x-m4v': '.m4v', 'video/ogg': '.ogv' };

fs.mkdirSync(PATHS.tmp, { recursive: true });
fs.mkdirSync(PATHS.videos, { recursive: true });

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

function userDir(userId) {
  const dir = path.join(PATHS.videos, userId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function insertVideo(userId, srcPath, mime, source, move) {
  const id = crypto.randomUUID();
  const key = `${userId}/${id}${EXT[mime] || '.mp4'}`;
  const dest = path.join(PATHS.videos, key);
  userDir(userId);
  if (move) fs.renameSync(srcPath, dest); else fs.copyFileSync(srcPath, dest);
  const size = fs.statSync(dest).size;
  openDb().prepare('INSERT INTO videos (id, user_id, storage_key, mime, size, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, userId, key, mime, size, source, nowIso());
  return { id, size, mime };
}

function deleteVideoIfUnused(videoId, userId) {
  const db = openDb();
  const used = db.prepare('SELECT 1 FROM diary_entries WHERE video_id = ?').get(videoId);
  if (used) return;
  const v = db.prepare('SELECT storage_key FROM videos WHERE id = ? AND user_id = ?').get(videoId, userId);
  if (!v) return;
  db.prepare('DELETE FROM videos WHERE id = ?').run(videoId);
  fs.rm(path.join(PATHS.videos, v.storage_key), { force: true }, () => {});
}

const entryJson = (r) => ({
  id: r.id, date: r.entry_date, sentence: r.sentence, videoId: r.video_id,
  videoUrl: `/api/videos/${r.video_id}`, updatedAt: r.updated_at,
});

export const diaryRouter = express.Router();
diaryRouter.use(['/videos', '/diary'], requireUser);

// 영상 업로드(개인 저장소). 저장 전 단계이므로 문장은 클라이언트에 그대로 남아 있습니다.
diaryRouter.post('/videos', (req, res) => {
  upload.single('video')(req, res, (err) => {
    if (err) {
      const tooBig = err.code === 'LIMIT_FILE_SIZE';
      return res.status(tooBig ? 413 : 400).json({ error: 'upload_failed', message: tooBig ? `영상은 ${config.maxVideoMb}MB 이하만 올릴 수 있어요.` : '업로드 중 문제가 생겼어요.' });
    }
    if (!req.file) return res.status(400).json({ error: 'not_video', message: '영상 파일만 올릴 수 있어요.' });
    if (req.file.size < 1024) {
      fs.rm(req.file.path, { force: true }, () => {});
      return res.status(400).json({ error: 'empty_video', message: '영상 파일이 비어 있거나 손상됐어요.' });
    }
    try {
      const v = insertVideo(req.user.id, req.file.path, req.file.mimetype, 'upload', true);
      res.json({ videoId: v.id, url: `/api/videos/${v.id}` });
    } catch (e) {
      fs.rm(req.file.path, { force: true }, () => {});
      console.error(e);
      res.status(500).json({ error: 'store_failed', message: '영상을 저장하지 못했어요.' });
    }
  });
});

// 샘플 영상을 내 개인 저장소로 복사합니다(이후에는 일반 기록과 똑같이 본인만 열람).
diaryRouter.post('/videos/sample', express.json(), (req, res) => {
  const s = SAMPLE_VIDEOS[req.body?.sampleId];
  if (!s) return res.status(400).json({ error: 'bad_sample', message: '없는 샘플이에요.' });
  const v = insertVideo(req.user.id, path.join(PATHS.samples, s.file), 'video/mp4', 'sample', false);
  res.json({ videoId: v.id, url: `/api/videos/${v.id}` });
});

// 영상 스트리밍: 소유자만 접근 가능, Range 요청 지원
diaryRouter.get('/videos/:id', (req, res) => {
  const v = openDb().prepare('SELECT storage_key, mime, user_id FROM videos WHERE id = ?').get(String(req.params.id));
  if (!v || v.user_id !== req.user.id) return res.status(404).json({ error: 'not_found', message: '영상을 찾을 수 없어요.' });
  res.set('Cache-Control', 'private, no-store');
  res.type(v.mime);
  res.sendFile(path.join(PATHS.videos, v.storage_key), { acceptRanges: true });
});

diaryRouter.get('/diary/day/:date', (req, res) => {
  const r = openDb().prepare('SELECT * FROM diary_entries WHERE user_id = ? AND entry_date = ?').get(req.user.id, String(req.params.date));
  res.json({ entry: r ? entryJson(r) : null });
});

diaryRouter.put('/diary/day/:date', express.json(), (req, res) => {
  const date = String(req.params.date);
  const sentence = String(req.body?.sentence ?? '').replace(/\s+/g, ' ').trim();
  const videoId = String(req.body?.videoId ?? '');
  if (!isPlausibleToday(date)) return res.status(400).json({ error: 'bad_date', message: '오늘 날짜의 페이지만 쓸 수 있어요.' });
  if (!sentence) return res.status(400).json({ error: 'empty_sentence', message: '한 문장을 적어 주세요.' });
  if ([...sentence].length > MAX_SENTENCE) return res.status(400).json({ error: 'too_long', message: `문장은 ${MAX_SENTENCE}자까지 적을 수 있어요.` });
  const db = openDb();
  const v = db.prepare('SELECT id FROM videos WHERE id = ? AND user_id = ?').get(videoId, req.user.id);
  if (!v) return res.status(400).json({ error: 'no_video', message: '영상을 먼저 골라 주세요.' });
  const prev = db.prepare('SELECT * FROM diary_entries WHERE user_id = ? AND entry_date = ?').get(req.user.id, date);
  const t = nowIso();
  if (prev) {
    db.prepare('UPDATE diary_entries SET sentence = ?, video_id = ?, updated_at = ? WHERE id = ?').run(sentence, videoId, t, prev.id);
    if (prev.video_id !== videoId) deleteVideoIfUnused(prev.video_id, req.user.id);
  } else {
    db.prepare('INSERT INTO diary_entries (id, user_id, entry_date, sentence, video_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(crypto.randomUUID(), req.user.id, date, sentence, videoId, t, t);
  }
  const r = db.prepare('SELECT * FROM diary_entries WHERE user_id = ? AND entry_date = ?').get(req.user.id, date);
  res.json({ entry: entryJson(r), created: !prev });
});

diaryRouter.get('/diary/months', (req, res) => {
  const rows = openDb().prepare(`SELECT substr(entry_date, 1, 7) AS month, COUNT(*) AS count FROM diary_entries
    WHERE user_id = ? GROUP BY month ORDER BY month`).all(req.user.id);
  res.json({ months: rows.map((r) => ({ month: r.month, count: r.count })) });
});

diaryRouter.get('/diary/month/:ym', (req, res) => {
  const ym = String(req.params.ym);
  if (!/^\d{4}-\d{2}$/.test(ym)) return res.status(400).json({ error: 'bad_month' });
  const rows = openDb().prepare('SELECT * FROM diary_entries WHERE user_id = ? AND entry_date LIKE ? ORDER BY entry_date')
    .all(req.user.id, `${ym}-%`);
  res.json({ month: ym, entries: rows.map(entryJson) });
});
