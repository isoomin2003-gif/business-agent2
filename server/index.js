import http from 'node:http';
import express from 'express';
import cookieParser from 'cookie-parser';
import { config, PATHS } from './config.js';
import { initDb } from './db.js';
import { initStorage } from './storage.js';
import { createGuest, setGuestCookie, clearSessionCookie, userFromToken, COOKIE, requireAdmin, wrap, cleanNickname, randomNickname, renameUser, requireUser, registerAccount, loginAccount, endSession, checkPassword, accountKey, saveAvatar } from './auth.js';
import { validAvatar } from '../public/js/shared/avatar.js';
import { diaryRouter, SAMPLE_VIDEOS } from './diary.js';
import { memoryRouter } from './memory.js';
import { wishRouter } from './wishes.js';
import { chatRouter } from './chat.js';
import { newsRouter, startNewsScheduler, catchUp } from './news.js';
import { setNow, resetClock, now as clockNow } from './kst.js';
import { setupRealtime, counts, onlineCount, fireStar, getRadio, renameLive, setAvatarLive, dropSessionSockets } from './realtime.js';
import { TRACKS } from './tracks.js';
import { loadLibrary, addedTracks, getTrack } from './library.js';
import { compose, precheck, mySongs, getSong, songStorageKey } from './compose.js';
import { COMPOSE_LIMIT } from '../public/js/shared/limits.js';
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

// 개인 기록이 담긴 API 응답은 브라우저·중간 캐시에 남기지 않음 (로그아웃 후 뒤로가기로 다시 보이지 않게)
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

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
  try { await renameUser(req.user.id, nickname); } catch (e) {
    if (e.code === 'taken') return res.status(409).json({ error: 'taken', message: e.message });
    throw e;
  }
  renameLive(req.user.id, nickname); // 접속 중인 소켓과 옥상·공원 아바타 이름표에도 반영
  res.json({ user: { ...req.user, nickname } });
}));

