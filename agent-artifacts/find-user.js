const Database = require('better-sqlite3');
const db = new Database('backend/data/property_call.db');
const users = db.prepare('SELECT id, email FROM users').all();
console.log('Users:', JSON.stringify(users, null, 2));
db.close();
