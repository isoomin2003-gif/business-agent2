import http from 'node:http';
import express from 'express';
import cookieParser from 'cookie-parser';
import { config, PATHS } from './config.js';
import { initDb } from './db.js';
import { initStorage } from './storage.js';
import { createGuest, setGuestCookie, userFromToken, COOKIE, requireAdmin, wrap, cleanNickname, randomNickname, renameUser, requireUser } from './auth.js';
import { diaryRouter, SAMPLE_VIDEOS } from './diary.js';
import { memoryRouter } from './memory.js';
import { wishRouter } from './wishes.js';
import { setupRealtime, counts, fireStar, getRadio, renameLive } from './realtime.js';
import { TRACKS } from './tracks.js';
import { loadLibrary, addedTracks } from './library.js';
import { OUTDOOR } from '../public/js/shared/places.js';

const db = await initDb();
const storage = await initStorage();
const libCount = await loadLibrary(); // 신청되어 라디오에 추가된 곡
console.log(`[radio] 추가된 곡 ${libCount}개 불러옴`);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(cookieParser());
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'same-origin');
  next();
});

// ── 게스트 입장 ──
app.get('/api/me', wrap(async (req, res) => {
  res.json({ user: await userFromToken(req.cookies[COOKIE]) });
}));

// 처음 온 사람에게 보여 줄 추천 닉네임 (계정은 '바로 시작하기'를 누를 때 만듦)
app.get('/api/nickname/suggest', (req, res) => res.json({ nickname: randomNickname() }));

// 현재 게스트 계정의 닉네임 변경 — 같은 계정이라 기존 일기·영상은 그대로
app.patch('/api/me', express.json(), requireUser, wrap(async (req, res) => {
  const { nickname, error } = cleanNickname(req.body?.nickname);
  if (error) return res.status(400).json({ error: 'bad_nickname', message: error });
  await renameUser(req.user.id, nickname);
  renameLive(req.user.id, nickname); // 접속 중인 소켓과 옥상·공원 아바타 이름표에도 반영
  res.json({ user: { ...req.user, nickname } });
}));

app.post('/api/guest', express.json(), wrap(async (req, res) => {
  const existing = await userFromToken(req.cookies[COOKIE]);
  if (existing) return res.json({ user: existing, created: false });
  let nickname;
  if (req.body?.nickname) {
    const c = cleanNickname(req.body.nickname);
    if (c.error) return res.status(400).json({ error: 'bad_nickname', message: c.error });
    nickname = c.nickname;
  }
  const { token, user } = await createGuest(nickname);
  setGuestCookie(res, token);
  res.json({ user, created: true });
}));

app.get('/api/places', (req, res) => res.json({ counts: counts() }));
app.get('/api/radio/tracks', (req, res) => res.json({ tracks: TRACKS, added: addedTracks(), features: { compose: false } }));
app.get('/api/samples', (req, res) => res.json({ samples: Object.entries(SAMPLE_VIDEOS).map(([id, s]) => ({ id, title: s.title, poster: s.poster })) }));
// 어떤 저장 방식이 쓰이는지(값이나 주소는 노출하지 않음)
const STARTED_AT = new Date().toISOString();
app.get('/healthz', (req, res) => res.json({
  ok: true, db: db.kind, storage: storage.kind, startedAt: STARTED_AT,
  commit: (process.env.RENDER_GIT_COMMIT || '').slice(0, 7) || undefined,
}));

app.use('/api', diaryRouter);
app.use('/api', memoryRouter);
app.use('/api', wishRouter);

// ── 발표 시연용 (ADMIN_KEY 필요) ──
app.post('/api/admin/star', requireAdmin, express.json(), (req, res) => {
  const place = req.body?.place;
  if (!OUTDOOR.includes(place)) return res.status(400).json({ message: 'place는 rooftop 또는 park' });
  res.json({ ok: true, star: fireStar(place) });
});
app.post('/api/admin/radio/fast-forward', requireAdmin, express.json(), (req, res) => {
  const sec = Math.min(60, Math.max(3, Number(req.body?.secondsLeft) || 8));
  getRadio().fastForward(sec);
  res.json({ ok: true, radio: getRadio().snapshot() });
});
app.get('/api/admin/check', requireAdmin, (req, res) => res.json({ ok: true }));

// 페이지·JS·CSS는 매번 서버에 새 버전이 있는지 확인(no-cache + ETag)해서, 배포 직후에도 옛 화면이 남지 않게 합니다.
// 음원·샘플 영상·이미지는 바뀌지 않으므로 하루 동안 캐시합니다.
app.use(express.static(PATHS.public, {
  extensions: ['html'],
  setHeaders(res, filePath) {
    if (/\.(html|js|css)$/.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
    else res.setHeader('Cache-Control', 'public, max-age=86400');
  },
}));
app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', req.method, req.path, err.message);
  if (!res.headersSent) res.status(500).json({ error: 'server', message: '서버에서 문제가 생겼어요. 잠시 후 다시 시도해 주세요.' });
});

const server = http.createServer(app);
setupRealtime(server);
server.listen(config.port, () => {
  console.log(`하루 한 장 서버: http://localhost:${config.port}`);
  console.log(`[db] ${db.kind === 'postgres' ? 'PostgreSQL(DATABASE_URL) — 재시작·재배포 후에도 보존' : `SQLite — ${PATHS.db}`}`);
  console.log(`[storage] ${storage.kind === 'supabase' ? `Supabase Storage 비공개 버킷 '${config.supabase.bucket}'` : `로컬 디스크 — ${PATHS.videos}`}`);
  if (!config.openrouter.apiKey) console.log('[rag] OPENROUTER_API_KEY 없음 — 기억 찾기는 검색 결과만 보여주고 AI 답변은 "키 없음" 상태로 표시됩니다.');
  if (!config.adminKey) console.log('[demo] ADMIN_KEY 없음 — 발표용 시연 기능이 꺼져 있습니다.');
});
