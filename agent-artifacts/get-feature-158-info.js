const Database = require('better-sqlite3');
const db = new Database('./features.db', { readonly: true });

// Get feature #158 details
const feature = db.prepare('SELECT * FROM features WHERE id = 158').get();
console.log('=== FEATURE #158 ===');
console.log(JSON.stringify(feature, null, 2));

// Get stats
const total = db.prepare('SELECT COUNT(*) as count FROM features').get().count;
const passing = db.prepare("SELECT COUNT(*) as count FROM features WHERE passes = 'true'").get().count;
const inProgress = db.prepare("SELECT COUNT(*) as count FROM features WHERE in_progress = 'true' OR in_progress = 1").get().count;

console.log('\n=== FEATURE STATS ===');
console.log('Total:', total);
console.log('Passing:', passing);
console.log('In Progress:', inProgress);
console.log('Completion:', ((passing/total)*100).toFixed(1) + '%');

db.close();
