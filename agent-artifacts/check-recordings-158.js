const Database = require('better-sqlite3');
const db = new Database('./backend/data/property_call.db');

// Check for calls with recordings
const callsWithRecordings = db.prepare(`
  SELECT id, lead_id, status, recording_url, duration_seconds, created_at
  FROM calls
  WHERE recording_url IS NOT NULL
  LIMIT 10
`).all();

console.log('Calls with recordings:', callsWithRecordings.length);
console.log(JSON.stringify(callsWithRecordings, null, 2));

// Check total calls
const totalCalls = db.prepare('SELECT COUNT(*) as count FROM calls').get();
console.log('\nTotal calls in database:', totalCalls.count);

// Check calls with any data
const recentCalls = db.prepare(`
  SELECT id, lead_id, status, recording_url, telnyx_call_id, duration_seconds, created_at
  FROM calls
  ORDER BY id DESC
  LIMIT 5
`).all();

console.log('\nMost recent 5 calls:');
console.log(JSON.stringify(recentCalls, null, 2));

db.close();
