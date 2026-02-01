#!/usr/bin/env node

/**
 * Get feature #246 details
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'features.db');
const db = new sqlite3.Database(dbPath);

const featureId = 246;

db.get(
  `SELECT id, priority, category, name, description, steps, passes, in_progress, dependencies
   FROM features
   WHERE id = ?`,
  [featureId],
  (err, row) => {
    if (err) {
      console.error('Error:', err);
      process.exit(1);
    }

    if (!row) {
      console.log(`Feature #${featureId} not found`);
      process.exit(1);
    }

    console.log('='.repeat(80));
    console.log(`Feature #${row.id}: ${row.name}`);
    console.log('='.repeat(80));
    console.log(`Category: ${row.category}`);
    console.log(`Priority: ${row.priority}`);
    console.log(`Status: ${row.passes ? 'PASSING' : 'PENDING'}${row.in_progress ? ' (IN PROGRESS)' : ''}`);
    console.log(`\nDescription:\n${row.description}`);
    console.log(`\nSteps:`);
    const steps = JSON.parse(row.steps);
    steps.forEach((step, i) => {
      console.log(`  ${i + 1}. ${step}`);
    });
    if (row.dependencies) {
      const deps = JSON.parse(row.dependencies);
      console.log(`\nDependencies: ${deps.join(', ')}`);
    }
    console.log('='.repeat(80));

    db.close();
  }
);
