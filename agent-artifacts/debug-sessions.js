const sqlite3 = require('better-sqlite3');
const path = require('path');

const db = sqlite3(path.join(__dirname, 'backend', 'data', 'property_call.db'));

// Check user with ID 6
const user6 = db.prepare('SELECT * FROM users WHERE id = 6').get();
console.log('User ID 6:', user6);

// Check if there's any session for user 6 that might match
const sessionForUser6 = db.prepare(`
  SELECT s.*, u.email
  FROM sessions s
  JOIN users u ON s.user_id = u.id
  WHERE s.user_id = 6
`).all();

console.log('\nSessions for user 6:');
sessionForUser6.forEach(s => {
  console.log(`  Token: ${s.id}`);
  console.log(`  Expires: ${s.expires_at}`);
  console.log('');
});

// Let's manually test the auth query
const testToken = 'expired_test_token_' + Date.now();
const pastDate = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago

// Insert test expired session
const user = db.prepare('SELECT id FROM users LIMIT 1').get();
db.prepare(`INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`)
  .run(testToken, user.id, pastDate.toISOString());

console.log('Inserted expired session:');
console.log(`  Token: ${testToken}`);
console.log(`  User ID: ${user.id}`);
console.log(`  Expires: ${pastDate.toISOString()}`);

// Now run the auth query
const result = db.prepare(`
  SELECT s.user_id, s.expires_at, u.email
  FROM sessions s
  JOIN users u ON s.user_id = u.id
  WHERE s.id = ? AND s.expires_at > datetime('now')
`).get(testToken);

console.log('\nAuth query result for expired token:');
console.log(result); // Should be undefined

// Clean up
db.prepare('DELETE FROM sessions WHERE id = ?').run(testToken);
console.log('\nCleaned up test token');

// Double check the SQL is comparing correctly
console.log('\nCurrent time:', new Date().toISOString());
console.log("SQLite datetime('now'):", db.prepare("SELECT datetime('now') as now").get().now);
