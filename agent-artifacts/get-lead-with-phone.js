const Database = require('better-sqlite3');
const db = new Database('backend/data/property_call.db');
const leads = db.prepare("SELECT id, first_name, last_name, property_address, phones FROM leads WHERE phones IS NOT NULL AND phones != '[]' LIMIT 5").all();
leads.forEach(l => {
  console.log(`ID: ${l.id}, Name: ${l.first_name} ${l.last_name}, Phones: ${l.phones.substring(0, 100)}`);
});
db.close();
