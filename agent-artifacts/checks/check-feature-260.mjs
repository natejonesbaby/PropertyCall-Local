import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'features.db');
const db = new Database(dbPath);

const feature = db.prepare('SELECT * FROM features WHERE id = 260').get();

if (feature) {
  console.log(JSON.stringify(feature, null, 2));
} else {
  console.log('Feature #260 not found');
}

db.close();
