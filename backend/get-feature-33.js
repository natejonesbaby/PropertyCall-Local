const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'features.db');
const db = new sqlite3.Database(dbPath);

db.get("SELECT * FROM features WHERE id = 33", (err, row) => {
  if (err) {
    console.error('Error:', err);
  } else if (row) {
    console.log(JSON.stringify(row, null, 2));
  } else {
    console.log('Feature #33 not found');
  }
  db.close();
});
