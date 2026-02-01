const Database = require('./backend/node_modules/better-sqlite3');
const db = new Database('./backend/data/property_call.db');
const keys = db.prepare('SELECT service, api_key_encrypted FROM api_keys WHERE user_id = 1').all();
console.log('API Keys in database:');
keys.forEach(k => console.log('- ' + k.service + ': ' + (k.api_key_encrypted ? 'configured (' + k.api_key_encrypted.substring(0, 10) + '...)' : 'empty')));
db.close();
