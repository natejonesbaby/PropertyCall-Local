const Database = require('better-sqlite3');

const db = new Database('backend/data/property_call.db');

// Check calls with recording URLs
const callsWithRecordings = db.prepare(`
  SELECT id, telnyx_call_id, status, recording_url,
         started_at, ended_at
  FROM calls
  WHERE recording_url IS NOT NULL
  ORDER BY id DESC
  LIMIT 10
`).all();

console.log('Calls with recordings:', callsWithRecordings.length);
console.log(JSON.stringify(callsWithRecordings, null, 2));

// Check all recent calls
const recentCalls = db.prepare(`
  SELECT id, telnyx_call_id, status, recording_url
  FROM calls
  ORDER BY id DESC
  LIMIT 5
`).all();

console.log('\nRecent calls:');
console.log(JSON.stringify(recentCalls, null, 2));

db.close();
