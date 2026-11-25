-- 정식 계정(닉네임 + 비밀번호)과 브라우저별 로그인 세션
-- 게스트를 정식 계정으로 바꿀 때는 같은 users 행에 이름·비밀번호만 더하므로 일기·영상·소원은 그대로 이어집니다.
ALTER TABLE users ADD COLUMN account_key TEXT;      -- 정식 닉네임을 비교용으로 정규화한 값 (게스트는 NULL)
ALTER TABLE users ADD COLUMN password_hash TEXT;    -- scrypt 해시 (평문 저장 안 함)
ALTER TABLE users ADD COLUMN registered_at TEXT;
CREATE UNIQUE INDEX idx_users_account ON users(account_key);

-- 로그인 세션: 브라우저마다 다른 임의 토큰의 SHA-256 해시만 저장 (한 계정에 여러 브라우저 가능)
CREATE TABLE sessions (
  token_hash    TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TEXT NOT NULL,
  last_seen_at  TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
-- 지금까지의 게스트 쿠키를 그대로 세션으로 옮김 (기존 사용자는 다시 로그인할 필요 없음)
INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at) SELECT token_hash, id, created_at, last_seen_at FROM users;
