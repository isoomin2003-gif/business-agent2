import { openDb } from './db.js';
import { PATHS } from './config.js';
openDb();
console.log(`[db] ready: ${PATHS.db}`);
