import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'features.db');
const db = new Database(dbPath);
const row = db.prepare('SELECT * FROM features WHERE id = 186').get();
console.log(JSON.stringify(row, null, 2));
db.close();
