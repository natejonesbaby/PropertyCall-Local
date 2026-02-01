// Load environment variables FIRST before any other imports
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import crypto from 'crypto';

// Get the directory of this file and load .env from backend folder
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Read package.json for version
import { readFileSync } from 'fs';
const packageJson = JSON.parse(readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
const APP_VERSION = packageJson.version;

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

// Import routes
import importRoutes from './routes/import.js';
import authRoutes from './routes/auth.js';
import leadsRoutes from './routes/leads.js';
import settingsRoutes from './routes/settings.js';
import dashboardRoutes from './routes/dashboard.js';
import configRoutes from './routes/config.js';
import callsRoutes from './routes/calls.js';
import queueRoutes from './routes/queue.js';
import webhooksRoutes from './routes/webhooks.js';

// Import database setup
import './db/setup.js';

// Import audio stream WebSocket handlers
import { handleAudioConnection, getAudioStreamStats } from './websocket/audioStream.js';
import { handleSignalWireStreamConnection, getSignalWireStreamStats } from './websocket/signalwireStream.js';
import { audioBridgeManager } from './services/audioBridge.js';

// Import provider factory for Telnyx operations
import { createProviderInstance } from './providers/provider-factory.js';

const app = express();
const server = createServer(app);

// WebSocket server for live monitoring (noServer mode to handle multiple WS paths)
const wss = new WebSocketServer({ noServer: true });

// WebSocket server for Telnyx audio streaming (noServer mode)
const audioWss = new WebSocketServer({ noServer: true });

// WebSocket server for SignalWire audio streaming (noServer mode)
const signalwireWss = new WebSocketServer({ noServer: true });

// WebSocket server for live audio monitoring (tap-in to listen to calls)
const listenWss = new WebSocketServer({ noServer: true });

// Handle WebSocket upgrades with path routing
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;

  console.log(`[WebSocket Upgrade] Incoming upgrade request for path: ${pathname}`);
  console.log(`[WebSocket Upgrade] Headers:`, JSON.stringify(request.headers, null, 2));

  if (pathname === '/ws/monitor') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else if (pathname === '/ws/audio') {
    // Telnyx audio streaming
    audioWss.handleUpgrade(request, socket, head, (ws) => {
      handleAudioConnection(ws, request);
    });
  } else if (pathname.startsWith('/ws/signalwire-audio')) {
    // SignalWire audio streaming - path format: /ws/signalwire-audio/{callId}/{leadId}
    console.log(`[WebSocket Upgrade] SignalWire audio stream connection initiated for path: ${pathname}`);
    signalwireWss.handleUpgrade(request, socket, head, (ws) => {
      console.log(`[WebSocket Upgrade] SignalWire WebSocket upgrade complete, calling handler`);
      handleSignalWireStreamConnection(ws, request);
    });
  } else if (pathname.startsWith('/ws/listen/')) {
    // Handle live listening WebSocket connections
    listenWss.handleUpgrade(request, socket, head, (ws) => {
      listenWss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Handle live listening WebSocket connections
listenWss.on('connection', (ws, request) => {
  // Extract call ID from URL path: /ws/listen/:callId
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const callId = pathname.split('/ws/listen/')[1];

  console.log(`[Live Listen] Client connecting to listen to call: ${callId}`);

  if (!callId) {
    console.log(`[Live Listen] Connection rejected - no call ID`);
    ws.close(4000, 'Call ID required');
    return;
  }

  // Find the audio bridge for this call
  const bridge = audioBridgeManager.getBridge(callId);

  if (!bridge) {
    console.log(`[Live Listen] Connection rejected - call not found: ${callId}`);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Call not found or not active'
    }));
    ws.close(4004, 'Call not found');
    return;
  }

  // Add this WebSocket as a monitor listener
  bridge.addMonitorListener(ws);

  ws.on('close', () => {
    console.log(`[Live Listen] Client disconnected from call: ${callId}`);
  });
});

// Broadcast to all connected WebSocket clients
function broadcastToMonitors(message) {
  const messageStr = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(messageStr);
    }
  });
}

