const Database = require('better-sqlite3');
const db = new Database('features.db', { readonly: true });

const feature = db.prepare('SELECT * FROM features WHERE id = 14').get();

if (feature) {
  console.log(JSON.stringify(feature, null, 2));
} else {
  console.log('Feature #14 not found');
}

db.close();
