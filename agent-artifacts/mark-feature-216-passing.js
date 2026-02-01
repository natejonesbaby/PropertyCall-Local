const Database = require('better-sqlite3');
const db = new Database('features.db');

// Mark feature #216 as passing
db.prepare('UPDATE features SET passes = 1, in_progress = 0 WHERE id = 216').run();

// Verify the update
const feature = db.prepare('SELECT id, name, passes, in_progress FROM features WHERE id = 216').get();
console.log('Feature #216 updated:', JSON.stringify(feature, null, 2));

db.close();
