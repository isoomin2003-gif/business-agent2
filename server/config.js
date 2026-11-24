import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// .env 파일이 있으면 읽습니다(의존성 없이 간단히). 이미 설정된 환경변수가 우선합니다.
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const num = (v, d) => (v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d);

export const config = {
  port: num(process.env.PORT, 3000),
  dataDir: path.resolve(ROOT, process.env.DATA_DIR || 'data'),
  publicUrl: process.env.PUBLIC_URL || '',
  adminKey: process.env.ADMIN_KEY || '',
  maxVideoMb: num(process.env.MAX_VIDEO_MB, 80),
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY || '',
    model: process.env.OPENROUTER_MODEL || 'anthropic/claude-haiku-5.5',
    baseUrl: (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, ''),
    timeoutMs: num(process.env.OPENROUTER_TIMEOUT_MS, 20000),
  },
  star: {
    minSec: num(process.env.STAR_MIN_SEC, 150),
    maxSec: num(process.env.STAR_MAX_SEC, 420),
  },
  secureCookie: process.env.NODE_ENV === 'production',
  // 영구 보존용 외부 저장소 (없으면 DATA_DIR의 SQLite + 로컬 디스크 사용)
  databaseUrl: process.env.DATABASE_URL || '',
  supabase: {
    url: (process.env.SUPABASE_URL || '').replace(/\/$/, ''),
    secretKey: process.env.SUPABASE_SECRET_KEY || '',
    bucket: process.env.SUPABASE_BUCKET || 'diary-videos',
  },
};

export const PATHS = {
  db: path.join(config.dataDir, 'haru.sqlite'),
  videos: path.join(config.dataDir, 'videos'),
  tmp: path.join(config.dataDir, 'tmp'),
  samples: path.join(ROOT, 'public', 'media', 'samples'),
  migrations: path.join(ROOT, 'migrations'),
  public: path.join(ROOT, 'public'),
};
