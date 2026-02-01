const Database = require('better-sqlite3');
const db = new Database('features.db', { readonly: true });

const feature = db.prepare('SELECT * FROM features WHERE id = 24').get();

if (feature) {
  console.log(JSON.stringify(feature, null, 2));
} else {
  console.log('Feature #24 not found');
}

db.close();
