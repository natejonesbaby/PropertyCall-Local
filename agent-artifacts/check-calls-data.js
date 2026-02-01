const Database = require('better-sqlite3');
const db = new Database('./backend/data/property_call.db');

// Check what calls exist and their dispositions
const calls = db.prepare(`
  SELECT c.id, c.disposition, c.qualification_status, c.status,
         l.first_name, l.last_name
  FROM calls c
  LEFT JOIN leads l ON c.lead_id = l.id
  ORDER BY c.created_at DESC
  LIMIT 30
`).all();

console.log('=== Calls in Database ===');
console.log(`Total calls found: ${calls.length}`);
console.log('\nBy disposition:');
calls.forEach(c => {
  console.log(`  - ID ${c.id}: ${c.first_name} ${c.last_name} | Disposition: ${c.disposition || 'null'} | Status: ${c.qualification_status || 'null'}`);
});

// Count by disposition
const dispositionCounts = db.prepare(`
  SELECT disposition, COUNT(*) as count
  FROM calls
  GROUP BY disposition
  ORDER BY count DESC
`).all();

console.log('\n=== Disposition Counts ===');
dispositionCounts.forEach(d => {
  console.log(`  ${d.disposition || 'null'}: ${d.count}`);
});

// Count by qualification_status
const qualificationCounts = db.prepare(`
  SELECT qualification_status, COUNT(*) as count
  FROM calls
  GROUP BY qualification_status
  ORDER BY count DESC
`).all();

console.log('\n=== Qualification Status Counts ===');
qualificationCounts.forEach(q => {
  console.log(`  ${q.qualification_status || 'null'}: ${q.count}`);
});

db.close();
