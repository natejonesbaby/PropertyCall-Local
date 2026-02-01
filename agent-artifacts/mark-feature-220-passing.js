const sqlite3 = require('better-sqlite3');
const db = new sqlite3('./features.db');

// Mark feature 220 as passing and clear in_progress
db.prepare('UPDATE features SET passes = 1, in_progress = 0 WHERE id = 220').run();

// Verify
const row = db.prepare('SELECT id, name, passes, in_progress FROM features WHERE id = 220').get();
console.log('Feature #220 updated:', row);

db.close();
