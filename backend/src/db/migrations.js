import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Migration tracking table
const MIGRATIONS_TABLE = 'schema_migrations';

/**
 * Get all migration files sorted by version
 */
function getMigrationFiles() {
  const migrationsDir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.js'))
    .sort();

  return files.map(file => {
    const version = file.split('-')[0];
    return { version, file };
  });
}

/**
 * Create migrations tracking table if it doesn't exist
 */
function ensureMigrationsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      version TEXT PRIMARY KEY,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

/**
 * Get applied migrations from database
 */
function getAppliedMigrations(db) {
  try {
    const rows = db.prepare(`SELECT version FROM ${MIGRATIONS_TABLE} ORDER BY version`).all();
    return rows.map(row => row.version);
  } catch (error) {
    // Table doesn't exist yet
    return [];
  }
}

/**
 * Run a single migration
 */
async function runMigration(db, migrationFile) {
  const migrationPath = path.join(__dirname, 'migrations', migrationFile.file);

  // Dynamic import for ESM migration files
  const migration = await import(`file://${migrationPath}`);

  console.log(`Running migration: ${migrationFile.file}`);

  try {
    await migration.up(db);
    console.log(`✓ Migration ${migrationFile.file} completed successfully`);

    // Record migration
    db.prepare(`INSERT INTO ${MIGRATIONS_TABLE} (version) VALUES (?)`)
      .run(migrationFile.version);
  } catch (error) {
    console.error(`✗ Migration ${migrationFile.file} failed:`, error.message);
    throw error;
  }
}

/**
 * Run all pending migrations
 */
export async function runMigrations(db) {
  console.log('Checking for pending migrations...');

  // Ensure migrations table exists
  ensureMigrationsTable(db);

  // Get migration files and applied migrations
  const migrationFiles = getMigrationFiles();
  const appliedMigrations = getAppliedMigrations(db);

  // Filter pending migrations
  const pendingMigrations = migrationFiles.filter(
    mf => !appliedMigrations.includes(mf.version)
  );

  if (pendingMigrations.length === 0) {
    console.log('No pending migrations');
    return;
  }

  console.log(`Found ${pendingMigrations.length} pending migration(s)`);

  // Run each pending migration
  for (const migration of pendingMigrations) {
    await runMigration(db, migration);
  }

  console.log('All migrations completed successfully');
}

/**
 * Create a new migration file
 */
export function createMigration(name) {
  const migrationsDir = path.join(__dirname, 'migrations');

  // Create migrations directory if it doesn't exist
  if (!fs.existsSync(migrationsDir)) {
    fs.mkdirSync(migrationsDir, { recursive: true });
  }

  // Generate timestamp-based version
  const timestamp = Date.now();
  const version = timestamp.toString();
  const filename = `${version}-${name.replace(/\s+/g, '_')}.js`;
  const filepath = path.join(migrationsDir, filename);

  // Migration template
  const template = `/**
 * Migration: ${name}
 * Created: ${new Date().toISOString()}
 */

export async function up(db) {
  // Add your migration code here
  console.log('Running migration: ${name}');

  // Example:
  // db.exec(\`
  //   ALTER TABLE users ADD COLUMN new_field TEXT
  // \`);
}

export async function down(db) {
  // Add rollback code here (optional)
  console.log('Rolling back migration: ${name}');

  // Example:
  // db.exec(\`
  //   ALTER TABLE users DROP COLUMN new_field
  // \`);
}
`;

  fs.writeFileSync(filepath, template, 'utf8');
  console.log(`Created migration file: ${filename}`);

  return filepath;
}

export default runMigrations;
