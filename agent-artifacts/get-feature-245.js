const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./features.db');

db.get("SELECT * FROM features WHERE id = 245", (err, row) => {
  if (err) {
    console.error('Error:', err);
    process.exit(1);
  }
  
  if (row) {
    console.log('Feature #245:');
    console.log('Category:', row.category);
    console.log('Name:', row.name);
    console.log('Description:', row.description);
    console.log('Steps:', row.steps);
    console.log('Passing:', row.passes);
    console.log('In Progress:', row.in_progress);
  } else {
    console.log('Feature #245 not found');
  }
  
  db.close();
});
