const Database = require("better-sqlite3");
const db = new Database("/Users/nate/Library/CloudStorage/OneDrive-Personal/Computer Software/AutoDialer - Real Estate/features.db");
const r = db.prepare("SELECT SUM(CASE WHEN passes = 1 THEN 1 ELSE 0 END) as passing, SUM(CASE WHEN in_progress = 1 THEN 1 ELSE 0 END) as in_progress, COUNT(*) as total FROM features").get();
console.log(JSON.stringify(r));
db.close();
