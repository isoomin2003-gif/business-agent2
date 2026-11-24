import { initDb } from './db.js';

const db = await initDb();
console.log(`[db] ready (${db.kind})`);
await db.close();
