const Database = require('better-sqlite3');
const db = new Database('features.db');
const features = db.prepare('SELECT id, name, category, description, steps FROM features WHERE held = 1 ORDER BY priority').all();
console.log('HELD features (' + features.length + ' total):');
features.forEach(f => {
  console.log('\n--- Feature #' + f.id + ' ---');
  console.log('Name: ' + f.name);
  console.log('Category: ' + f.category);
  console.log('Description: ' + f.description);
  console.log('Steps: ' + f.steps);
});
db.close();
