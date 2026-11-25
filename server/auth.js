import crypto from 'node:crypto';
import { promisify } from 'node:util';
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

const newToken = () => crypto.randomBytes(32).toString('base64url');

async function createSession(userId) {
  const token = newToken();
  const t = nowIso();
  await getDb().run('INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)', [hashToken(token), userId, t, t]);
  return token;
}

export async function createGuest(nickname) {
  const user = { id: crypto.randomUUID(), nickname: nickname || randomNickname(), color: crypto.randomInt(8), registered: false };
  const t = nowIso();
  // users.token_hash는 예전 형식과의 호환용(임의 값). 실제 로그인 상태는 sessions 표로 확인
  await getDb().run('INSERT INTO users (id, token_hash, nickname, color, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)',
    [user.id, hashToken(newToken()), user.nickname, user.color, t, t]);
  return { token: await createSession(user.id), user };
}

const toUser = (row) => (row ? { id: row.id, nickname: row.nickname, color: Number(row.color), registered: !!row.account_key } : null);

export async function userFromToken(token) {
  if (!token || typeof token !== 'string' || token.length > 100) return null;
  return toUser(await getDb().get('SELECT u.id, u.nickname, u.color, u.account_key FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?', [hashToken(token)]));
}

// ── 정식 계정 (닉네임 + 비밀번호) ──
/** 정식 닉네임 비교용 값: 유니코드 정규화 + 소문자 + 공백 정리 ('Haru'와 'haru'는 같은 이름) */
export const accountKey = (nick) => String(nick).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
export const PASSWORD_MIN = 8, PASSWORD_MAX = 64;
const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** 비밀번호 → 'scrypt:N:r:p:소금:해시' (소금은 계정마다 무작위, 평문은 저장하지 않음) */
export async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(String(pw).normalize('NFKC'), salt, 64, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join(':');
}
export async function verifyPassword(pw, stored) {
  const [alg, N, r, p, salt, hash] = String(stored || '').split(':');
  if (alg !== 'scrypt' || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await scrypt(String(pw).normalize('NFKC'), Buffer.from(salt, 'base64'), expected.length, { N: Number(N), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem });
  return crypto.timingSafeEqual(key, expected);
}
let dummyHash = null; // 없는 닉네임으로 로그인해도 같은 시간이 걸리게

export function checkPassword(pw, confirm) {
  const s = String(pw ?? '');
  if ([...s].length < PASSWORD_MIN) return `비밀번호는 ${PASSWORD_MIN}자 이상으로 정해 주세요.`;
  if ([...s].length > PASSWORD_MAX) return `비밀번호는 ${PASSWORD_MAX}자까지 쓸 수 있어요.`;
  if (confirm !== undefined && s !== String(confirm ?? '')) return '비밀번호 확인이 일치하지 않아요.';
  return null;
}

const isUniqueError = (e) => /unique|duplicate/i.test(e?.message || '') || e?.code === '23505';
const taken = () => Object.assign(new Error('이미 사용 중인 닉네임이에요'), { code: 'taken' });

/** 지금 게스트를 정식 계정으로 전환 — 같은 users 행에 이름·비밀번호만 더하므로 일기·영상·소원이 그대로 이어짐 */
export async function registerAccount(userId, nickname, password) {
  const key = accountKey(nickname);
  const owner = await getDb().get('SELECT id FROM users WHERE account_key = ?', [key]);
  if (owner && owner.id !== userId) throw taken();
  const hash = await hashPassword(password);
  let r;
  try {
    r = await getDb().run('UPDATE users SET nickname = ?, account_key = ?, password_hash = ?, registered_at = ?, last_seen_at = ? WHERE id = ? AND account_key IS NULL',
      [nickname, key, hash, nowIso(), nowIso(), userId]);
  } catch (e) { if (isUniqueError(e)) throw taken(); throw e; }
  if (!r.changes) throw Object.assign(new Error('이미 정식 계정이에요.'), { code: 'already' });
}

/** 닉네임과 비밀번호가 모두 맞을 때만 새 세션. 틀리면 어느 쪽이 틀렸는지 알려 주지 않음 */
export async function loginAccount(nickname, password) {
  const row = await getDb().get('SELECT id, nickname, color, account_key, password_hash FROM users WHERE account_key = ?', [accountKey(nickname)]);
  if (!row) {
    dummyHash ||= await hashPassword('timing-equalizer');
    await verifyPassword(password, dummyHash);
    return null;
  }
  if (!(await verifyPassword(password, row.password_hash))) return null;
  return { token: await createSession(row.id), user: toUser(row) };
}

/** 이 브라우저의 세션만 끝냄 (다른 브라우저의 로그인은 그대로) */
export async function endSession(token) {
  if (token && typeof token === 'string' && token.length <= 100) await getDb().run('DELETE FROM sessions WHERE token_hash = ?', [hashToken(token)]);
}

/** 닉네임 변경 (일기·영상·소원은 그대로). 정식 계정이면 다른 계정과 이름이 겹치지 않아야 함 */
export async function renameUser(userId, nickname) {
  const row = await getDb().get('SELECT account_key FROM users WHERE id = ?', [userId]);
  if (!row?.account_key) {
    await getDb().run('UPDATE users SET nickname = ?, last_seen_at = ? WHERE id = ?', [nickname, nowIso(), userId]);
    return;
  }
  const key = accountKey(nickname);
  const owner = await getDb().get('SELECT id FROM users WHERE account_key = ?', [key]);
  if (owner && owner.id !== userId) throw taken();
  try {
    await getDb().run('UPDATE users SET nickname = ?, account_key = ?, last_seen_at = ? WHERE id = ?', [nickname, key, nowIso(), userId]);
  } catch (e) { if (isUniqueError(e)) throw taken(); throw e; }
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'lax', secure: config.secureCookie, path: '/' });
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
