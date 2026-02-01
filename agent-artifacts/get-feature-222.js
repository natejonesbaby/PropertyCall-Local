const Database = require('better-sqlite3');
const db = new Database('features.db');

// Get feature #222
const feature = db.prepare('SELECT * FROM features WHERE id = 222').get();
console.log('Feature #222:', JSON.stringify(feature, null, 2));

// Also get stats
const stats = db.prepare(`
  SELECT
    COUNT(*) as total,
    SUM(CASE WHEN passes = 1 THEN 1 ELSE 0 END) as passing,
    SUM(CASE WHEN in_progress = 1 THEN 1 ELSE 0 END) as in_progress
  FROM features
`).get();
console.log('\nStats:', stats);

db.close();
