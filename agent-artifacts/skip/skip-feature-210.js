const Database = require('better-sqlite3');
const db = new Database('features.db');

// Skip feature 210 - dock functionality is outside project scope
const maxPriority = db.prepare('SELECT MAX(priority) as max FROM features').get().max || 0;
const newPriority = maxPriority + 1000;

db.prepare('UPDATE features SET skipped = 1, in_progress = 0, priority = ? WHERE id = 210').run(newPriority);

console.log('Feature #210 skipped and moved to end of queue (priority:', newPriority, ')');

// Verify
const feature = db.prepare('SELECT id, name, skipped, in_progress, priority FROM features WHERE id = 210').get();
console.log('Updated feature:', JSON.stringify(feature, null, 2));

db.close();
