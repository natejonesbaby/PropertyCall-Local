const Database = require('better-sqlite3');
const db = new Database('./features.db');

// Mark feature #219 as passing
const result = db.prepare('UPDATE features SET passes = 1, in_progress = 0 WHERE id = ?').run(219);
console.log('Feature #219 marked as passing:', result.changes > 0 ? 'SUCCESS' : 'FAILED');

// Get updated stats
const stats = db.prepare('SELECT COUNT(*) as total, SUM(CASE WHEN passes = 1 THEN 1 ELSE 0 END) as passing, SUM(CASE WHEN in_progress = 1 THEN 1 ELSE 0 END) as in_progress FROM features').get();
console.log('Stats:', stats);

db.close();
