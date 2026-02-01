import express from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import db from '../db/index.js';

const router = express.Router();

// Generate session token
const generateSessionToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// POST /api/auth/register - Register new user
router.post('/register', async (req, res) => {
  try {
    const { email, password, confirmPassword } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Password minimum length
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Confirm password match
    if (confirmPassword && password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }

    // Check if email already exists
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (existingUser) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const result = db.prepare(`
      INSERT INTO users (email, password_hash) VALUES (?, ?)
    `).run(email.toLowerCase(), passwordHash);

    const userId = result.lastInsertRowid;

    // Create session
    const sessionToken = generateSessionToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    db.prepare(`
      INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)
    `).run(sessionToken, userId, expiresAt.toISOString());

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      user: {
        id: userId,
        email: email.toLowerCase()
      },
      token: sessionToken,
      expiresAt: expiresAt.toISOString()
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed: ' + error.message });
  }
});

// POST /api/auth/login - Login user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const user = db.prepare('SELECT id, email, password_hash FROM users WHERE email = ?').get(email.toLowerCase());
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Create session
    const sessionToken = generateSessionToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    db.prepare(`
      INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)
    `).run(sessionToken, user.id, expiresAt.toISOString());

    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email
      },
      token: sessionToken,
      expiresAt: expiresAt.toISOString()
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed: ' + error.message });
  }
});

// POST /api/auth/logout - Logout user
router.post('/logout', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      db.prepare('DELETE FROM sessions WHERE id = ?').run(token);
    }

    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// GET /api/auth/me - Get current user
router.get('/me', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const token = authHeader.substring(7);

    // Find valid session
    // Note: datetime() is used on expires_at to normalize ISO 8601 format (with 'T')
    // to SQLite's datetime format (with space) for proper comparison
    const session = db.prepare(`
      SELECT s.user_id, s.expires_at, u.email
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.id = ? AND datetime(s.expires_at) > datetime('now')
    `).get(token);

    if (!session) {
      return res.status(401).json({ error: 'Session expired or invalid' });
    }

    res.json({
      user: {
        id: session.user_id,
        email: session.email
      }
    });
  } catch (error) {
    console.error('Auth check error:', error);
    res.status(500).json({ error: 'Authentication check failed' });
  }
});

// POST /api/auth/forgot-password - Request password reset
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Find user
    const user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(email.toLowerCase());

    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({ success: true, message: 'If the email exists, a reset link has been sent' });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store token
    db.prepare(`
      INSERT INTO password_reset_tokens (user_id, token, expires_at)
      VALUES (?, ?, ?)
    `).run(user.id, resetToken, expiresAt.toISOString());

    // In development, log the reset link to console
    const resetUrl = `http://localhost:5173/reset-password?token=${resetToken}`;
    console.log('=================================');
    console.log('PASSWORD RESET LINK (dev mode):');
    console.log(resetUrl);
    console.log('=================================');

    res.json({
      success: true,
      message: 'If the email exists, a reset link has been sent',
      // Include reset link in dev mode for testing
      ...(process.env.NODE_ENV !== 'production' && { devResetUrl: resetUrl })
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Password reset request failed' });
  }
});

// POST /api/auth/reset-password - Reset password with token
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password, confirmPassword } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    if (confirmPassword && password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }

    // Find valid token
    const resetToken = db.prepare(`
      SELECT id, user_id FROM password_reset_tokens
      WHERE token = ? AND expires_at > datetime('now') AND used = 0
    `).get(token);

    if (!resetToken) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(password, 10);

    // Update password
    db.prepare('UPDATE users SET password_hash = ?, updated_at = datetime("now") WHERE id = ?')
      .run(passwordHash, resetToken.user_id);

    // Mark token as used
    db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE id = ?')
      .run(resetToken.id);

    // Invalidate all existing sessions
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(resetToken.user_id);

    res.json({ success: true, message: 'Password reset successful. Please log in with your new password.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Password reset failed' });
  }
});

export default router;