// Export broadcast function for use in routes
export { broadcastToMonitors, wss, audioWss, listenWss, audioBridgeManager };

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: APP_VERSION
  });
});

// Version endpoint for auto-deploy checks
app.get('/api/version', (req, res) => {
  res.json({
    version: APP_VERSION
  });
});

// Get FUB API base URL (supports mock server for testing)
function getFubApiBase() {
  return process.env.FUB_API_BASE || 'https://api.followupboss.com';
}

// Encryption settings (must match settings.js)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'property-call-default-key-32b!';
const ALGORITHM = 'aes-256-cbc';

// Decrypt a value
function decrypt(encryptedText) {
  if (!encryptedText) return null;
  try {
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const [ivHex, encrypted] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    return null;
  }
}

/**
 * Get the configured telephony provider for webhook operations
 * This abstracts Telnyx-specific logic into the provider layer
 *
 * @param {number} userId - User ID
 * @returns {Promise<Object>} Provider instance
 */
async function getTelephonyProvider(userId) {
  const providerName = 'telnyx'; // Default to Telnyx for webhooks

  // Get API key for the provider
  const apiKeyRow = db.prepare(`
    SELECT api_key_encrypted FROM api_keys WHERE user_id = ? AND service = ?
  `).get(userId, providerName);

  if (!apiKeyRow || !apiKeyRow.api_key_encrypted) {
    throw new Error(`${providerName} not configured`);
  }

  const apiKey = decrypt(apiKeyRow.api_key_encrypted);
  if (!apiKey) {
    throw new Error(`Failed to decrypt ${providerName} API key`);
  }

  // Create provider instance
  const provider = await createProviderInstance(providerName, apiKey);

  return { provider, providerName };
}

