const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./features.db');

db.all("SELECT id, priority, category, name, in_progress FROM features WHERE in_progress = 1 ORDER BY priority", [], (err, rows) => {
  if (err) {
    console.error('Error:', err);
    process.exit(1);
  }
  
  console.log('Currently In-Progress Features:');
  console.log('================================');
  rows.forEach(row => {
    console.log(`#${row.id} [${row.category}] ${row.name}`);
  });
  
  db.close();
});
