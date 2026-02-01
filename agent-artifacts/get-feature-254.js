
const Database = require('better-sqlite3');
const db = new Database('features.db', { readonly: true });

const result = db.prepare(`
  SELECT id, priority, category, name, description, steps, passes, in_progress, dependencies
  FROM features
  WHERE id = 254
`).get();

if (result) {
  result.steps = JSON.parse(result.steps);
  result.dependencies = JSON.parse(result.dependencies || '[]');
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log('Feature #254 not found');
}

db.close();

