const Database = require('better-sqlite3');
const db = new Database('./backend/data/property_call.db');

const keys = db.prepare("SELECT key, CASE WHEN value IS NOT NULL AND LENGTH(value) > 0 THEN 'configured' ELSE 'not configured' END as status FROM settings WHERE key LIKE '%api_key%'").all();

console.log('API Keys Status:');
console.log(JSON.stringify(keys, null, 2));
