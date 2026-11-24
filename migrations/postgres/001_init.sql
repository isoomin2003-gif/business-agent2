-- PostgreSQL(Supabase)용 스키마. Supabase Data API에 노출되지 않는 별도 스키마 haru 에 만듭니다.
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  token_hash    TEXT NOT NULL UNIQUE,
  nickname      TEXT NOT NULL,
  color         INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  last_seen_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS videos (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_key   TEXT NOT NULL,
  mime          TEXT NOT NULL,
  size          INTEGER NOT NULL,
  source        TEXT NOT NULL CHECK (source IN ('upload', 'sample')),
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_videos_user ON videos(user_id);

CREATE TABLE IF NOT EXISTS diary_entries (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_date    TEXT NOT NULL,
  sentence      TEXT NOT NULL,
  video_id      TEXT NOT NULL REFERENCES videos(id),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE (user_id, entry_date)
);

CREATE TABLE IF NOT EXISTS wishes (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nickname      TEXT NOT NULL,
  place         TEXT NOT NULL CHECK (place IN ('rooftop', 'park')),
  source        TEXT NOT NULL CHECK (source IN ('tree', 'star')),
  star_id       TEXT,
  text          TEXT NOT NULL,
  is_public     INTEGER NOT NULL,
  on_tree       INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wishes_tree ON wishes(on_tree, created_at);
CREATE INDEX IF NOT EXISTS idx_wishes_user ON wishes(user_id);

CREATE TABLE IF NOT EXISTS wish_reactions (
  wish_id       TEXT NOT NULL REFERENCES wishes(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('empathy', 'cheer')),
  created_at    TEXT NOT NULL,
  PRIMARY KEY (wish_id, user_id, kind)
);

-- 이중 안전장치: 행 단위 보안을 켜고 정책을 두지 않아, 서버(소유자 역할) 외에는 읽을 수 없게 합니다.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE diary_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishes ENABLE ROW LEVEL SECURITY;
ALTER TABLE wish_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;
