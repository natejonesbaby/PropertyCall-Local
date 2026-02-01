const Database = require('better-sqlite3');
const path = require('path');

// Check features.db
const dbPath = path.join(__dirname, 'features.db');
const db = new Database(dbPath);

// Get feature #160
const feature = db.prepare('SELECT * FROM features WHERE id = 160').get();
console.log('Feature #160:', JSON.stringify(feature, null, 2));
