// 데이터베이스 어댑터: DATABASE_URL이 있으면 PostgreSQL(Supabase), 없으면 DATA_DIR의 SQLite.
// 모든 쿼리는 '?' 자리표시자를 쓰고, 두 DB에서 같은 SQL이 동작하도록 작성합니다.
import fs from 'node:fs';
import path from 'node:path';
import { config, PATHS } from './config.js';

let db = null;

export const nowIso = () => new Date().toISOString();

function migrationFiles(dir) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
    .map((f) => ({ name: f, sql: fs.readFileSync(path.join(dir, f), 'utf8') }));
}

// ───────── SQLite (로컬 개발 기본값) ─────────
async function openSqlite(file) {
  const { DatabaseSync } = await import('node:sqlite');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const d = new DatabaseSync(file);
  d.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  d.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const done = new Set(d.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version));
  for (const m of migrationFiles(path.join(PATHS.migrations, 'sqlite'))) {
    if (done.has(m.name)) continue;
    d.exec('BEGIN');
    try {
      d.exec(m.sql);
      d.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(m.name, nowIso());
      d.exec('COMMIT');
      console.log(`[db] sqlite migration applied: ${m.name}`);
    } catch (e) { d.exec('ROLLBACK'); throw e; }
  }
  const plain = (r) => (r ? { ...r } : r);
  return {
    kind: 'sqlite',
    async get(sql, params = []) { return plain(d.prepare(sql).get(...params)); },
    async all(sql, params = []) { return d.prepare(sql).all(...params).map(plain); },
    async run(sql, params = []) { const r = d.prepare(sql).run(...params); return { changes: Number(r.changes) }; },
    async close() { d.close(); },
  };
}

// ───────── PostgreSQL (Supabase, 배포용) ─────────
function toPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => '$' + String(++i));
}
// COUNT/SUM 결과(bigint 문자열)를 숫자로
function normalize(row) {
  if (!row) return row;
  for (const k of Object.keys(row)) if (typeof row[k] === 'string' && /^(count|n|mine)$/.test(k)) row[k] = Number(row[k]);
  return row;
}

async function openPostgres(url) {
  const { default: pg } = await import('pg');
  const SCHEMA = 'haru';
  const local = /@(localhost|127\.0\.0\.1)(:|\/)/.test(url);
  const pool = new pg.Pool({
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
    ssl: local ? false : { rejectUnauthorized: false },
  });
  pool.on('connect', (c) => { c.query(`SET search_path TO ${SCHEMA}`).catch(() => {}); });
  pool.on('error', (e) => console.error('[db] postgres pool error:', e.message));
  const client = await pool.connect();
  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
    await client.query(`SET search_path TO ${SCHEMA}`);
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
    const done = new Set((await client.query('SELECT version FROM schema_migrations')).rows.map((r) => r.version));
    for (const m of migrationFiles(path.join(PATHS.migrations, 'postgres'))) {
      if (done.has(m.name)) continue;
      await client.query('BEGIN');
      try {
        await client.query(m.sql);
        await client.query('INSERT INTO schema_migrations (version, applied_at) VALUES ($1, $2)', [m.name, nowIso()]);
        await client.query('COMMIT');
        console.log(`[db] postgres migration applied: ${m.name}`);
      } catch (e) { await client.query('ROLLBACK'); throw e; }
    }
  } finally { client.release(); }
  // 새 연결마다 'connect' 이벤트의 SET search_path가 먼저 대기열에 들어가므로, 이후 쿼리는 haru 스키마를 씁니다.
  const q = (sql, params) => pool.query(toPg(sql), params);
  return {
    kind: 'postgres',
    async get(sql, params = []) { return normalize((await q(sql, params)).rows[0]); },
    async all(sql, params = []) { return (await q(sql, params)).rows.map(normalize); },
    async run(sql, params = []) { return { changes: (await q(sql, params)).rowCount }; },
    async close() { await pool.end(); },
  };
}

/** 서버 시작 시 한 번 호출 (마이그레이션 포함) */
export async function initDb() {
  if (db) return db;
  if (!config.databaseUrl) {
    db = await openSqlite(PATHS.db);
    return db;
  }
  // 절전에서 깨어날 때 외부 DB 연결이 잠깐 실패할 수 있어 몇 번 다시 시도합니다.
  // (조용히 SQLite로 바꾸면 '보존된다'는 착각을 줄 수 있으므로, 끝내 실패하면 시작을 멈춥니다.)
  for (let attempt = 1; ; attempt++) {
    try {
      db = await openPostgres(config.databaseUrl);
      return db;
    } catch (e) {
      const hint = /password|authentication/i.test(e.message) ? ' (DATABASE_URL의 비밀번호를 확인하세요)'
        : /ENOTFOUND|ENETUNREACH|EAI_AGAIN/i.test(e.message) ? ' (Supabase의 Session pooler 주소인지 확인하세요)' : '';
      console.error(`[db] PostgreSQL 연결 실패 ${attempt}/5: ${e.message}${hint}`);
      if (attempt >= 5) throw e;
      await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }
}

export function getDb() {
  if (!db) throw new Error('DB가 아직 초기화되지 않았어요 (initDb 먼저 호출)');
  return db;
}
