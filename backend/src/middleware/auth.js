import db from '../db/index.js';

/**
 * Authentication middleware that validates session tokens
 * and attaches user info to the request object.
 *
 * Usage: app.use('/api/protected', requireAuth, routes);
 *
 * After this middleware, req.user will contain:
 * - id: user ID
 * - email: user email
 */
export function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
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

    // Attach user to request
    req.user = {
      id: session.user_id,
      email: session.email
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Authentication check failed' });
  }
}

/**
 * Optional authentication middleware that attaches user info if available,
 * but doesn't require authentication.
 *
 * Usage: app.use('/api/public', optionalAuth, routes);
 */
export function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);

      // Note: datetime() is used on expires_at to normalize ISO 8601 format
      const session = db.prepare(`
        SELECT s.user_id, s.expires_at, u.email
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.id = ? AND datetime(s.expires_at) > datetime('now')
      `).get(token);

      if (session) {
        req.user = {
          id: session.user_id,
          email: session.email
        };
      }
    }

    next();
  } catch (error) {
    console.error('Optional auth middleware error:', error);
    // Continue without auth on error
    next();
  }
}

export default { requireAuth, optionalAuth };
