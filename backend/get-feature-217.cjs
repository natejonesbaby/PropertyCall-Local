const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('../features.db');

db.get('SELECT id, category, name, description, passes, in_progress, priority, steps FROM features WHERE id = 217', (err, row) => {
  if (err) {
    console.error(err);
  } else {
    console.log(JSON.stringify(row, null, 2));
  }
  db.close();
});
