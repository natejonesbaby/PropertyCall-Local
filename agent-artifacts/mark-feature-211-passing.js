const Database = require('better-sqlite3');
const db = new Database('/Users/nate/Library/CloudStorage/OneDrive-Personal/Computer Software/AutoDialer - Real Estate/features.db');

// Mark feature #211 as passing and clear in_progress
const result = db.prepare('UPDATE features SET passes = 1, in_progress = 0 WHERE id = 211').run();
console.log('Updated rows:', result.changes);

// Verify the update
const feature = db.prepare('SELECT id, name, passes, in_progress FROM features WHERE id = 211').get();
console.log('Feature #211 after update:', feature);

// Get updated stats
const stats = db.prepare('SELECT COUNT(*) as total, SUM(CASE WHEN passes = 1 THEN 1 ELSE 0 END) as passing, SUM(CASE WHEN in_progress = 1 THEN 1 ELSE 0 END) as in_progress FROM features').get();
console.log('Stats:', stats);

db.close();
