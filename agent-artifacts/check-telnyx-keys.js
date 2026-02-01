const Database = require('better-sqlite3');
const db = new Database('/Users/nate/Library/CloudStorage/OneDrive-Personal/Computer Software/AutoDialer - Real Estate/backend/data/property_call.db');
const keys = db.prepare('SELECT service FROM api_keys').all();
console.log(JSON.stringify(keys, null, 2));
