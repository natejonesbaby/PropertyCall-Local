const Database = require('better-sqlite3');
const db = new Database('features.db');
const stats = db.prepare(`
  SELECT
    COUNT(*) as total,
    SUM(CASE WHEN passes = 1 THEN 1 ELSE 0 END) as passing,
    SUM(CASE WHEN in_progress = 1 THEN 1 ELSE 0 END) as in_progress,
    SUM(CASE WHEN passes = 0 AND in_progress = 0 AND skipped = 0 THEN 1 ELSE 0 END) as pending,
    SUM(CASE WHEN skipped = 1 THEN 1 ELSE 0 END) as skipped
  FROM features
`).get();
console.log('Feature Statistics:', stats);
console.log('Completion:', ((stats.passing / stats.total) * 100).toFixed(1) + '%');
