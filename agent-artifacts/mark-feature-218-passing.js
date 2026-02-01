const Database = require('better-sqlite3');
const db = new Database('features.db');

// Mark feature #218 as passing
db.prepare('UPDATE features SET passes = 1, in_progress = 0 WHERE id = 218').run();

// Verify the update
const feature = db.prepare('SELECT id, name, passes, in_progress FROM features WHERE id = 218').get();
console.log('Feature #218 updated:');
console.log(JSON.stringify(feature, null, 2));

db.close();
