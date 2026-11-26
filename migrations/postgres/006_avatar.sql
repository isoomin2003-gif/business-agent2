-- 아바타 꾸미기: 머리·맨투맨 색·하의 조합을 계정에 저장 (JSON {"hair":0,"top":0,"bottom":0}, 고른 적 없으면 NULL = 기본 착장)
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT;
