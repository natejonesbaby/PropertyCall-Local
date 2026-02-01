const Database = require('better-sqlite3');
const db = new Database('/Users/nate/Library/CloudStorage/OneDrive-Personal/Computer Software/AutoDialer - Real Estate/features.db');

// Get max priority for skipping to end of queue
const maxPriority = db.prepare('SELECT MAX(priority) as max FROM features').get();
const newPriority = (maxPriority.max || 0) + 1000;

// Skip feature 211 - move to end of queue
db.prepare('UPDATE features SET skipped = 1, in_progress = 0, priority = ? WHERE id = 211').run(newPriority);

console.log('Feature #211 skipped');
console.log('New priority:', newPriority);

// Verify
const feature = db.prepare('SELECT id, name, skipped, in_progress, priority FROM features WHERE id = 211').get();
console.log('Updated feature:', feature);

db.close();
