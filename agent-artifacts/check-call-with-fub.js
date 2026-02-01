const Database = require('better-sqlite3');
const db = new Database('backend/data/property_call.db');

// Find a call with complete data
const call = db.prepare(`
  SELECT c.*, l.first_name, l.last_name, l.fub_id
  FROM calls c
  LEFT JOIN leads l ON c.lead_id = l.id
  WHERE c.status = 'completed'
    AND c.qualification_status IS NOT NULL
    AND l.fub_id IS NOT NULL
  ORDER BY c.id DESC
  LIMIT 1
`).get();

if (call) {
  console.log('Found call:', call.id);
  console.log('Lead:', call.first_name, call.last_name);
  console.log('FUB ID:', call.fub_id);
  console.log('Qualification:', call.qualification_status);
} else {
  console.log('No suitable call found');
}

db.close();
