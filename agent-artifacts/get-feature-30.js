const Database = require('better-sqlite3');
const db = new Database('features.db');
const result = db.prepare('SELECT * FROM features WHERE id = 30').get();
console.log(JSON.stringify(result, null, 2));
db.close();
