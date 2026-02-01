import db from './index.js';
import bcrypt from 'bcrypt';

// Create a default test user for development
const seedUser = async () => {
  try {
    // Check if user exists
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get('test@example.com');

    if (existingUser) {
      console.log('Test user already exists with ID:', existingUser.id);
      return existingUser.id;
    }

    // Hash password
    const passwordHash = await bcrypt.hash('password123', 10);

    // Insert user
    const result = db.prepare(`
      INSERT INTO users (email, password_hash) VALUES (?, ?)
    `).run('test@example.com', passwordHash);

    console.log('Created test user with ID:', result.lastInsertRowid);
    console.log('Email: test@example.com');
    console.log('Password: password123');

    return result.lastInsertRowid;
  } catch (error) {
    console.error('Seed error:', error);
    throw error;
  }
};

// Run seed
seedUser()
  .then(() => {
    console.log('Seed complete!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
