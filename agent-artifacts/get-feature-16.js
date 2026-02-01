const sqlite3 = require('better-sqlite3');
const db = sqlite3('./features.db');
const row = db.prepare('SELECT * FROM features WHERE id = 16').get();
console.log(JSON.stringify(row, null, 2));
