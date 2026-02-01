const sqlite3 = require('better-sqlite3');
const db = new sqlite3('features.db');

const result = db.prepare(`
  SELECT id, priority, category, name, description, steps, passes, in_progress, dependencies
  FROM features
  WHERE id = 34
`).get();

console.log(JSON.stringify(result, null, 2));
db.close();
