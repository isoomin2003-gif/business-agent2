import http from 'node:http';
import express from 'express';
import cookieParser from 'cookie-parser';
import { config, PATHS } from './config.js';
import { openDb } from './db.js';
import { createGuest, setGuestCookie, userFromToken, COOKIE, requireAdmin } from './auth.js';
import { diaryRouter, SAMPLE_VIDEOS } from './diary.js';
import { memoryRouter } from './memory.js';
import { wishRouter } from './wishes.js';
import { setupRealtime, counts, fireStar, getRadio } from './realtime.js';
import { TRACKS } from './tracks.js';
import { OUTDOOR } from '../public/js/shared/places.js';

openDb();
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
app.get('/api/me', (req, res) => {
  const user = userFromToken(req.cookies[COOKIE]);
  res.json({ user });
});

app.post('/api/guest', (req, res) => {
  const existing = userFromToken(req.cookies[COOKIE]);
  if (existing) return res.json({ user: existing, created: false });
  const { token, user } = createGuest();
  setGuestCookie(res, token);
  res.json({ user, created: true });
});

app.get('/api/places', (req, res) => res.json({ counts: counts() }));
app.get('/api/radio/tracks', (req, res) => res.json({ tracks: TRACKS }));
app.get('/api/samples', (req, res) => res.json({ samples: Object.entries(SAMPLE_VIDEOS).map(([id, s]) => ({ id, title: s.title, poster: s.poster })) }));
app.get('/healthz', (req, res) => res.json({ ok: true }));

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

app.use(express.static(PATHS.public, { extensions: ['html'], maxAge: '1h' }));
app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));

const server = http.createServer(app);
setupRealtime(server);
server.listen(config.port, () => {
  console.log(`하루 한 장 서버: http://localhost:${config.port}  (data: ${config.dataDir})`);
  if (!config.openrouter.apiKey) console.log('[rag] OPENROUTER_API_KEY 없음 — 기억 찾기는 검색 결과만 보여주고 AI 답변은 "키 없음" 상태로 표시됩니다.');
  if (!config.adminKey) console.log('[demo] ADMIN_KEY 없음 — 발표용 시연 기능이 꺼져 있습니다.');
});
