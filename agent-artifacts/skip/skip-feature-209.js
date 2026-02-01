const Database = require('better-sqlite3');
const db = new Database('/Users/nate/Library/CloudStorage/OneDrive-Personal/Computer Software/AutoDialer - Real Estate/features.db');

// Skip feature 209 - move to end of queue
const maxPriority = db.prepare('SELECT MAX(priority) as max FROM features').get();
const newPriority = (maxPriority?.max || 0) + 1000;

db.prepare('UPDATE features SET priority = ?, skipped = 1, in_progress = 0 WHERE id = ?').run(newPriority, 209);

console.log('Feature #209 skipped and moved to end of queue');
console.log('New priority:', newPriority);

// Verify
const feature = db.prepare('SELECT id, name, priority, skipped, in_progress FROM features WHERE id = 209').get();
console.log('Updated feature:', feature);
