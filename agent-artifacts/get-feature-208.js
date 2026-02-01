const sqlite3 = require('better-sqlite3');
const db = sqlite3('features.db');
const feature = db.prepare('SELECT * FROM features WHERE id = ?').get(208);
console.log(JSON.stringify(feature, null, 2));
db.close();
