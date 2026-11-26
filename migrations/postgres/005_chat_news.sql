-- AI와 나누는 짧은 대화: 하루 최대 2개의 질문과 답 (한국 시간 기준 날짜·주차)
CREATE TABLE IF NOT EXISTS chat_turns (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start    TEXT NOT NULL,             -- 그 주 일요일 (KST)
  day           TEXT NOT NULL,             -- 대화한 날 (KST)
  seq           INTEGER NOT NULL,          -- 그날의 몇 번째 질문 (1 또는 2)
  greeting      TEXT,
  question      TEXT NOT NULL,
  answer        TEXT,
  status        TEXT NOT NULL,             -- asked | answered | skipped
  created_at    TEXT NOT NULL,
  answered_at   TEXT,
  UNIQUE (user_id, day, seq)
);
CREATE INDEX IF NOT EXISTS idx_chat_turns_week ON chat_turns(user_id, week_start);

-- 주마다 AI가 새로 정한 첫 주제 (비슷한 주제가 연달아 나오지 않게 참고)
CREATE TABLE IF NOT EXISTS chat_weeks (
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start    TEXT NOT NULL,
  topic         TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  PRIMARY KEY (user_id, week_start)
);

-- 나만의 주간신문: 사용자·주차마다 한 줄 (발행 또는 건너뜀). 같은 주에 두 번 생기지 않도록 유일
CREATE TABLE IF NOT EXISTS newspapers (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start    TEXT NOT NULL,             -- 대화한 주 (일요일)
  issue_date    TEXT NOT NULL,             -- 발행일 = 다음 일요일 (월호는 이 날짜 기준)
  publish_at    TEXT NOT NULL,             -- 발행 시각 (UTC ISO, 일요일 18:00 KST)
  status        TEXT NOT NULL,             -- published | skipped
  skip_reason   TEXT,
  title         TEXT,
  body          TEXT,
  reason        TEXT,                      -- 이번 주에 이 주제를 고른 이유 한 줄
  question      TEXT,                      -- 기사로 답한 질문
  sources       TEXT,                      -- JSON [{title, url}]
  created_at    TEXT NOT NULL,
  UNIQUE (user_id, week_start)
);
CREATE INDEX IF NOT EXISTS idx_newspapers_user ON newspapers(user_id, issue_date);
ALTER TABLE chat_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE newspapers ENABLE ROW LEVEL SECURITY;
