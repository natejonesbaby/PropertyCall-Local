const db = require('better-sqlite3')('features.db');

const stats = db.prepare(`
  SELECT
    COUNT(*) as total,
    SUM(CASE WHEN passes = 1 THEN 1 ELSE 0 END) as passing,
    SUM(CASE WHEN in_progress = 1 THEN 1 ELSE 0 END) as in_progress,
    SUM(CASE WHEN skipped = 1 THEN 1 ELSE 0 END) as skipped
  FROM features
`).get();

console.log('Feature Statistics:');
console.log('-------------------');
console.log('Total features:', stats.total);
console.log('Passing:', stats.passing);
console.log('In Progress:', stats.in_progress);
console.log('Skipped:', stats.skipped);
console.log('Completion:', ((stats.passing / stats.total) * 100).toFixed(1) + '%');
