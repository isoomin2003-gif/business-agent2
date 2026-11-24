import crypto from 'node:crypto';
import { getDb, nowIso } from './db.js';
import { config } from './config.js';

export const COOKIE = 'haru_guest';
const COOKIE_MAX_AGE = 1000 * 60 * 60 * 24 * 180; // 180일

const ADJ = ['졸린', '느긋한', '반짝이는', '조용한', '포근한', '수줍은', '용감한', '말랑한', '다정한', '엉뚱한', '산책하는', '꿈꾸는'];
const NOUN = ['고양이', '너구리', '부엉이', '고래', '여우', '다람쥐', '펭귄', '판다', '수달', '토끼', '반딧불', '해파리'];

export const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

/** async 라우트의 오류를 Express 오류 처리로 넘깁니다 */
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const NICK_MAX = 12;
const graphemes = (t) => [...new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(t)].length;
/** 닉네임 검사: 앞뒤 공백 정리, 1~12자, 제어문자·꺾쇠 등 금지 */
export function cleanNickname(raw) {
  const nick = String(raw ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!nick) return { error: '닉네임을 입력해 주세요.' };
  if (graphemes(nick) > NICK_MAX) return { error: `닉네임은 ${NICK_MAX}자까지 쓸 수 있어요.` };
  if (/[\u0000-\u001f\u007f<>{}\\`]/.test(nick)) return { error: '닉네임에 쓸 수 없는 기호가 있어요.' };
  return { nickname: nick };
}

export function randomNickname() {
  const r = (a) => a[crypto.randomInt(a.length)];
  return `${r(ADJ)} ${r(NOUN)}${crypto.randomInt(10, 100)}`;
}

export async function createGuest(nickname) {
  const token = crypto.randomBytes(32).toString('base64url');
  const user = { id: crypto.randomUUID(), nickname: nickname || randomNickname(), color: crypto.randomInt(8) };
  const t = nowIso();
  await getDb().run('INSERT INTO users (id, token_hash, nickname, color, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)',
    [user.id, hashToken(token), user.nickname, user.color, t, t]);
  return { token, user };
}

export async function userFromToken(token) {
  if (!token || typeof token !== 'string' || token.length > 100) return null;
  const row = await getDb().get('SELECT id, nickname, color FROM users WHERE token_hash = ?', [hashToken(token)]);
  return row ? { id: row.id, nickname: row.nickname, color: Number(row.color) } : null;
}

/** 현재 게스트 계정의 닉네임만 바꿈 (일기·영상·소원은 그대로) */
export async function renameUser(userId, nickname) {
  await getDb().run('UPDATE users SET nickname = ?, last_seen_at = ? WHERE id = ?', [nickname, nowIso(), userId]);
}

export function setGuestCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: config.secureCookie, maxAge: COOKIE_MAX_AGE, path: '/',
  });
}

/** 쿠키의 게스트 토큰으로 사용자를 찾고, 없으면 401 */
export const requireUser = wrap(async (req, res, next) => {
  const user = await userFromToken(req.cookies?.[COOKIE]);
  if (!user) return res.status(401).json({ error: 'no_session', message: '게스트 세션이 없어요. 처음 화면에서 바로 시작하기를 눌러 주세요.' });
  req.user = user;
  next();
});

export function parseCookieHeader(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) {
      try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* 잘못된 쿠키 무시 */ }
    }
  }
  return out;
}

/** 시연 키가 맞는지 (설정 안 됐으면 항상 false) */
export function isAdminKey(key) {
  if (!config.adminKey || !key) return false;
  return crypto.timingSafeEqual(Buffer.from(hashToken(String(key))), Buffer.from(hashToken(config.adminKey)));
}

export function requireAdmin(req, res, next) {
  const key = req.get('x-admin-key') || '';
  if (!config.adminKey) return res.status(403).json({ error: 'admin_disabled', message: '서버에 ADMIN_KEY가 설정되지 않아 시연 기능이 꺼져 있어요.' });
  const a = Buffer.from(hashToken(key)), b = Buffer.from(hashToken(config.adminKey));
  if (!crypto.timingSafeEqual(a, b)) return res.status(403).json({ error: 'forbidden', message: '시연 키가 올바르지 않아요.' });
  next();
}
