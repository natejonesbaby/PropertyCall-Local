import Database from 'better-sqlite3';

const db = new Database('/Users/nate/Library/CloudStorage/OneDrive-Personal/Computer Software/AutoDialer - Real Estate/features.db');

// Mark feature #217 as passing
const result = db.prepare('UPDATE features SET passes = 1, in_progress = 0 WHERE id = 217').run();
console.log('Feature #217 marked as passing:', result.changes > 0 ? 'SUCCESS' : 'FAILED');

// Verify
const feature = db.prepare('SELECT id, name, passes, in_progress FROM features WHERE id = 217').get();
console.log('Feature status:', feature);

db.close();
