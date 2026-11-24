-- 옥상 라디오에 신청되어 추가된 곡 (외부 음원 추천 → 신청, 이후 AI 작곡곡도 같은 표 사용)
-- 신청된 곡은 다시 추천하지 않고, 출처·라이선스·저작자 표시 문구를 함께 보관합니다.
CREATE TABLE IF NOT EXISTS radio_tracks (
  id            TEXT PRIMARY KEY,          -- 'ov:<Openverse id>' 등
  kind          TEXT NOT NULL,             -- 'external' | 'generated'
  source        TEXT NOT NULL,             -- 예: jamendo, wikimedia_audio
  title         TEXT NOT NULL,
  artist        TEXT NOT NULL,
  audio_url     TEXT NOT NULL,
  source_url    TEXT NOT NULL,             -- 원본 배포 페이지
  license       TEXT NOT NULL,             -- 예: by, by-sa, cc0
  license_version TEXT,
  license_url   TEXT,
  attribution   TEXT,                      -- 저작자 표시 문구
  duration_ms   INTEGER NOT NULL,
  genres        TEXT,
  tags          TEXT,
  requested_by  TEXT,
  created_at    TEXT NOT NULL
);
