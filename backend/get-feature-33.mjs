import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'features.db');
const db = new Database(dbPath);

const row = db.prepare("SELECT * FROM features WHERE id = 33").get();

if (row) {
  console.log(JSON.stringify(row, null, 2));
} else {
  console.log('Feature #33 not found');
}

db.close();
