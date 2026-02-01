const Database = require('better-sqlite3');
const db = new Database('/Users/nate/Library/CloudStorage/OneDrive-Personal/Computer Software/AutoDialer - Real Estate/features.db');
const feature = db.prepare('SELECT * FROM features WHERE id = 209').get();
console.log(JSON.stringify(feature, null, 2));
db.close();
