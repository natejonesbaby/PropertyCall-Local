const Database = require('better-sqlite3');
const db = new Database('/Users/nate/Library/CloudStorage/OneDrive-Personal/Computer Software/AutoDialer - Real Estate/features.db');

const stats = db.prepare(`
  SELECT
    COUNT(*) as total,
    SUM(CASE WHEN passes = 1 THEN 1 ELSE 0 END) as passing,
    SUM(CASE WHEN in_progress = 1 THEN 1 ELSE 0 END) as in_progress,
    SUM(CASE WHEN skipped = 1 THEN 1 ELSE 0 END) as skipped
  FROM features
`).get();

console.log('Feature Statistics:');
console.log('- Total:', stats.total);
console.log('- Passing:', stats.passing);
console.log('- In Progress:', stats.in_progress);
console.log('- Skipped:', stats.skipped);
console.log('- Pending:', stats.total - stats.passing - stats.skipped);
