const Database = require('better-sqlite3');
const db = new Database('features.db');
const feature = db.prepare('SELECT id, passes FROM features WHERE id = 154').get();
console.log(JSON.stringify(feature));
db.close();
