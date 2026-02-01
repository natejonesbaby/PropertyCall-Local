const Database = require('./backend/node_modules/better-sqlite3');
const db = new Database('./features.db', { readonly: true });

const row = db.prepare("SELECT * FROM features WHERE id = 189").get();
if (row) {
  console.log(JSON.stringify(row, null, 2));
} else {
  console.log('Feature 189 not found');
}
db.close();
