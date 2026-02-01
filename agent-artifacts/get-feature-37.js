#!/usr/bin/env node

/**
 * Get Feature #37 details from the features database
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'features.db');
const db = new sqlite3.Database(dbPath);

const featureId = 37;

db.get(
  'SELECT id, priority, category, name, description, steps, passes, in_progress, dependencies FROM features WHERE id = ?',
  [featureId],
  (err, row) => {
    if (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }

    if (!row) {
      console.error(`Feature #${featureId} not found`);
      process.exit(1);
    }

    console.log(JSON.stringify(row, null, 2));
    db.close();
  }
);
