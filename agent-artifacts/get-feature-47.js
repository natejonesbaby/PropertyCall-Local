const Database = require('/Users/nate/Library/CloudStorage/OneDrive-Personal/Computer Software/AutoDialer - Real Estate/backend/node_modules/better-sqlite3');
const db = new Database('/Users/nate/Library/CloudStorage/OneDrive-Personal/Computer Software/AutoDialer - Real Estate/features.db');
const feature = db.prepare('SELECT * FROM features WHERE id = ?').get(47);
console.log(JSON.stringify(feature, null, 2));
db.close();
