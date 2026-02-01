const db = require('better-sqlite3')('backend/data/property_call.db');
// First let's see what columns exist in api_keys
const tableInfo = db.prepare("PRAGMA table_info(api_keys)").all();
console.log("Table schema:", JSON.stringify(tableInfo, null, 2));

const rows = db.prepare('SELECT * FROM api_keys WHERE user_id = 1').all();
console.log("API Keys:", JSON.stringify(rows, null, 2));
