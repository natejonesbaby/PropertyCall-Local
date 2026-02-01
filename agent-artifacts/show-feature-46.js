const Database = require('./node_modules/better-sqlite3');
const db = new Database('./features.db');

const row = db.prepare('SELECT id, category, name, description, steps FROM features WHERE id = 46').get();

if (row) {
  console.log('='.repeat(80));
  console.log('FEATURE #46');
  console.log('='.repeat(80));
  console.log('ID:', row.id);
  console.log('Category:', row.category);
  console.log('Name:', row.name);
  console.log('Description:', row.description);
  console.log('\nSteps:');
  console.log(row.steps);
} else {
  console.log('Feature #46 not found');
}

db.close();