// Follow-up Boss health check endpoint
app.get('/api/health/fub', async (req, res) => {
  try {
    // Import required modules
    const crypto = await import('crypto');
    const { default: db } = await import('./db/index.js');

    // Encryption settings (must match settings.js)
    const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'property-call-default-key-32b!';
    const ALGORITHM = 'aes-256-cbc';

    function decrypt(encryptedText) {
      if (!encryptedText) return null;
      try {
        const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
        const [ivHex, encrypted] = encryptedText.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
      } catch (error) {
        return null;
      }
    }

    const userId = 1; // Should come from auth middleware in production

    // Get the FUB API key
    const row = db.prepare(`
      SELECT api_key_encrypted FROM api_keys WHERE user_id = ? AND service = 'followupboss'
    `).get(userId);

    if (!row || !row.api_key_encrypted) {
      return res.json({
        status: 'not_configured',
        message: 'Follow-up Boss API key not configured'
      });
    }

    const apiKey = decrypt(row.api_key_encrypted);
    if (!apiKey) {
      return res.json({
        status: 'error',
        message: 'Failed to decrypt API key'
      });
    }

    // Test the Follow-up Boss API connection and get account info
    const response = await fetch(`${getFubApiBase()}/v1/users`, {
      method: 'GET',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(apiKey + ':').toString('base64'),
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      // Get account/team info from users endpoint
      const users = data.users || [];
      res.json({
        status: 'connected',
        message: 'Follow-up Boss API connection successful',
        accountInfo: {
          usersCount: users.length,
          users: users.map(u => ({
            id: u.id,
            name: u.name,
            email: u.email
          }))
        }
      });
    } else if (response.status === 401) {
      res.json({
        status: 'invalid_credentials',
        message: 'Invalid Follow-up Boss API key'
      });
    } else {
      const errorData = await response.json().catch(() => ({}));
      res.json({
        status: 'error',
        message: `Follow-up Boss API error: ${response.status}`,
        details: errorData
      });
    }
  } catch (error) {
    console.error('FUB health check error:', error);
    res.json({
      status: 'error',
      message: error.message || 'Failed to connect to Follow-up Boss'
    });
  }
});

// Provider-agnostic health check endpoint for telephony
// GET /api/health/telephony - Checks health of active telephony provider
app.get('/api/health/telephony', async (req, res) => {
  let providerName = null;
  try {
    // Import required modules
    const crypto = await import('crypto');
    const { default: db } = await import('./db/index.js');

    // Encryption settings (must match settings.js)
    const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'property-call-default-key-32b!';
    const ALGORITHM = 'aes-256-cbc';

    function decrypt(encryptedText) {
      if (!encryptedText) return null;
      try {
        const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
        const [ivHex, encrypted] = encryptedText.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
      } catch (error) {
        return null;
      }
    }

    const userId = 1; // Should come from auth middleware in production

    // Get active telephony provider from settings
    const providerSetting = db.prepare(`
      SELECT value FROM settings WHERE user_id = ? AND key = 'telephony_provider'
    `).get(userId);

    if (!providerSetting || !providerSetting.value) {
      return res.json({
        status: 'not_configured',
        message: 'No telephony provider configured',
        provider: null
      });
    }

    providerName = providerSetting.value;

    // Get API key for the provider
    const apiKeyRow = db.prepare(`
      SELECT api_key_encrypted FROM api_keys WHERE user_id = ? AND service = ?
    `).get(userId, providerName);

    if (!apiKeyRow || !apiKeyRow.api_key_encrypted) {
      return res.json({
        status: 'not_configured',
        message: `${providerName} API key not configured`,
        provider: providerName
      });
    }

    const apiKey = decrypt(apiKeyRow.api_key_encrypted);
    if (!apiKey) {
      return res.json({
        status: 'error',
        message: 'Failed to decrypt API key',
        provider: providerName
      });
    }

    // Create provider instance
    const provider = await createProviderInstance(providerName);

    // Initialize provider with API key
    await provider.initialize(apiKey);

    // Perform health check
    const healthResult = await provider.healthCheck();

    // Get last successful call timestamp
    const lastSuccessfulCall = db.prepare(`
      SELECT MAX(ended_at) as last_call_time
      FROM calls
      WHERE user_id = ?
        AND status = 'completed'
        AND disposition IS NOT NULL
        AND disposition != 'No Answer'
    `).get(userId);

    // Get error count from provider_errors table (last 24 hours)
    const errorCount = db.prepare(`
      SELECT COUNT(*) as count
      FROM provider_errors
      WHERE provider = ?
        AND created_at >= datetime('now', '-24 hours')
    `).get(providerName);

    if (healthResult.healthy) {
      res.json({
        status: 'connected',
        message: `${providerName} API connection successful`,
        provider: providerName,
        responseTimeMs: healthResult.responseTimeMs,
        lastSuccessfulCall: lastSuccessfulCall?.last_call_time || null,
        errorCount: errorCount?.count || 0
      });
    } else {
      res.json({
        status: 'error',
        message: healthResult.error || `${providerName} API health check failed`,
        provider: providerName,
        details: healthResult.details,
        lastSuccessfulCall: lastSuccessfulCall?.last_call_time || null,
        errorCount: errorCount?.count || 0
      });
    }
  } catch (error) {
    console.error('Telephony health check error:', error);
    res.json({
      status: 'error',
      message: error.message || 'Failed to check telephony provider health',
      provider: providerName || null,
      details: error.details || null
    });
  }
});

// Auth routes
app.use('/api/auth', authRoutes);

// Leads routes
app.use('/api/leads', leadsRoutes);

// Calls routes
app.use('/api/calls', callsRoutes);

// Import routes
app.use('/api/import', importRoutes);

app.use('/api/config', configRoutes);

app.use('/api/dashboard', dashboardRoutes);

app.use('/api/queue', queueRoutes);

// Settings routes
app.use('/api/settings', settingsRoutes);

// Webhook routes (no authentication required - providers call these)
app.use('/api/webhooks', webhooksRoutes);

// TEMPORARY: Admin endpoints for database migration
import multer from 'multer';
import fs from 'fs';
import db from './db/index.js';

// Check database state
app.get('/api/admin/db-check', (req, res) => {
  const uploadSecret = req.headers['x-upload-secret'];
  if (uploadSecret !== 'migrate-db-2026') {
    return res.status(403).json({ error: 'Invalid secret' });
  }

  try {
    const users = db.prepare('SELECT id, email, created_at FROM users ORDER BY id DESC LIMIT 10').all();
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();

    // Get API keys summary (service names only, not values)
    const apiKeys = db.prepare('SELECT user_id, service FROM api_keys ORDER BY user_id, service').all();

    // Get settings summary
    const settings = db.prepare('SELECT user_id, key, value FROM settings ORDER BY user_id, key').all();

    res.json({
      userCount: userCount.count,
      recentUsers: users,
      apiKeys: apiKeys,
      settings: settings,
      dbPath: '/app/data/property_call.db'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reset password for a user
app.post('/api/admin/reset-password', express.json(), async (req, res) => {
  const uploadSecret = req.headers['x-upload-secret'];
  if (uploadSecret !== 'migrate-db-2026') {
    return res.status(403).json({ error: 'Invalid secret' });
  }

  const { email, newPassword } = req.body;
  if (!email || !newPassword) {
    return res.status(400).json({ error: 'email and newPassword required' });
  }

  try {
    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.default.hash(newPassword, 10);
    const result = db.prepare('UPDATE users SET password_hash = ? WHERE email = ?').run(hash, email);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true, message: `Password reset for ${email}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Set password hash directly (for migration)
app.post('/api/admin/set-password-hash', express.json(), (req, res) => {
  const uploadSecret = req.headers['x-upload-secret'];
  if (uploadSecret !== 'migrate-db-2026') {
    return res.status(403).json({ error: 'Invalid secret' });
  }

  const { email, passwordHash } = req.body;
  if (!email || !passwordHash) {
    return res.status(400).json({ error: 'email and passwordHash required' });
  }

  try {
    const result = db.prepare('UPDATE users SET password_hash = ? WHERE email = ?').run(passwordHash, email);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true, message: `Password hash set for ${email}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Import settings for a user (for migration)
app.post('/api/admin/import-settings', express.json(), (req, res) => {
  const uploadSecret = req.headers['x-upload-secret'];
  if (uploadSecret !== 'migrate-db-2026') {
    return res.status(403).json({ error: 'Invalid secret' });
  }

  const { userId, settings } = req.body;
  if (!userId || !settings || !Array.isArray(settings)) {
    return res.status(400).json({ error: 'userId and settings array required' });
  }

  try {
    const stmt = db.prepare('INSERT OR REPLACE INTO settings (user_id, key, value) VALUES (?, ?, ?)');
    let imported = 0;
    for (const { key, value } of settings) {
      stmt.run(userId, key, value);
      imported++;
    }
    res.json({ success: true, imported });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Import prompts for a user (for migration)
app.post('/api/admin/import-prompts', express.json(), (req, res) => {
  const uploadSecret = req.headers['x-upload-secret'];
  if (uploadSecret !== 'migrate-db-2026') {
    return res.status(403).json({ error: 'Invalid secret' });
  }

  const { userId, prompts } = req.body;
  if (!userId || !prompts || !Array.isArray(prompts)) {
    return res.status(400).json({ error: 'userId and prompts array required' });
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO prompts (user_id, type, content)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, type) DO UPDATE SET
        content = excluded.content,
        updated_at = datetime('now')
    `);
    let imported = 0;
    for (const { type, content } of prompts) {
      stmt.run(userId, type, content);
      imported++;
    }
    res.json({ success: true, imported });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Set API key for a user (for migration - encrypts with Railway's key)
app.post('/api/admin/set-api-key', express.json(), (req, res) => {
  const uploadSecret = req.headers['x-upload-secret'];
  if (uploadSecret !== 'migrate-db-2026') {
    return res.status(403).json({ error: 'Invalid secret' });
  }

  const { userId, service, apiKey } = req.body;
  if (!userId || !service || !apiKey) {
    return res.status(400).json({ error: 'userId, service, and apiKey required' });
  }

  try {
    const ENCRYPTION_KEY_VAL = process.env.ENCRYPTION_KEY || 'property-call-default-key-32b!';

    // Encrypt the API key using same method as settings.js
    const key = crypto.scryptSync(ENCRYPTION_KEY_VAL, 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(apiKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const encryptedValue = iv.toString('hex') + ':' + encrypted;

    // Insert or update
    const stmt = db.prepare(`
      INSERT INTO api_keys (user_id, service, api_key_encrypted, created_at, updated_at)
      VALUES (?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(user_id, service) DO UPDATE SET
        api_key_encrypted = excluded.api_key_encrypted,
        updated_at = datetime('now')
    `);
    stmt.run(userId, service, encryptedValue);

    res.json({ success: true, message: `API key set for ${service}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new user (for migration)
app.post('/api/admin/create-user', express.json(), async (req, res) => {
  const uploadSecret = req.headers['x-upload-secret'];
  if (uploadSecret !== 'migrate-db-2026') {
    return res.status(403).json({ error: 'Invalid secret' });
  }

  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password required' });
  }

  try {
    // Check if user exists
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.default.hash(password, 10);
    const result = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, hash);

    res.json({ success: true, userId: result.lastInsertRowid, message: `User created: ${email}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const dbUpload = multer({ dest: '/tmp' });
app.post('/api/admin/upload-database', dbUpload.single('database'), (req, res) => {
  const uploadSecret = req.headers['x-upload-secret'];
  if (uploadSecret !== 'migrate-db-2026') {
    return res.status(403).json({ error: 'Invalid upload secret' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No database file provided' });
  }

  try {
    const targetPath = '/app/data/property_call.db';

    // Backup existing database if it exists
    if (fs.existsSync(targetPath)) {
      fs.copyFileSync(targetPath, targetPath + '.backup');
    }
    // Copy uploaded file to database location
    fs.copyFileSync(req.file.path, targetPath);
    // Clean up temp file
    fs.unlinkSync(req.file.path);

    console.log('Database uploaded successfully to', targetPath);
    console.log('File size:', fs.statSync(targetPath).size, 'bytes');

    res.json({
      success: true,
      message: 'Database uploaded. Use "railway restart --yes" to reload (not redeploy!).',
      size: fs.statSync(targetPath).size
    });
  } catch (error) {
    console.error('Database upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Audio bridge stats endpoint
app.get('/api/audio-bridge/stats', (req, res) => {
  const stats = getAudioStreamStats();
  res.json(stats);
});

// Get active audio bridges
app.get('/api/audio-bridge/active', (req, res) => {
  const bridges = audioBridgeManager.getActiveBridges();
  res.json({
    count: bridges.length,
    bridges: bridges.map(b => ({
      callId: b.callId,
      sessionId: b.sessionId,
      isActive: b.isActive,
      stats: b.getStats()
    }))
  });
});

// Test recording endpoint - serves a simple test audio file
app.get('/api/test/recording.mp3', (req, res) => {
  // Generate a simple WAV header + silence for testing
  // This creates a valid 3-second mono 8kHz WAV file
  const sampleRate = 8000;
  const duration = 3; // seconds
  const numSamples = sampleRate * duration;
  const dataSize = numSamples * 2; // 16-bit samples
  const headerSize = 44;
  const buffer = Buffer.alloc(headerSize + dataSize);

  // WAV header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size
  buffer.writeUInt16LE(1, 20); // AudioFormat (PCM)
  buffer.writeUInt16LE(1, 22); // NumChannels
  buffer.writeUInt32LE(sampleRate, 24); // SampleRate
  buffer.writeUInt32LE(sampleRate * 2, 28); // ByteRate
  buffer.writeUInt16LE(2, 32); // BlockAlign
  buffer.writeUInt16LE(16, 34); // BitsPerSample
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Generate a simple tone (440Hz beep)
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const value = Math.sin(2 * Math.PI * 440 * t) * 0.3 * 32767;
    buffer.writeInt16LE(Math.round(value), headerSize + i * 2);
  }

  res.setHeader('Content-Type', 'audio/wav');
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Accept-Ranges', 'bytes');
  res.send(buffer);
});

// Test endpoint to simulate conversation events (development only)
if (process.env.NODE_ENV !== 'production') {
  app.post('/api/test/conversation-event', (req, res) => {
    const { callId, eventType, content } = req.body;

    if (!callId || !eventType) {
      return res.status(400).json({ error: 'callId and eventType are required' });
    }

    broadcastToMonitors({
      type: 'conversation_event',
      data: {
        callId,
        eventType,
        content,
        timestamp: new Date().toISOString()
      }
    });

    console.log(`[Test] Broadcasted conversation event: ${eventType} for call ${callId}`);
    res.json({ success: true, eventType, callId });
  });
}

// WebSocket connection handling
wss.on('connection', async (ws) => {
  console.log('Live monitoring client connected');

  // Send current active calls on connect
  try {
    const { db } = await import('./db/setup.js');
    const activeCalls = db.prepare(`
      SELECT
        c.*,
        l.first_name,
        l.last_name,
        l.property_address,
        l.phones
      FROM calls c
      LEFT JOIN leads l ON c.lead_id = l.id
      WHERE c.status = 'in_progress'
      ORDER BY c.started_at DESC
    `).all();

    const parsedCalls = activeCalls.map(call => ({
      ...call,
      phones: call.phones ? JSON.parse(call.phones) : [],
      answers: call.answers ? JSON.parse(call.answers) : {}
    }));

    ws.send(JSON.stringify({
      type: 'active_calls_sync',
      data: { calls: parsedCalls }
    }));
  } catch (err) {
    console.error('Error fetching active calls for WebSocket:', err);
  }

  ws.on('message', (message) => {
    console.log('Received:', message.toString());
  });

  ws.on('close', () => {
    console.log('Live monitoring client disconnected');
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
// IMPORTANT: Skip WebSocket paths - they are handled by the upgrade event, not Express routes
app.use((req, res) => {
  // WebSocket paths should not trigger 404 - they're handled by the 'upgrade' event on the server
  // If we get here for a WS path, it means the upgrade hasn't happened yet
  if (req.path.startsWith('/ws/')) {
    console.log(`[404 Handler] WebSocket path hit HTTP handler (should be upgrade): ${req.path}`);
    // Don't send 404 for WebSocket paths - let the connection stay open for upgrade
    // This can happen if the client doesn't send proper upgrade headers
    return res.status(400).json({ error: 'WebSocket upgrade required' });
  }
  res.status(404).json({ error: 'Not found' });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`Property Call backend running on port ${PORT}`);
  console.log(`========================================`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`WebSocket Monitor: ws://localhost:${PORT}/ws/monitor`);
  console.log(`WebSocket Audio: ws://localhost:${PORT}/ws/audio`);
  console.log(`WebSocket Listen: ws://localhost:${PORT}/ws/listen/:callId`);
  console.log(`Audio Bridge Stats: http://localhost:${PORT}/api/audio-bridge/stats`);
  console.log(`========================================\n`);
});

export default app;
