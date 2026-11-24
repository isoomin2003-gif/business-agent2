-- 게스트 계정: 브라우저 쿠키의 임의 토큰을 SHA-256 해시로만 저장합니다.
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  token_hash    TEXT NOT NULL UNIQUE,
  nickname      TEXT NOT NULL,
  color         INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  last_seen_at  TEXT NOT NULL
);

-- 영상 파일 메타데이터. 실제 파일은 DATA_DIR/videos/<user_id>/ 아래(공개 폴더 밖)에 저장합니다.
CREATE TABLE videos (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_key   TEXT NOT NULL,
  mime          TEXT NOT NULL,
  size          INTEGER NOT NULL,
  source        TEXT NOT NULL CHECK (source IN ('upload', 'sample')),
  created_at    TEXT NOT NULL
);
CREATE INDEX idx_videos_user ON videos(user_id);

-- 하루 한 페이지: (user_id, entry_date) 유일
CREATE TABLE diary_entries (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_date    TEXT NOT NULL,            -- YYYY-MM-DD (작성자 브라우저 기준 날짜)
  sentence      TEXT NOT NULL,
  video_id      TEXT NOT NULL REFERENCES videos(id),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE (user_id, entry_date)
);

-- 소원: 소원 나무(공개) 또는 별똥별 소원(공개/비공개)
CREATE TABLE wishes (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nickname      TEXT NOT NULL,            -- 게시 당시 임시 닉네임
  place         TEXT NOT NULL CHECK (place IN ('rooftop', 'park')),
  source        TEXT NOT NULL CHECK (source IN ('tree', 'star')),
  star_id       TEXT,
  text          TEXT NOT NULL,
  is_public     INTEGER NOT NULL,
  on_tree       INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);
CREATE INDEX idx_wishes_tree ON wishes(on_tree, created_at);
CREATE INDEX idx_wishes_user ON wishes(user_id);

CREATE TABLE wish_reactions (
  wish_id       TEXT NOT NULL REFERENCES wishes(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('empathy', 'cheer')),
  created_at    TEXT NOT NULL,
  PRIMARY KEY (wish_id, user_id, kind)
);
