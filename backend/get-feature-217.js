import Database from 'better-sqlite3';

const db = new Database('/Users/nate/Library/CloudStorage/OneDrive-Personal/Computer Software/AutoDialer - Real Estate/features.db');

const row = db.prepare('SELECT id, category, name, description, passes, in_progress, priority, steps FROM features WHERE id = 217').get();
console.log(JSON.stringify(row, null, 2));

db.close();
