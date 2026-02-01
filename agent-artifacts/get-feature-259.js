const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'features.db');
const db = new Database(dbPath, { readonly: true });

const feature = db.prepare('SELECT * FROM features WHERE id = 259').get();

if (feature) {
  console.log('Feature #259:');
  console.log('  Name:', feature.name);
  console.log('  Category:', feature.category);
  console.log('  Description:', feature.description);
  console.log('  Steps:', feature.steps);
  console.log('  Passes:', feature.passes);
  console.log('  In Progress:', feature.in_progress);
  console.log('  Dependencies:', feature.dependencies);
} else {
  console.log('Feature #259 not found');
}

db.close();
