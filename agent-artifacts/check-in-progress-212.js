const Database = require('better-sqlite3');
const db = new Database('features.db');
const inProgress = db.prepare('SELECT id, name, passes, in_progress FROM features WHERE in_progress = 1').all();
console.log('In Progress Features:', inProgress);
const feature212 = db.prepare('SELECT id, name, passes, in_progress FROM features WHERE id = 212').get();
console.log('Feature #212:', feature212);
