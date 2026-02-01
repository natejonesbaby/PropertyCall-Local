const db = require('better-sqlite3')('features.db');
const inProgress = db.prepare('SELECT id, name FROM features WHERE in_progress = 1').all();
console.log('In Progress Features:');
inProgress.forEach(f => console.log(`  #${f.id}: ${f.name}`));
