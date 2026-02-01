const Database = require('better-sqlite3');
const db = new Database('backend/data/property_call.db');
const calls = db.prepare('SELECT id, status, qualification_status, sentiment, disposition FROM calls ORDER BY id DESC LIMIT 5').all();
console.log(JSON.stringify(calls, null, 2));
