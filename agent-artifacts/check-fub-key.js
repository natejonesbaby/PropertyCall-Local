const Database = require('better-sqlite3');
const db = new Database('./backend/data/property_call.db');

const keys = db.prepare("SELECT id, user_id, service, substr(api_key_encrypted, 1, 30) as key_preview FROM api_keys").all();

console.log('API Keys in database:');
console.log(JSON.stringify(keys, null, 2));

// Also check user ID 1
const userKeys = db.prepare("SELECT * FROM api_keys WHERE user_id = 1").all();
console.log('\nUser ID 1 API keys:');
console.log(JSON.stringify(userKeys, null, 2));
