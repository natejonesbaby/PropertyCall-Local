const Database = require('better-sqlite3');
const db = new Database('backend/data/property_call.db');

const call = db.prepare('SELECT * FROM calls WHERE id = 62').get();
console.log('Call 62:', JSON.stringify(call, null, 2));
