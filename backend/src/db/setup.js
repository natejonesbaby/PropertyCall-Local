import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database file path
const dbPath = path.join(__dirname, '../../data/property_call.db');

// Ensure data directory exists
import fs from 'fs';
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Create database connection
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create tables
const createTables = () => {
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Sessions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, key)
    )
  `);

  // API Keys table (encrypted)
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      service TEXT NOT NULL,
      api_key_encrypted TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, service)
    )
  `);

  // Import history table
  db.exec(`
    CREATE TABLE IF NOT EXISTS import_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      total_rows INTEGER DEFAULT 0,
      imported_count INTEGER DEFAULT 0,
      duplicate_count INTEGER DEFAULT 0,
      error_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      preview_data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Leads table
  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      fub_id TEXT,
      first_name TEXT,
      last_name TEXT,
      property_address TEXT,
      property_city TEXT,
      property_state TEXT,
      property_zip TEXT,
      mailing_address TEXT,
      mailing_city TEXT,
      mailing_state TEXT,
      mailing_zip TEXT,
      phones TEXT,
      email TEXT,
      property_type TEXT,
      bedrooms INTEGER,
      bathrooms REAL,
      sqft INTEGER,
      year_built INTEGER,
      equity_percent REAL,
      estimated_value REAL,
      mortgage_balance REAL,
      vacant_indicator TEXT,
      status TEXT DEFAULT 'new',
      import_id INTEGER,
      raw_data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (import_id) REFERENCES import_history(id) ON DELETE SET NULL
    )
  `);

  // Call queue table
  db.exec(`
    CREATE TABLE IF NOT EXISTS call_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      attempt_number INTEGER DEFAULT 0,
      scheduled_time DATETIME,
      timezone TEXT,
      phone_index INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
    )
  `);

  // Calls table
  db.exec(`
    CREATE TABLE IF NOT EXISTS calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      telnyx_call_id TEXT,
      signalwire_call_id TEXT,
      deepgram_session_id TEXT,
      status TEXT DEFAULT 'pending',
      disposition TEXT,
      qualification_status TEXT,
      sentiment TEXT,
      answers TEXT,
      callback_time DATETIME,
      recording_url TEXT,
      transcript TEXT,
      ai_summary TEXT,
      duration_seconds INTEGER,
      phone_index INTEGER DEFAULT 0,
      phone_number_used TEXT,
      started_at DATETIME,
      answered_at DATETIME,
      ended_at DATETIME,
      amd_result TEXT,
      user_id INTEGER,
      signalwire_log TEXT,
      deepgram_log TEXT,
      telnyx_log TEXT,
      fub_log TEXT,
      debug_log TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
    )
  `);

  // Migration: Add log columns to existing calls table if they don't exist
  const callsColumns = db.prepare("PRAGMA table_info(calls)").all().map(c => c.name);
  if (!callsColumns.includes('user_id')) {
    db.exec('ALTER TABLE calls ADD COLUMN user_id INTEGER');
  }
  if (!callsColumns.includes('signalwire_log')) {
    db.exec('ALTER TABLE calls ADD COLUMN signalwire_log TEXT');
  }
  if (!callsColumns.includes('deepgram_log')) {
    db.exec('ALTER TABLE calls ADD COLUMN deepgram_log TEXT');
  }
  if (!callsColumns.includes('telnyx_log')) {
    db.exec('ALTER TABLE calls ADD COLUMN telnyx_log TEXT');
  }
  if (!callsColumns.includes('fub_log')) {
    db.exec('ALTER TABLE calls ADD COLUMN fub_log TEXT');
  }
  if (!callsColumns.includes('debug_log')) {
    db.exec('ALTER TABLE calls ADD COLUMN debug_log TEXT');
  }

  // Prompts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS prompts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, type)
    )
  `);

  // Qualifying questions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS qualifying_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      question TEXT NOT NULL,
      order_index INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Disqualifying triggers table
  db.exec(`
    CREATE TABLE IF NOT EXISTS disqualifying_triggers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      trigger_phrase TEXT NOT NULL,
      action TEXT DEFAULT 'mark_disqualified',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Field mappings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS field_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      kind_field TEXT NOT NULL,
      fub_field TEXT NOT NULL,
      is_custom_field INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, kind_field)
    )
  `);

  // Password reset tokens table
  db.exec(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at DATETIME NOT NULL,
      used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Voice options table (Deepgram Aura-2 voices)
  db.exec(`
    CREATE TABLE IF NOT EXISTS voice_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      voice_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      gender TEXT,
      accent TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Webhook logs table (for debugging and monitoring)
  db.exec(`
    CREATE TABLE IF NOT EXISTS webhook_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      event_type TEXT,
      call_id INTEGER,
      payload TEXT,
      error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (call_id) REFERENCES calls(id) ON DELETE SET NULL
    )
  `);

  // Webhook signature validation logs (for security monitoring)
  db.exec(`
    CREATE TABLE IF NOT EXISTS webhook_signature_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      error_reason TEXT NOT NULL,
      ip_address TEXT,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Provider errors table (Feature #280 - tracks provider health failures and auto-pauses)
  db.exec(`
    CREATE TABLE IF NOT EXISTS provider_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      error_type TEXT NOT NULL,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Provider recoveries table (Feature #280 - tracks provider recovery events)
  db.exec(`
    CREATE TABLE IF NOT EXISTS provider_recoveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      response_time_ms INTEGER,
      recovered_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('Database tables created successfully');
};

// Add migration for new columns
const runMigrations = () => {
  // Add fub_pushed_count and fub_error_count to import_history if they don't exist
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

    if (!columns.includes('updated_at')) {
      db.exec(`ALTER TABLE import_history ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`);
      console.log('Added updated_at column to import_history');
    }
  } catch (error) {
    console.log('Migration check:', error.message);
  }

  // Add phone_index and phone_number_used to calls table for phone rotation (Feature #159)
  try {
    const callsTableInfo = db.prepare("PRAGMA table_info(calls)").all();
    const callsColumns = callsTableInfo.map(col => col.name);

    if (!callsColumns.includes('phone_index')) {
      db.exec(`ALTER TABLE calls ADD COLUMN phone_index INTEGER DEFAULT 0`);
      console.log('Added phone_index column to calls table');
    }

    if (!callsColumns.includes('phone_number_used')) {
      db.exec(`ALTER TABLE calls ADD COLUMN phone_number_used TEXT`);
      console.log('Added phone_number_used column to calls table');
    }

    // Add SignalWire support columns (Feature #250)
    if (!callsColumns.includes('signalwire_call_id')) {
      db.exec(`ALTER TABLE calls ADD COLUMN signalwire_call_id TEXT`);
      console.log('Added signalwire_call_id column to calls table');
    }

    if (!callsColumns.includes('answered_at')) {
      db.exec(`ALTER TABLE calls ADD COLUMN answered_at DATETIME`);
      console.log('Added answered_at column to calls table');
    }

    if (!callsColumns.includes('amd_result')) {
      db.exec(`ALTER TABLE calls ADD COLUMN amd_result TEXT`);
      console.log('Added amd_result column to calls table');
    }

    if (!callsColumns.includes('amd_confidence')) {
      db.exec(`ALTER TABLE calls ADD COLUMN amd_confidence REAL`);
      console.log('Added amd_confidence column to calls table');
    }

    if (!callsColumns.includes('amd_detected_at')) {
      db.exec(`ALTER TABLE calls ADD COLUMN amd_detected_at DATETIME`);
      console.log('Added amd_detected_at column to calls table');
    }
  } catch (error) {
    console.log('Calls table migration:', error.message);
  }

  // Seed voice_options table with Deepgram Aura-2 voices if empty
  try {
    const voiceCount = db.prepare('SELECT COUNT(*) as count FROM voice_options').get();
    if (voiceCount.count === 0) {
      const voices = [
        { voice_id: 'aura-asteria-en', name: 'Asteria', description: 'American female voice, warm and professional', gender: 'female', accent: 'american' },
        { voice_id: 'aura-luna-en', name: 'Luna', description: 'American female voice, friendly and conversational', gender: 'female', accent: 'american' },
        { voice_id: 'aura-stella-en', name: 'Stella', description: 'American female voice, clear and articulate', gender: 'female', accent: 'american' },
        { voice_id: 'aura-athena-en', name: 'Athena', description: 'British female voice, sophisticated and refined', gender: 'female', accent: 'british' },
        { voice_id: 'aura-hera-en', name: 'Hera', description: 'American female voice, authoritative and confident', gender: 'female', accent: 'american' },
        { voice_id: 'aura-orion-en', name: 'Orion', description: 'American male voice, deep and professional', gender: 'male', accent: 'american' },
        { voice_id: 'aura-arcas-en', name: 'Arcas', description: 'American male voice, friendly and approachable', gender: 'male', accent: 'american' },
        { voice_id: 'aura-perseus-en', name: 'Perseus', description: 'American male voice, warm and reassuring', gender: 'male', accent: 'american' },
        { voice_id: 'aura-angus-en', name: 'Angus', description: 'Irish male voice, charming and personable', gender: 'male', accent: 'irish' },
        { voice_id: 'aura-orpheus-en', name: 'Orpheus', description: 'American male voice, clear and engaging', gender: 'male', accent: 'american' },
        { voice_id: 'aura-helios-en', name: 'Helios', description: 'British male voice, distinguished and polished', gender: 'male', accent: 'british' },
        { voice_id: 'aura-zeus-en', name: 'Zeus', description: 'American male voice, commanding and authoritative', gender: 'male', accent: 'american' }
      ];

      const insertVoice = db.prepare(`
        INSERT INTO voice_options (voice_id, name, description, gender, accent, is_active)
        VALUES (?, ?, ?, ?, ?, 1)
      `);

      for (const voice of voices) {
        insertVoice.run(voice.voice_id, voice.name, voice.description, voice.gender, voice.accent);
      }
      console.log('Seeded voice_options with Deepgram Aura-2 voices');
    }
  } catch (error) {
    console.log('Voice options migration:', error.message);
  }
};

// Create indexes
const createIndexes = () => {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_leads_user_id ON leads(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_leads_fub_id ON leads(fub_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_call_queue_status ON call_queue(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_call_queue_scheduled ON call_queue(scheduled_time)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_calls_lead_id ON calls(lead_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_import_history_user_id ON import_history(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_provider_errors_provider ON provider_errors(provider)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_provider_errors_created_at ON provider_errors(created_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_provider_recoveries_provider ON provider_recoveries(provider)`);

  console.log('Database indexes created successfully');
};

// Run setup
const setup = () => {
  try {
    createTables();
    runMigrations();
    createIndexes();
    console.log('Database setup complete!');
    console.log(`Database location: ${dbPath}`);
  } catch (error) {
    console.error('Database setup failed:', error);
    process.exit(1);
  }
};

// Export database instance for use in other modules
export { db, dbPath };

// Always run setup when this module is imported
// This ensures tables exist before any database operations
setup();

export default setup;
