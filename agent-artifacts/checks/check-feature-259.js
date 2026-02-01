const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'features.db');
const db = new Database(dbPath, { readonly: true });

const feature = db.prepare('SELECT * FROM features WHERE id = 259').get();

if (feature) {
  console.log(JSON.stringify(feature, null, 2));
} else {
  console.log('Feature #259 not found');
  console.log('\nSearching for feature with priority that would give us #259...');
  const allFeatures = db.prepare('SELECT id, priority, name, in_progress FROM features ORDER BY priority').all();
  const feature259 = allFeatures.find(f => f.id === 259);
  if (feature259) {
    console.log(JSON.stringify(feature259, null, 2));
  }
}

db.close();
