const Database = require("better-sqlite3");
const db = new Database("/Users/nate/Library/CloudStorage/OneDrive-Personal/Computer Software/AutoDialer - Real Estate/features.db");
const featureId = process.argv[2];
if (!featureId) {
  console.log("Usage: node skip-feature.js <feature_id>");
  process.exit(1);
}
// Get max priority to move to end of queue
const maxPriority = db.prepare("SELECT MAX(priority) as max FROM features").get();
const newPriority = (maxPriority.max || 0) + 1000;
// Clear in_progress, set skipped, update priority
db.prepare("UPDATE features SET in_progress = 0, skipped = 1, priority = ? WHERE id = ?").run(newPriority, featureId);
console.log("Feature " + featureId + " skipped and moved to end of queue (priority: " + newPriority + ")");
db.close();
