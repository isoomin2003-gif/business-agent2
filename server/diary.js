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
const EXT = {
  'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm', 'video/3gpp': '.3gp', 'video/x-m4v': '.m4v', 'video/ogg': '.ogv',
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif',
};
// 사진: 브라우저에서 바로 보이는 형식만 (아이폰은 사진을 고를 때 보통 JPEG로 바꿔서 보냄)
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const MAX_PHOTO_MB = 15;
/** 파일 앞부분으로 실제 사진 형식인지 확인 (확장자·형식 이름만 바꾼 파일은 거절) */
function photoMagicOk(file, mime) {
  const b = Buffer.alloc(12);
  const fd = fs.openSync(file, 'r');
  try { fs.readSync(fd, b, 0, 12, 0); } finally { fs.closeSync(fd); }
  if (mime === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (mime === 'image/png') return b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === 'image/webp') return b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';
  if (mime === 'image/gif') return b.toString('ascii', 0, 4) === 'GIF8';
  return false;
}
export const mediaType = (mime) => (String(mime || '').startsWith('image/') ? 'photo' : 'video');

fs.mkdirSync(PATHS.tmp, { recursive: true });

const upload = multer({
  dest: PATHS.tmp,
  limits: { fileSize: config.maxVideoMb * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => cb(null, /^video\//.test(file.mimetype) || PHOTO_TYPES.includes(file.mimetype)),
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

// 일기 1건: 사진 일기면 mediaType 'photo', 영상 일기면 'video' (첨부 파일은 같은 비공개 저장소·같은 주소 방식)
const entryJson = (r) => ({
  id: r.id, date: r.entry_date, sentence: r.sentence, videoId: r.video_id, mediaType: mediaType(r.media_mime),
  videoUrl: `/api/videos/${r.video_id}`, updatedAt: r.updated_at,
});
const ENTRY_SQL = 'SELECT d.*, v.mime AS media_mime FROM diary_entries d LEFT JOIN videos v ON v.id = d.video_id';

export const diaryRouter = express.Router();
diaryRouter.use(['/videos', '/diary'], requireUser);

// 사진·영상 업로드(개인 저장소). 저장 전 단계이므로 문장은 클라이언트에 그대로 남아 있습니다.
diaryRouter.post('/videos', (req, res) => {
  upload.single('video')(req, res, async (err) => {
    if (err) {
      const tooBig = err.code === 'LIMIT_FILE_SIZE';
      return res.status(tooBig ? 413 : 400).json({ error: 'upload_failed', message: tooBig ? `영상은 ${config.maxVideoMb}MB 이하만 올릴 수 있어요.` : '업로드 중 문제가 생겼어요.' });
    }
    if (!req.file) return res.status(400).json({ error: 'not_media', message: '사진(JPG·PNG·WEBP·GIF)이나 영상 파일만 올릴 수 있어요.' });
    const tmp = req.file.path;
    const kind = mediaType(req.file.mimetype);
    try {
      if (req.file.size < (kind === 'photo' ? 50 : 1024)) return res.status(400).json({ error: 'empty_media', message: `${kind === 'photo' ? '사진' : '영상'} 파일이 비어 있거나 손상됐어요.` });
      if (kind === 'photo' && req.file.size > MAX_PHOTO_MB * 1024 * 1024) return res.status(413).json({ error: 'too_big', message: `사진은 ${MAX_PHOTO_MB}MB 이하만 올릴 수 있어요.` });
      if (kind === 'photo' && !photoMagicOk(tmp, req.file.mimetype)) return res.status(400).json({ error: 'bad_photo', message: '사진 파일을 읽을 수 없어요. JPG·PNG·WEBP·GIF 사진을 골라 주세요.' });
      const v = await insertVideo(req.user.id, tmp, req.file.mimetype, 'upload');
      res.json({ videoId: v.id, url: `/api/videos/${v.id}`, mediaType: kind });
    } catch (e) {
      console.error('[video] upload failed:', e.message);
      res.status(500).json({ error: 'store_failed', message: '파일을 저장하지 못했어요.' });
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
    res.json({ videoId: v.id, url: `/api/videos/${v.id}`, mediaType: 'video' });
  } catch (e) {
    console.error('[video] sample copy failed:', e.message);
    res.status(500).json({ error: 'store_failed', message: '샘플 영상을 준비하지 못했어요.' });
  }
}));

// 사진·영상 열람: 소유자만. 로컬은 Range 스트리밍, Supabase는 5분짜리 서명 주소로 이동
diaryRouter.get('/videos/:id', wrap(async (req, res) => {
  const v = await getDb().get('SELECT storage_key, mime, user_id FROM videos WHERE id = ?', [String(req.params.id)]);
  if (!v || v.user_id !== req.user.id) return res.status(404).json({ error: 'not_found', message: '파일을 찾을 수 없어요.' });
  res.set('Cache-Control', 'private, no-store');
  await getStorage().serve(res, v.storage_key, v.mime);
}));

// 저장 전에 첨부를 지우거나 다른 파일로 바꿨을 때: 어느 일기에도 쓰이지 않는 내 파일만 지움
diaryRouter.delete('/videos/:id', wrap(async (req, res) => {
  await deleteVideoIfUnused(String(req.params.id), req.user.id);
  res.json({ ok: true });
}));

diaryRouter.get('/diary/day/:date', wrap(async (req, res) => {
  const r = await getDb().get(`${ENTRY_SQL} WHERE d.user_id = ? AND d.entry_date = ?`, [req.user.id, String(req.params.date)]);
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
  if (!v) return res.status(400).json({ error: 'no_video', message: '사진이나 영상을 먼저 골라 주세요.' });
  const prev = await db.get('SELECT * FROM diary_entries WHERE user_id = ? AND entry_date = ?', [req.user.id, date]);
  const t = nowIso();
  if (prev) {
    await db.run('UPDATE diary_entries SET sentence = ?, video_id = ?, updated_at = ? WHERE id = ?', [sentence, videoId, t, prev.id]);
    if (prev.video_id !== videoId) await deleteVideoIfUnused(prev.video_id, req.user.id);
  } else {
    await db.run('INSERT INTO diary_entries (id, user_id, entry_date, sentence, video_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [crypto.randomUUID(), req.user.id, date, sentence, videoId, t, t]);
  }
  const r = await db.get(`${ENTRY_SQL} WHERE d.user_id = ? AND d.entry_date = ?`, [req.user.id, date]);
  // 같은 날 첨부만 바꾸면 created: false → 책장 색은 처음 쓴 한 번만
  res.json({ entry: entryJson(r), created: !prev });
}));

// 내 일기 페이지 삭제: 문장과 (다른 페이지에서 쓰지 않는) 영상 파일까지 지웁니다. 다른 사람의 페이지는 404.
diaryRouter.delete('/diary/entry/:id', wrap(async (req, res) => {
  const db = getDb();
  const e = await db.get('SELECT id, video_id FROM diary_entries WHERE id = ? AND user_id = ?', [String(req.params.id), req.user.id]);
  if (!e) return res.status(404).json({ error: 'not_found', message: '지울 수 있는 페이지가 없어요.' });
  await db.run('DELETE FROM diary_entries WHERE id = ? AND user_id = ?', [e.id, req.user.id]);
  await deleteVideoIfUnused(e.video_id, req.user.id);
  res.json({ ok: true });
}));

diaryRouter.get('/diary/months', wrap(async (req, res) => {
  const rows = await getDb().all(`SELECT substr(entry_date, 1, 7) AS month, COUNT(*) AS count FROM diary_entries
    WHERE user_id = ? GROUP BY substr(entry_date, 1, 7) ORDER BY month`, [req.user.id]);
  res.json({ months: rows.map((r) => ({ month: r.month, count: Number(r.count) })) });
}));

diaryRouter.get('/diary/month/:ym', wrap(async (req, res) => {
  const ym = String(req.params.ym);
  if (!/^\d{4}-\d{2}$/.test(ym)) return res.status(400).json({ error: 'bad_month' });
  const rows = await getDb().all(`${ENTRY_SQL} WHERE d.user_id = ? AND d.entry_date LIKE ? ORDER BY d.entry_date`, [req.user.id, `${ym}-%`]);
  res.json({ month: ym, entries: rows.map(entryJson) });
}));
