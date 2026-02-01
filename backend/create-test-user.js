const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const db = new Database('./data/property_call.db');

const email = 'test226@example.com';
const password = 'test123456';

// Check if user already exists
const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
if (existing) {
  console.log('User already exists with id:', existing.id);
} else {
  const passwordHash = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, passwordHash);
  console.log('Created user with id:', result.lastInsertRowid);
}

console.log('Login credentials:');
console.log('  Email:', email);
console.log('  Password:', password);
