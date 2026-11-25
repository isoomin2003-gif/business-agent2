-- 소원 나무 쪽지 자리: 나무에 건 순서 번호 (26번째 쪽지가 가장 오래된 쪽지 자리에 달리도록 자리 = (번호-1) % 25)
ALTER TABLE wishes ADD COLUMN tree_seq INTEGER;
UPDATE wishes SET tree_seq = (SELECT COUNT(*) FROM wishes w2 WHERE w2.on_tree = 1 AND w2.created_at <= wishes.created_at) WHERE on_tree = 1;
CREATE INDEX idx_wishes_tree_recent ON wishes(on_tree, is_public, created_at);

-- 내가 만든 노래: AI 작곡 결과(음원은 저장소, 곡 정보는 여기). 라디오에 신청하지 않은 곡도 보관
CREATE TABLE compositions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prompt        TEXT NOT NULL,             -- 작곡할 때 입력한 문장·단어 (만든 사람에게만 보임)
  title         TEXT,
  mood          TEXT,
  bpm           INTEGER,
  music_key     TEXT,
  scale         TEXT,
  lead          TEXT,
  duration_ms   INTEGER NOT NULL,
  storage_key   TEXT NOT NULL,
  created_at    TEXT NOT NULL
);
CREATE INDEX idx_compositions_user ON compositions(user_id, created_at);
