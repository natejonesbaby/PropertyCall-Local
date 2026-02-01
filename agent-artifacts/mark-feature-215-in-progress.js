const Database = require('better-sqlite3');
const db = new Database('features.db');

// Mark feature 215 as in-progress
db.prepare('UPDATE features SET in_progress = 1 WHERE id = 215').run();

const feature = db.prepare('SELECT id, name, in_progress FROM features WHERE id = 215').get();
console.log('Feature #215 marked as in-progress:');
console.log('- ID:', feature.id);
console.log('- Name:', feature.name);
console.log('- In Progress:', feature.in_progress);

db.close();
