import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database file path
const dbPath = path.join(__dirname, '../../data/property_call.db');

// Ensure data directory exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Create database connection
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');

// Run legacy migrations for new columns (for backwards compatibility)
const runLegacyMigrations = () => {
  // Migration for import_history table
  try {
    const tableInfo = db.prepare("PRAGMA table_info(import_history)").all();
    const columns = tableInfo.map(col => col.name);

    if (!columns.includes('fub_pushed_count')) {
      db.exec(`ALTER TABLE import_history ADD COLUMN fub_pushed_count INTEGER DEFAULT 0`);
      console.log('Added fub_pushed_count column to import_history');
    }

    if (!columns.includes('fub_error_count')) {
      db.exec(`ALTER TABLE import_history ADD COLUMN fub_error_count INTEGER DEFAULT 0`);
      console.log('Added fub_error_count column to import_history');
    }

    // SQLite doesn't allow default datetime('now'), so use NULL default
    if (!columns.includes('updated_at')) {
      db.exec(`ALTER TABLE import_history ADD COLUMN updated_at DATETIME`);
      console.log('Added updated_at column to import_history');
    }
  } catch (error) {
    if (!error.message.includes('no such table')) {
      console.log('import_history migration check:', error.message);
    }
  }

  // Migration for leads table - ensure updated_at column exists
  try {
    const leadsInfo = db.prepare("PRAGMA table_info(leads)").all();
    const leadsColumns = leadsInfo.map(col => col.name);

    // SQLite doesn't allow default datetime('now'), so use NULL default
    if (!leadsColumns.includes('updated_at')) {
      db.exec(`ALTER TABLE leads ADD COLUMN updated_at DATETIME`);
      console.log('Added updated_at column to leads');
    }
  } catch (error) {
    if (!error.message.includes('no such table')) {
      console.log('leads migration check:', error.message);
    }
  }
};

// Run new migration system
const runNewMigrations = async () => {
  try {
    const { runMigrations } = await import('./migrations.js');
    await runMigrations(db);
  } catch (error) {
    console.log('Migration system error:', error.message);
    // Don't fail startup if migrations have issues
  }
};

// Run migrations on startup
runLegacyMigrations();
runNewMigrations();

export { db, dbPath };
export default db;
