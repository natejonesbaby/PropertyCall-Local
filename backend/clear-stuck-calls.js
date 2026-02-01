import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'data/property_call.db');
const db = new Database(dbPath);

// Check for stuck calls (including 'ringing' status)
const activeCalls = db.prepare("SELECT id, lead_id, status FROM calls WHERE status IN ('in_progress', 'initiated', 'ringing')").all();
console.log('Active/stuck calls:', activeCalls);

// Update stuck calls to completed
const result = db.prepare("UPDATE calls SET status = 'completed' WHERE status IN ('in_progress', 'initiated', 'ringing')").run();
console.log('Updated', result.changes, 'calls to completed');

// Check queue_paused setting
const queuePausedSetting = db.prepare("SELECT value FROM settings WHERE key = 'queue_paused'").get();
console.log('Queue paused setting:', queuePausedSetting);

// Unpause queue if paused
if (queuePausedSetting && queuePausedSetting.value === 'true') {
  db.prepare("UPDATE settings SET value = 'false' WHERE key = 'queue_paused'").run();
  console.log('Queue unpaused');
}

db.close();
