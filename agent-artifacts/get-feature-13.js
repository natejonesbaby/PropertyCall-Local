const sqlite = require('better-sqlite3');
const db = sqlite('./features.db');
const feature = db.prepare('SELECT * FROM features WHERE id = 13').get();
console.log(JSON.stringify(feature, null, 2));
