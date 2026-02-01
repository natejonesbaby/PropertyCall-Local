const Database = require('better-sqlite3');
const db = new Database('./features.db');

// Mark feature #213 as passing
const result = db.prepare("UPDATE features SET passes = 1, in_progress = 0 WHERE id = 213").run();
console.log('Updated rows:', result.changes);

// Verify the update
const feature = db.prepare("SELECT id, name, passes, in_progress FROM features WHERE id = 213").get();
console.log('Feature #213:', feature);

db.close();
