const Database = require('better-sqlite3');
const db = new Database('features.db');
const deps = [219, 220, 221];
deps.forEach(id => {
  const feature = db.prepare('SELECT id, name, passes, in_progress FROM features WHERE id = ?').get(id);
  console.log(`Feature ${id}: passes=${feature.passes}, in_progress=${feature.in_progress}, name="${feature.name}"`);
});
db.close();
