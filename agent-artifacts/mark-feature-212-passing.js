const Database = require('better-sqlite3');
const db = new Database('features.db');
db.prepare('UPDATE features SET passes = 1, in_progress = 0 WHERE id = 212').run();
console.log('Feature #212 marked as passing');
const feature = db.prepare('SELECT id, name, passes, in_progress FROM features WHERE id = 212').get();
console.log(feature);
