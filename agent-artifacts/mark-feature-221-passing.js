const Database = require('./backend/node_modules/better-sqlite3');
const db = new Database('./features.db');
const result = db.prepare('UPDATE features SET passes = 1, in_progress = 0 WHERE id = 221').run();
console.log('Updated rows:', result.changes);
const row = db.prepare('SELECT id, name, passes, in_progress FROM features WHERE id = 221').get();
console.log('Feature status:', JSON.stringify(row, null, 2));
db.close();