// 아바타 꾸미기 저장 (머리·맨투맨 색·하의) — 계정에 저장해 다른 브라우저에서도 같은 모습, 옥상·공원에 있으면 바로 반영
app.put('/api/me/avatar', express.json(), requireUser, wrap(async (req, res) => {
  const avatar = validAvatar(req.body);
  if (!avatar) return res.status(400).json({ error: 'bad_avatar', message: '고를 수 없는 모습이에요.' });
  await saveAvatar(req.user.id, avatar);
  setAvatarLive(req.user.id, avatar);
  res.json({ user: { ...req.user, avatar } });
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

// ── 정식 계정: 게스트 → 계정 전환, 로그인, 로그아웃 ──
app.post('/api/account/register', express.json(), requireUser, wrap(async (req, res) => {
  if (req.user.registered) return res.status(400).json({ error: 'already', message: '이미 정식 계정이에요.' });
  const { nickname, error } = cleanNickname(req.body?.nickname);
  if (error) return res.status(400).json({ error: 'bad_nickname', message: error });
  const pwError = checkPassword(req.body?.password, req.body?.passwordConfirm);
  if (pwError) return res.status(400).json({ error: 'bad_password', message: pwError });
  try { await registerAccount(req.user.id, nickname, String(req.body.password)); } catch (e) {
    if (e.code === 'taken') return res.status(409).json({ error: 'taken', message: e.message });
    if (e.code === 'already') return res.status(400).json({ error: 'already', message: e.message });
    throw e;
  }
  renameLive(req.user.id, nickname);
  res.json({ user: { ...req.user, nickname, registered: true } });
}));

// 비밀번호 대입 방지: 같은 IP 또는 같은 닉네임으로 15분에 10번 틀리면 잠시 막음
const loginFails = new Map(); // key → [실패 시각]
const recentFails = (key) => (loginFails.get(key) || []).filter((t) => Date.now() - t < 15 * 60_000);
app.post('/api/account/login', express.json(), wrap(async (req, res) => {
  const nick = String(req.body?.nickname ?? '').slice(0, 40), pw = String(req.body?.password ?? '').slice(0, 200);
  if (!nick.trim() || !pw) return res.status(400).json({ error: 'missing', message: '닉네임과 비밀번호를 모두 입력해 주세요.' });
  const keys = [`ip:${req.ip}`, `n:${accountKey(nick)}`];
  if (keys.some((k) => recentFails(k).length >= 10)) return res.status(429).json({ error: 'rate', message: '로그인 시도가 너무 많아요. 15분 뒤에 다시 해 주세요.' });
  const r = await loginAccount(nick, pw);
  if (!r) {
    keys.forEach((k) => loginFails.set(k, [...recentFails(k), Date.now()]));
    return res.status(401).json({ error: 'bad_login', message: '닉네임 또는 비밀번호가 맞지 않아요.' });
  }
  keys.forEach((k) => loginFails.delete(k));
  const prev = req.cookies[COOKIE];
  if (prev) dropSessionSockets(prev); // 이 브라우저에서 쓰던 이전 세션의 실시간 연결을 끊음
  setGuestCookie(res, r.token);
  res.json({ user: r.user });
}));

app.post('/api/account/logout', wrap(async (req, res) => {
  const token = req.cookies[COOKIE];
  await endSession(token);
  if (token) dropSessionSockets(token);
  clearSessionCookie(res);
  res.json({ ok: true });
}));

app.get('/api/places', (req, res) => res.json({ counts: counts(), online: onlineCount() }));
// 작곡하기는 AI 키가 있어 실제로 쓸 수 있을 때만 공개
app.get('/api/radio/tracks', (req, res) => res.json({ tracks: TRACKS, added: addedTracks(), features: { compose: !!config.openrouter.apiKey } }));

// ── 오늘의 단어로 작곡하기 ──
// 횟수 제한: 한 사람당 10분에 최대 5곡 (AI를 실제로 부르는 요청만 셈. 다시 듣기·신청은 세지 않음)
const composeTimes = new Map(); // userId → 최근 요청 시각들
const WINDOW_MS = COMPOSE_LIMIT.windowMin * 60_000;
function composeQuota(userId) {
  const now = Date.now();
  const times = (composeTimes.get(userId) || []).filter((t) => now - t < WINDOW_MS);
  composeTimes.set(userId, times);
  const retryAfterSec = times.length >= COMPOSE_LIMIT.max ? Math.ceil((times[0] + WINDOW_MS - now) / 1000) : 0;
  return { max: COMPOSE_LIMIT.max, windowMin: COMPOSE_LIMIT.windowMin, used: times.length, retryAfterSec };
}
const retryText = (sec) => `약 ${Math.max(1, Math.ceil(sec / 60))}분 후에 다시 작곡할 수 있어요.`;

app.post('/api/compose', express.json(), requireUser, wrap(async (req, res) => {
  const pre = precheck(req.body?.text);
  if (pre) return res.json(pre);
  const q = composeQuota(req.user.id);
  if (q.retryAfterSec) return res.status(429).json({ status: 'rate', message: retryText(q.retryAfterSec), limit: q });
  composeTimes.get(req.user.id).push(Date.now());
  const r = await compose(req.body?.text, req.user.id); // 사용자의 문장만 AI에게 보냄
  res.json({ ...r, limit: composeQuota(req.user.id) });
}));
// 내가 만든 노래 목록 + 지금 남은 작곡 횟수
app.get('/api/compose/mine', requireUser, wrap(async (req, res) => {
  const q = composeQuota(req.user.id);
  res.json({ songs: await mySongs(req.user.id), limit: { ...q, message: q.retryAfterSec ? retryText(q.retryAfterSec) : '' } });
}));
// 다시 듣기·미리 듣기: 만든 사람만 (작곡 횟수 차감 없음)
app.get('/api/compose/:id/audio', requireUser, wrap(async (req, res) => {
  const r = await getSong(req.params.id, req.user.id);
  if (!r) return res.status(404).json({ error: 'not_found' });
  res.set('Cache-Control', 'private, no-store');
  await storage.serve(res, r.storage_key, 'audio/wav');
}));
// 신청되어 라디오에 올라간 AI 작곡곡: 누구나 (저장소 주소는 서버가 그때그때 만듦)
app.get('/api/radio/audio/:id', wrap(async (req, res) => {
  const t = getTrack(req.params.id);
  const key = t?.kind === 'generated' ? await songStorageKey(t.id) : null;
  if (!key) return res.status(404).json({ error: 'not_found' });
  await storage.serve(res, key, 'audio/wav');
}));
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
app.use('/api', chatRouter);
app.use('/api', newsRouter);

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
// 자동 테스트 전용 시계 (ALLOW_TEST_CLOCK=1로 띄운 서버에서만). 배포 환경에서는 없음
if (process.env.ALLOW_TEST_CLOCK === '1') {
  app.post('/api/test/clock', express.json(), (req, res) => {
    if (req.body?.reset) resetClock(); else setNow(Date.parse(req.body?.at));
    res.json({ now: new Date(clockNow()).toISOString() });
  });
  app.post('/api/test/catch-up', wrap(async (req, res) => res.json({ done: await catchUp() })));
}
// 페이지·JS·CSS는 매번 서버에 새 버전이 있는지 확인(no-cache + ETag)해서, 배포 직후에도 옛 화면이 남지 않게 합니다.
// 음원·샘플 영상·이미지는 바뀌지 않으므로 하루 동안 캐시합니다.
app.use(express.static(PATHS.public, {
  extensions: ['html'],
  setHeaders(res, filePath) {
    // 장면 그림(배경·책장·가판대)도 바뀔 수 있어 매번 확인 (바뀌지 않았으면 304로 빠르게)
    if (/\.(html|js|css)$/.test(filePath) || /[\\/]img[\\/]scenes[\\/]/.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
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
startNewsScheduler(); // 매주 일요일 18:00(KST) 발행분을 미리 만들고, 잠들었다 깨어나면 밀린 호를 복구
server.listen(config.port, () => {
  console.log(`하루 한 장 서버: http://localhost:${config.port}`);
  console.log(`[db] ${db.kind === 'postgres' ? 'PostgreSQL(DATABASE_URL) — 재시작·재배포 후에도 보존' : `SQLite — ${PATHS.db}`}`);
  console.log(`[storage] ${storage.kind === 'supabase' ? `Supabase Storage 비공개 버킷 '${config.supabase.bucket}'` : `로컬 디스크 — ${PATHS.videos}`}`);
  if (!config.openrouter.apiKey) console.log('[rag] OPENROUTER_API_KEY 없음 — 기억 찾기는 검색 결과만 보여주고 AI 답변은 "키 없음" 상태로 표시됩니다.');
  if (!config.adminKey) console.log('[demo] ADMIN_KEY 없음 — 발표용 시연 기능이 꺼져 있습니다.');
});
