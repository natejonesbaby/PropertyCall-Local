const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.resolve(__dirname, '../features.db');
const db = new Database(dbPath);
const feature129 = db.prepare('SELECT id, name, passes FROM features WHERE id = 129').get();
console.log('Feature #129:', JSON.stringify(feature129, null, 2));
db.close();
