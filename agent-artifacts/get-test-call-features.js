const db = require('better-sqlite3')('./features.db');

// Get all Test Call related features
const features = db.prepare(`
  SELECT id, name, description, steps, passes
  FROM features
  WHERE name LIKE '%Test Call%' OR description LIKE '%Test Call%' OR description LIKE '%test call%'
  ORDER BY id
`).all();

console.log('Test Call Related Features:');
features.forEach(f => {
  console.log(`\n#${f.id}: ${f.name}`);
  console.log(`  Description: ${f.description}`);
  console.log(`  Steps: ${f.steps}`);
  console.log(`  Passes: ${f.passes}`);
});

db.close();
