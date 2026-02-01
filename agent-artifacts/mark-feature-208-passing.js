const db = require('better-sqlite3')('features.db');
db.prepare('UPDATE features SET passes = 1, in_progress = 0 WHERE id = 208').run();
const f = db.prepare('SELECT * FROM features WHERE id = 208').get();
console.log('Feature #208 updated:');
console.log(JSON.stringify(f, null, 2));
