process.chdir('/Users/nate/Library/CloudStorage/OneDrive-Personal/Computer Software/AutoDialer - Real Estate/backend');
const Database = require('better-sqlite3');
const db = new Database('../features.db');
const feature = db.prepare('SELECT * FROM features WHERE id = 148').get();
console.log(JSON.stringify(feature, null, 2));
db.close();
