const db = require('better-sqlite3')('features.db');

// Mark feature 209 as passing
const result = db.prepare('UPDATE features SET passes = 1, in_progress = 0 WHERE id = 209').run();
console.log('Updated rows:', result.changes);

// Verify
const feature = db.prepare('SELECT id, name, passes, in_progress FROM features WHERE id = 209').get();
console.log('Feature 209 status:', feature);
