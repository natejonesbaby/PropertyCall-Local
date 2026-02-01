const Database = require('better-sqlite3');
const db = new Database('features.db');
const feature = db.prepare('SELECT * FROM features WHERE id = 199').get();
console.log(JSON.stringify(feature, null, 2));
