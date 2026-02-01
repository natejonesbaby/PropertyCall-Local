const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'features.db'));

const result = db.prepare(`
  SELECT id, priority, category, name, description, steps, passes, in_progress, skipped, held, dependencies
  FROM features
  WHERE id = 250
`).get();

console.log(JSON.stringify(result, null, 2));

db.close();
