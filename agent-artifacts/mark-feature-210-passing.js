const db = require('better-sqlite3')('./features.db');
db.prepare('UPDATE features SET passes = 1, in_progress = 0 WHERE id = 210').run();
console.log('Feature #210 marked as passing');
db.close();
