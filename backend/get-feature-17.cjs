const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.resolve(__dirname, '..', 'features.db');
console.log('DB Path:', dbPath);
const db = new Database(dbPath);
const f = db.prepare('SELECT * FROM features WHERE id = 17').get();
console.log(JSON.stringify(f, null, 2));
