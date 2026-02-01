const sqlite3 = require('better-sqlite3');
const path = require('path');

const db = sqlite3(path.join(__dirname, 'backend', 'data', 'property_call.db'));

// Test date comparisons in SQLite
const tests = [
  // ISO 8601 with T and Z - typical JavaScript toISOString() format
  "SELECT '2026-01-22T05:00:00.000Z' > datetime('now') as result, '2026-01-22T05:00:00.000Z' as a, datetime('now') as b",
  // ISO 8601 without T (uses space) - SQLite datetime format
  "SELECT '2026-01-22 05:00:00' > datetime('now') as result, '2026-01-22 05:00:00' as a, datetime('now') as b",
  // Current time variants
  "SELECT datetime('now') as sqlite_now, datetime('now', 'localtime') as local_now",
];

console.log('Testing SQLite date comparisons:\n');

tests.forEach((sql, i) => {
  const result = db.prepare(sql).get();
  console.log(`Test ${i+1}:`);
  console.log(`  SQL: ${sql}`);
  console.log(`  Result:`, result);
  console.log('');
});

// Show that 'T' > ' ' in ASCII
console.log('ASCII comparison:');
console.log(`  'T'.charCodeAt(0) = ${'T'.charCodeAt(0)}`);  // 84
console.log(`  ' '.charCodeAt(0) = ${' '.charCodeAt(0)}`);  // 32
console.log(`  'T' > ' ' = ${'T' > ' '}`);  // true

// The fix: use datetime() function to normalize the stored date
console.log('\nSolution - use datetime() to normalize:');
const normalizeTest = db.prepare(`
  SELECT datetime('2026-01-22T05:00:00.000Z') > datetime('now') as result,
         datetime('2026-01-22T05:00:00.000Z') as normalized_stored,
         datetime('now') as current
`).get();
console.log('  Result:', normalizeTest);
