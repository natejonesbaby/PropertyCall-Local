const Database = require('better-sqlite3');
const db = new Database('backend/data/property_call.db');
const calls = db.prepare('SELECT id, lead_id, status, recording_url FROM calls ORDER BY id DESC LIMIT 10').all();
console.log('Recent calls:');
console.log(JSON.stringify(calls, null, 2));

// Check for calls with recordings
const callsWithRecordings = db.prepare('SELECT COUNT(*) as count FROM calls WHERE recording_url IS NOT NULL').get();
console.log('\nCalls with recordings:', callsWithRecordings.count);
