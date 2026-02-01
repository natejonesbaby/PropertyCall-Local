const db = require('better-sqlite3')('features.db');
const f = db.prepare('SELECT * FROM features WHERE id = 48').get();
console.log(JSON.stringify(f, null, 2));
