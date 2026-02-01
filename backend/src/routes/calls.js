import express from 'express';
import crypto from 'crypto';
import { db } from '../db/setup.js';
import { requireAuth } from '../middleware/auth.js';
import { getTimezoneForLead, isWithinCallingHours } from '../utils/timezone.js';
import { createProviderInstance } from '../providers/provider-factory.js';

const router = express.Router();

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
    console.error('Decryption error:', error);
    return null;
  }
}

// Get FUB API base URL (supports mock server for testing)
function getFubApiBase() {
  return process.env.FUB_API_BASE || 'https://api.followupboss.com';
}

/**
 * Get the configured telephony provider for the user
 * This abstracts Telnyx-specific logic into the provider layer
 *
 * @param {number} userId - User ID
 * @returns {Promise<Object>} Provider instance and configuration
 * @throws {Error} If provider not configured
 */
async function getTelephonyProvider(userId) {
  // Get the user's preferred provider from settings (default: telnyx)
  const providerSetting = db.prepare(`
    SELECT value FROM settings WHERE user_id = ? AND key = 'telephony_provider'
  `).get(userId);

  const providerName = providerSetting?.value || 'telnyx';

  // Create provider instance and get configuration based on provider type
  let provider;
  const config = {};

  if (providerName === 'telnyx') {
    // Get Telnyx API key
    const apiKeyRow = db.prepare(`
      SELECT api_key_encrypted FROM api_keys WHERE user_id = ? AND service = 'telnyx'
    `).get(userId);

    if (!apiKeyRow || !apiKeyRow.api_key_encrypted) {
      throw new Error('Telnyx API key not configured');
    }

    const apiKey = decrypt(apiKeyRow.api_key_encrypted);
    if (!apiKey) {
      throw new Error('Failed to decrypt Telnyx API key');
    }

    // Create and initialize Telnyx provider
    provider = await createProviderInstance('telnyx');
    await provider.initialize(apiKey);

    // Get Telnyx phone number from settings
    const phoneSetting = db.prepare(`
      SELECT value FROM settings WHERE user_id = ? AND key = 'telnyx_phone_number'
    `).get(userId);

    if (!phoneSetting?.value) {
      throw new Error('Telnyx phone number not configured');
    }

    config.fromPhoneNumber = phoneSetting.value;

  } else if (providerName === 'signalwire') {
    // Get SignalWire credentials
    const projectIdRow = db.prepare(`
      SELECT api_key_encrypted FROM api_keys WHERE user_id = ? AND service = 'signalwire_project_id'
    `).get(userId);

    const apiTokenRow = db.prepare(`
      SELECT api_key_encrypted FROM api_keys WHERE user_id = ? AND service = 'signalwire_api_token'
    `).get(userId);

    const spaceUrlRow = db.prepare(`
      SELECT value FROM settings WHERE user_id = ? AND key = 'signalwire_space_url'
    `).get(userId);

    if (!projectIdRow || !apiTokenRow || !spaceUrlRow?.value) {
      throw new Error('SignalWire credentials not configured');
    }

    const projectId = decrypt(projectIdRow.api_key_encrypted);
    const apiToken = decrypt(apiTokenRow.api_key_encrypted);
    const spaceUrl = spaceUrlRow.value;

    if (!projectId || !apiToken) {
      throw new Error('Failed to decrypt SignalWire credentials');
    }

    // Create and initialize SignalWire provider
    provider = await createProviderInstance('signalwire');
    await provider.initialize({ projectId, apiToken, spaceUrl });

    // Get SignalWire phone number from settings (stored as signalwire_default_phone_number)
    const phoneSetting = db.prepare(`
      SELECT value FROM settings WHERE user_id = ? AND key = 'signalwire_default_phone_number'
    `).get(userId);

    if (!phoneSetting?.value) {
      throw new Error('SignalWire phone number not configured. Please select a phone number in Settings.');
    }

    config.fromPhoneNumber = phoneSetting.value;

  } else {
    throw new Error(`Unsupported telephony provider: ${providerName}`);
  }

  return { provider, providerName, config };
}

// Apply auth middleware to all calls routes
router.use(requireAuth);

// Import broadcast function for real-time updates
let broadcastToMonitors = null;
import('../index.js').then(mod => {
  broadcastToMonitors = mod.broadcastToMonitors;
}).catch(() => {
  // Will be undefined if import fails (during initial load)
  console.log('WebSocket broadcast function not yet available');
});

// Helper function to broadcast call updates
function broadcastCallUpdate(type, call) {
  if (broadcastToMonitors) {
    broadcastToMonitors({ type, data: call });
  }
}

// Valid qualification statuses as per app spec
const VALID_QUALIFICATION_STATUSES = ['Qualified', 'Not Qualified', "Couldn't Reach"];

// Valid dispositions
const VALID_DISPOSITIONS = [
  'Callback Scheduled',
  'Not Interested',
  'Wrong Number',
  'Already Sold',
  'Voicemail Left',
  'No Answer',
  'Disqualified'
];

// Valid sentiments
const VALID_SENTIMENTS = [
  'Very Motivated',
  'Somewhat Motivated',
  'Neutral',
  'Reluctant',
  'Not Interested'
];

// Get all calls with pagination and filtering
router.get('/', (req, res) => {
  try {
    const { page = 1, limit = 50, lead_id, status, qualification_status, disposition, date_from, date_to, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Filter by authenticated user's ID (via leads table)
    let whereClause = 'l.user_id = ?';
    const params = [req.user.id];

    if (lead_id) {
      whereClause += ' AND c.lead_id = ?';
      params.push(lead_id);
    }

    if (status) {
      whereClause += ' AND c.status = ?';
      params.push(status);
    }

    if (qualification_status) {
      whereClause += ' AND c.qualification_status = ?';
      params.push(qualification_status);
    }

    if (disposition) {
      whereClause += ' AND c.disposition = ?';
      params.push(disposition);
    }

    if (date_from) {
      whereClause += ' AND c.created_at >= ?';
      params.push(date_from);
    }

    if (date_to) {
      whereClause += ' AND c.created_at <= ?';
      params.push(date_to);
    }

    if (search) {
      whereClause += ' AND (l.first_name LIKE ? OR l.last_name LIKE ? OR l.property_address LIKE ? OR l.phones LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM calls c
      LEFT JOIN leads l ON c.lead_id = l.id
      WHERE ${whereClause}
    `;
    const { total } = db.prepare(countQuery).get(...params);

    // Get calls with lead info
    const callsQuery = `
      SELECT
        c.*,
        l.first_name,
        l.last_name,
        l.property_address,
        l.property_city,
        l.property_state,
        l.phones
      FROM calls c
      LEFT JOIN leads l ON c.lead_id = l.id
      WHERE ${whereClause}
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const calls = db.prepare(callsQuery).all(...params, parseInt(limit), offset);

    // Parse JSON fields
    const parsedCalls = calls.map(call => ({
      ...call,
      phones: call.phones ? JSON.parse(call.phones) : [],
      answers: call.answers ? JSON.parse(call.answers) : {}
    }));

    res.json({
      calls: parsedCalls,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching calls:', error);
    res.status(500).json({ error: 'Failed to fetch calls' });
  }
});

// Get active/in-progress calls
router.get('/active', (req, res) => {
  try {
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

    res.json({ calls: parsedCalls });
  } catch (error) {
    console.error('Error fetching active calls:', error);
    res.status(500).json({ error: 'Failed to fetch active calls' });
  }
});

// Export calls to CSV
router.get('/export/csv', (req, res) => {
  try {
    const { qualification_status, disposition, search, date_from, date_to } = req.query;

    let whereClause = '1=1';
    const params = [];

    if (qualification_status) {
      whereClause += ' AND c.qualification_status = ?';
      params.push(qualification_status);
    }

    if (disposition) {
      whereClause += ' AND c.disposition = ?';
      params.push(disposition);
    }

    if (date_from) {
      whereClause += ' AND c.created_at >= ?';
      params.push(date_from);
    }

    if (date_to) {
      whereClause += ' AND c.created_at <= ?';
      params.push(date_to);
    }

    if (search) {
      whereClause += ' AND (l.first_name LIKE ? OR l.last_name LIKE ? OR l.property_address LIKE ? OR l.phones LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Get all matching calls (no pagination for export)
    const callsQuery = `
      SELECT
        c.id,
        c.lead_id,
        l.first_name,
        l.last_name,
        l.property_address,
        l.property_city,
        l.property_state,
        l.property_zip,
        l.phones,
        c.status,
        c.qualification_status,
        c.disposition,
        c.sentiment,
        c.duration_seconds,
        c.started_at,
        c.ended_at,
        c.callback_time,
        c.recording_url,
        c.ai_summary,
        c.answers,
        c.created_at
      FROM calls c
      LEFT JOIN leads l ON c.lead_id = l.id
      WHERE ${whereClause}
      ORDER BY c.created_at DESC
    `;

    const calls = db.prepare(callsQuery).all(...params);

    // Define CSV columns
    const columns = [
      'ID',
      'Lead ID',
      'First Name',
      'Last Name',
      'Property Address',
      'City',
      'State',
      'ZIP',
      'Phone',
      'Status',
      'Qualification Status',
      'Disposition',
      'Sentiment',
      'Duration (seconds)',
      'Started At',
      'Ended At',
      'Callback Time',
      'Recording URL',
      'AI Summary',
      'Call Date'
    ];

    // Helper to escape CSV values
    const escapeCSV = (value) => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      // Escape quotes and wrap in quotes if contains comma, newline, or quote
      if (str.includes(',') || str.includes('\n') || str.includes('"')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };

    // Build CSV content
    let csv = columns.join(',') + '\n';

    for (const call of calls) {
      // Extract primary phone number from phones JSON
      let primaryPhone = '';
      try {
        const phones = call.phones ? JSON.parse(call.phones) : [];
        if (phones.length > 0) {
          primaryPhone = phones[0].number || phones[0];
        }
      } catch (e) {
        primaryPhone = call.phones || '';
      }

      const row = [
        call.id,
        call.lead_id,
        call.first_name,
        call.last_name,
        call.property_address,
        call.property_city,
        call.property_state,
        call.property_zip,
        primaryPhone,
        call.status,
        call.qualification_status,
        call.disposition,
        call.sentiment,
        call.duration_seconds,
        call.started_at,
        call.ended_at,
        call.callback_time,
        call.recording_url,
        call.ai_summary,
        call.created_at
      ].map(escapeCSV);

      csv += row.join(',') + '\n';
    }

    // Set response headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=call-history.csv');
    res.send(csv);
  } catch (error) {
    console.error('Error exporting calls to CSV:', error);
    res.status(500).json({ error: 'Failed to export calls' });
  }
});

// Get call statistics (must be before /:id route)
router.get('/stats/summary', (req, res) => {
  try {
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_calls,
        SUM(CASE WHEN qualification_status = 'Qualified' THEN 1 ELSE 0 END) as qualified,
        SUM(CASE WHEN qualification_status = 'Not Qualified' THEN 1 ELSE 0 END) as not_qualified,
        SUM(CASE WHEN qualification_status = 'Couldn''t Reach' THEN 1 ELSE 0 END) as couldnt_reach,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
        AVG(duration_seconds) as avg_duration
      FROM calls
    `).get();

    res.json(stats);
  } catch (error) {
    console.error('Error fetching call stats:', error);
    res.status(500).json({ error: 'Failed to fetch call statistics' });
  }
});

// Get a single call by ID
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;

    const call = db.prepare(`
      SELECT
        c.*,
        l.first_name,
        l.last_name,
        l.property_address,
        l.property_city,
        l.property_state,
        l.property_zip,
        l.phones,
        l.email
      FROM calls c
      LEFT JOIN leads l ON c.lead_id = l.id
      WHERE c.id = ?
    `).get(id);

    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    res.json({
      ...call,
      phones: call.phones ? JSON.parse(call.phones) : [],
      answers: call.answers ? JSON.parse(call.answers) : {}
    });
  } catch (error) {
    console.error('Error fetching call:', error);
    res.status(500).json({ error: 'Failed to fetch call' });
  }
});

// Get call recording URL
router.get('/:id/recording', (req, res) => {
  try {
    const { id } = req.params;

    const call = db.prepare('SELECT recording_url FROM calls WHERE id = ?').get(id);

    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    if (!call.recording_url) {
      return res.status(404).json({ error: 'No recording available for this call' });
    }

    res.json({ recording_url: call.recording_url });
  } catch (error) {
    console.error('Error fetching recording:', error);
    res.status(500).json({ error: 'Failed to fetch recording' });
  }
});

// Get call transcript
router.get('/:id/transcript', (req, res) => {
  try {
    const { id } = req.params;

    const call = db.prepare('SELECT transcript FROM calls WHERE id = ?').get(id);

    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    if (!call.transcript) {
      return res.status(404).json({ error: 'No transcript available for this call' });
    }

    res.json({ transcript: call.transcript });
  } catch (error) {
    console.error('Error fetching transcript:', error);
    res.status(500).json({ error: 'Failed to fetch transcript' });
  }
});

// Trigger/initiate a call for a lead via Telnyx
router.post('/trigger', async (req, res) => {
  try {
    const { lead_id, phone_index: requestedPhoneIndex } = req.body;

    if (!lead_id) {
      return res.status(400).json({ error: 'lead_id is required' });
    }

    // Check if lead exists and get lead info (including property state for timezone)
    const lead = db.prepare(`
      SELECT id, first_name, last_name, property_address, property_state, phones
      FROM leads WHERE id = ?
    `).get(lead_id);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Parse lead's phone numbers
    let phoneNumbers = [];
    try {
      phoneNumbers = lead.phones ? JSON.parse(lead.phones) : [];
    } catch (e) {
      phoneNumbers = [];
    }

    if (phoneNumbers.length === 0) {
      return res.status(400).json({
        error: 'No phone number available',
        message: 'Lead has no valid phone number to call'
      });
    }

    // Determine which phone index to use (supports phone rotation - Feature #159)
    // If phone_index is provided, use it; otherwise default to 0
    let phoneIndex = requestedPhoneIndex !== undefined ? parseInt(requestedPhoneIndex) : 0;

    // Handle phone rotation: if requested index is beyond available phones, wrap around
    if (phoneIndex >= phoneNumbers.length) {
      phoneIndex = phoneIndex % phoneNumbers.length;
    }

    // Get the phone number at the specified index
    let toPhoneNumber = null;
    const phoneEntry = phoneNumbers[phoneIndex];
    if (typeof phoneEntry === 'object' && phoneEntry.number) {
      toPhoneNumber = phoneEntry.number;
    } else if (typeof phoneEntry === 'string') {
      toPhoneNumber = phoneEntry;
    }

    if (!toPhoneNumber) {
      return res.status(400).json({
        error: 'No phone number available',
        message: `Lead has no valid phone number at index ${phoneIndex}`
      });
    }

    // Check if queue is paused
    const userId = req.user?.id || 1;
    const queuePausedSetting = db.prepare(`
      SELECT value FROM settings WHERE user_id = ? AND key = 'queue_paused'
    `).get(userId);

    const queuePaused = queuePausedSetting ? queuePausedSetting.value === 'true' : false;

    if (queuePaused) {
      return res.status(403).json({
        error: 'Queue is paused',
        message: 'Cannot initiate calls while the queue is paused. Resume the queue to continue calling.',
        paused: true
      });
    }

    // Feature #280: Check provider health before initiating call
    let providerHealthResult = null;
    try {
      // Get the telephony provider for health check
      let healthCheckProvider;
      try {
        ({ provider: healthCheckProvider, providerName } = await getTelephonyProvider(userId));
      } catch (configError) {
        // Provider not configured - this will be caught later when trying to initiate the call
        console.log('[Feature #280] Provider not configured, skipping health check');
        healthCheckProvider = null;
      }

      if (healthCheckProvider) {
        // Perform health check
        providerHealthResult = await healthCheckProvider.healthCheck();

        if (!providerHealthResult.healthy) {
          // Provider is down - auto-pause the queue
          console.log(`[Feature #280] Provider ${providerName} health check failed, auto-pausing queue`);

          // Pause the queue
          db.prepare(`
            INSERT OR REPLACE INTO settings (user_id, key, value, created_at, updated_at)
            VALUES (?, 'queue_paused', 'true', datetime('now'), datetime('now'))
          `).run(userId);

          // Log the pause reason
          db.prepare(`
            INSERT INTO provider_errors (provider, error_type, error_message, created_at)
            VALUES (?, 'health_check_failed', ?, datetime('now'))
          `).run(providerName, `Auto-pause: ${providerHealthResult.error || 'Health check failed'}`);

          // Return error with auto-pause information
          return res.status(503).json({
            error: 'Provider unavailable',
            message: `${providerName} is currently unavailable. The call queue has been automatically paused to prevent failed calls.`,
            provider: providerName,
            healthCheckResult: providerHealthResult,
            autoPaused: true,
            guidance: 'Check the Settings page for provider status. The queue will resume automatically when the provider recovers.'
          });
        } else {
          console.log(`[Feature #280] Provider ${providerName} health check passed (${providerHealthResult.responseTimeMs || 0}ms)`);
        }
      }
    } catch (healthCheckError) {
      // If health check itself fails, log but don't block the call
      // The call initiation will fail if the provider is truly down
      console.error('[Feature #280] Provider health check error:', healthCheckError);
    }

    // Get timezone for lead based on property state
    const timezone = getTimezoneForLead(lead);

    // Get calling hours from settings
    const startTimeSetting = db.prepare(`
      SELECT value FROM settings WHERE key = 'call_start_time'
    `).get();
    const endTimeSetting = db.prepare(`
      SELECT value FROM settings WHERE key = 'call_end_time'
    `).get();

    const startTime = startTimeSetting?.value || '09:00';
    const endTime = endTimeSetting?.value || '19:00';

    // Check if current time is within calling hours for lead's timezone
    if (!isWithinCallingHours(timezone, startTime, endTime)) {
      return res.status(403).json({
        error: 'Outside calling hours',
        message: `Cannot call ${lead.first_name} ${lead.last_name} at this time. Current time is outside allowed calling hours (${startTime}-${endTime} ${timezone}).`,
        timezone,
        allowed_hours: { start: startTime, end: endTime }
      });
    }

    // Check if there's already an active call (one call at a time enforcement)
    const activeCall = db.prepare(`
      SELECT id, lead_id
      FROM calls
      WHERE status IN ('in_progress', 'initiated')
      LIMIT 1
    `).get();

    if (activeCall) {
      return res.status(409).json({
        error: 'A call is already in progress',
        message: 'Only one call can be active at a time. Please wait for the current call to complete.',
        active_call_id: activeCall.id
      });
    }

    // Get telephony provider (abstracts Telnyx-specific logic)
    let provider, providerName, providerConfig;
    try {
      ({ provider, providerName, config: providerConfig } = await getTelephonyProvider(userId));
    } catch (configError) {
      return res.status(400).json({
        error: 'Telephony provider not configured',
        message: configError.message
      });
    }

    const fromPhoneNumber = providerConfig.fromPhoneNumber;

    // Create a new call record with 'ringing' status
    // Include phone_index and phone_number_used for phone rotation tracking (Feature #159)
    // Include user_id so the WebSocket handler can retrieve the correct API keys
    const result = db.prepare(`
      INSERT INTO calls (lead_id, user_id, status, started_at, phone_index, phone_number_used)
      VALUES (?, ?, 'ringing', datetime('now'), ?, ?)
    `).run(lead_id, userId, phoneIndex, toPhoneNumber);

    const callId = result.lastInsertRowid;

    // Initiate call through provider (abstracts Telnyx API calls)
    let providerCallId = null;
    try {
      const callParams = {
        to: toPhoneNumber,
        from: fromPhoneNumber,
        connectionId: process.env.TELNYX_CONNECTION_ID,
        webhookUrl: process.env.TELNYX_WEBHOOK_URL || `http://localhost:3000/api/webhooks/telnyx`,
        webhookMethod: 'POST',
        amd: { enabled: true, mode: 'detect' },
        timeoutSecs: 30
      };

      const result = await provider.initiateCall(callParams);

      if (result.success && result.callControlId) {
        providerCallId = result.callControlId;

        // Update call record with provider call ID
        db.prepare(`
          UPDATE calls SET telnyx_call_id = ?, status = 'ringing' WHERE id = ?
        `).run(providerCallId, callId);
      } else {
        // Provider error - mark call as failed
        db.prepare(`
          UPDATE calls SET status = 'failed', ended_at = datetime('now') WHERE id = ?
        `).run(callId);

        return res.status(502).json({
          error: 'Provider API error',
          message: 'Failed to initiate call through provider',
          details: result.error
        });
      }
    } catch (providerError) {
      // Network or other error calling provider
      db.prepare(`
        UPDATE calls SET status = 'failed', ended_at = datetime('now') WHERE id = ?
      `).run(callId);

      console.error(`${providerName} API error:`, providerError);
      return res.status(502).json({
        error: `Failed to connect to ${providerName}`,
        message: providerError.message
      });
    }

    // Fetch the newly created call with lead info
    const newCall = db.prepare(`
      SELECT
        c.*,
        l.first_name,
        l.last_name,
        l.property_address,
        l.phones
      FROM calls c
      LEFT JOIN leads l ON c.lead_id = l.id
      WHERE c.id = ?
    `).get(callId);

    // Parse JSON fields
    const parsedCall = {
      ...newCall,
      phones: newCall.phones ? JSON.parse(newCall.phones) : [],
      answers: newCall.answers ? JSON.parse(newCall.answers) : {}
    };

    // Broadcast to live monitoring clients
    broadcastCallUpdate('call_started', parsedCall);

    res.status(201).json({
      message: `Call initiated through ${providerName}`,
      call_id: callId,
      telnyx_call_id: providerCallId, // Keep for backward compatibility
      provider_call_id: providerCallId,
      provider: providerName,
      phone_rotation: {
        phone_index: phoneIndex,
        phone_used: toPhoneNumber,
        total_phones: phoneNumbers.length
      },
      call: parsedCall
    });
  } catch (error) {
    console.error('Error triggering call:', error);
    res.status(500).json({ error: 'Failed to trigger call' });
  }
});

// Test call endpoint - initiates a call to user's phone with fake lead data (Feature #222)
// Updated: Fixed schema compatibility by removing non-existent columns
// Updated: Added API integration verification before starting (Feature #229)
router.post('/test-call', async (req, res) => {
  try {
    const { phone_number, first_name, last_name, street, city, state } = req.body;

    // Validate required fields
    if (!phone_number) {
      return res.status(400).json({ error: 'phone_number is required' });
    }

    if (!first_name) {
      return res.status(400).json({ error: 'first_name is required' });
    }

    if (!street || !city || !state) {
      return res.status(400).json({ error: 'Property address (street, city, state) is required' });
    }

    // Get user ID from auth
    const userId = req.user?.id || 1;

    // Feature #229: Verify all required API integrations before starting test call
    // Check telephony provider (Telnyx or SignalWire) and Deepgram API keys
    const missingIntegrations = [];
    const invalidIntegrations = [];

    // Get the user's selected telephony provider
    const providerSetting = db.prepare(`
      SELECT value FROM settings WHERE user_id = ? AND key = 'telephony_provider'
    `).get(userId);
    const selectedProvider = providerSetting?.value || 'telnyx';

    // Get all API keys for the user
    const apiKeys = db.prepare(`
      SELECT service, api_key_encrypted FROM api_keys WHERE user_id = ?
    `).all(userId);

    const keyMap = {};
    for (const row of apiKeys) {
      keyMap[row.service] = row.api_key_encrypted;
    }

    // Check telephony provider API key based on user's selection
    if (selectedProvider === 'telnyx') {
      if (!keyMap.telnyx) {
        missingIntegrations.push('Telnyx');
      } else {
        const telnyxKey = decrypt(keyMap.telnyx);
        if (!telnyxKey) {
          invalidIntegrations.push('Telnyx (decryption failed)');
        }
      }
    } else if (selectedProvider === 'signalwire') {
      // SignalWire requires project_id, api_token, and space_url
      const hasProjectId = keyMap.signalwire_project_id;
      const hasApiToken = keyMap.signalwire_api_token;
      const spaceUrlSetting = db.prepare(`
        SELECT value FROM settings WHERE user_id = ? AND key = 'signalwire_space_url'
      `).get(userId);

      if (!hasProjectId || !hasApiToken || !spaceUrlSetting?.value) {
        missingIntegrations.push('SignalWire');
      } else {
        const projectId = decrypt(hasProjectId);
        const apiToken = decrypt(hasApiToken);
        if (!projectId || !apiToken) {
          invalidIntegrations.push('SignalWire (decryption failed)');
        }
      }
    }

    // Check Deepgram API key (required for voice AI STT/TTS)
    if (!keyMap.deepgram) {
      missingIntegrations.push('Deepgram');
    } else {
      const deepgramKey = decrypt(keyMap.deepgram);
      if (!deepgramKey) {
        invalidIntegrations.push('Deepgram (decryption failed)');
      }
    }

    // Note: OpenAI is optional - Deepgram Voice Agent can use its built-in LLM
    // Only check OpenAI if the user has configured it
    if (keyMap.openai) {
      const openaiKey = decrypt(keyMap.openai);
      if (!openaiKey) {
        invalidIntegrations.push('OpenAI (decryption failed)');
      } else if (!openaiKey.startsWith('sk-')) {
        invalidIntegrations.push('OpenAI (invalid key format - must start with sk-)');
      }
    }

    // If any integrations are missing, return error with specific details
    if (missingIntegrations.length > 0 || invalidIntegrations.length > 0) {
      const errors = [];

      if (missingIntegrations.length > 0) {
        errors.push(`Missing API keys: ${missingIntegrations.join(', ')}`);
      }

      if (invalidIntegrations.length > 0) {
        errors.push(`Invalid API keys: ${invalidIntegrations.join(', ')}`);
      }

      const providerName = selectedProvider === 'signalwire' ? 'SignalWire' : 'Telnyx';
      return res.status(400).json({
        error: 'API integrations not configured',
        message: `Cannot start test call. ${errors.join('. ')}. Please configure all required API keys in Configuration > API Keys.`,
        missing: missingIntegrations,
        invalid: invalidIntegrations,
        required: [providerName, 'Deepgram']
      });
    }

    // Get telephony provider
    let provider, providerName, providerConfig;
    try {
      ({ provider, providerName, config: providerConfig } = await getTelephonyProvider(userId));
    } catch (configError) {
      return res.status(400).json({
        error: 'Telephony provider not configured',
        message: configError.message
      });
    }

    // Feature #280: Check provider health before initiating test call
    try {
      const healthCheckResult = await provider.healthCheck();

      if (!healthCheckResult.healthy) {
        // Provider is down - auto-pause the queue
        console.log(`[Feature #280] Provider ${providerName} health check failed for test call, auto-pausing queue`);

        // Pause the queue
        db.prepare(`
          INSERT OR REPLACE INTO settings (user_id, key, value, created_at, updated_at)
          VALUES (?, 'queue_paused', 'true', datetime('now'), datetime('now'))
        `).run(userId);

        // Log the pause reason
        db.prepare(`
          INSERT INTO provider_errors (provider, error_type, error_message, created_at)
          VALUES (?, 'health_check_failed', ?, datetime('now'))
        `).run(providerName, `Auto-pause: ${healthCheckResult.error || 'Health check failed'}`);

        // Return error with auto-pause information
        return res.status(503).json({
          error: 'Provider unavailable',
          message: `${providerName} is currently unavailable. Cannot start test call. The call queue has been automatically paused.`,
          provider: providerName,
          healthCheckResult: healthCheckResult,
          autoPaused: true,
          guidance: 'Check the Settings page for provider status. The queue will resume automatically when the provider recovers.'
        });
      }
    } catch (healthCheckError) {
      // If health check itself fails, log but don't block the test call
      console.error('[Feature #280] Provider health check error for test call:', healthCheckError);
    }

    // Note: Test calls are allowed even when the queue is paused
    // This enables users to verify their configuration without affecting the queue

    // Clean up any stale calls (stuck in ringing/initiated for more than 5 minutes)
    db.prepare(`
      UPDATE calls SET status = 'failed', ended_at = datetime('now')
      WHERE status IN ('in_progress', 'initiated', 'ringing')
      AND created_at < datetime('now', '-5 minutes')
    `).run();

    // Check if there's a recent active call (created within the last 5 minutes)
    // This prevents initiating a new call while one is genuinely in progress
    const activeCall = db.prepare(`
      SELECT id, lead_id
      FROM calls
      WHERE status IN ('in_progress', 'initiated', 'ringing')
      AND created_at >= datetime('now', '-5 minutes')
      LIMIT 1
    `).get();

    if (activeCall) {
      return res.status(409).json({
        error: 'A call is already in progress',
        message: 'Please wait for the current call to complete before starting a new test call.',
        active_call_id: activeCall.id
      });
    }

    const fromPhoneNumber = providerConfig.fromPhoneNumber;

    // Create a temporary test lead (status='test' marks it as test lead)
    const testLeadResult = db.prepare(`
      INSERT INTO leads (
        user_id, first_name, last_name, property_address, property_city, property_state,
        phones, status, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'test', datetime('now'), datetime('now'))
    `).run(
      userId,
      first_name,
      last_name || '',
      street,
      city,
      state,
      JSON.stringify([{ type: 'test', number: phone_number }])
    );

    const testLeadId = testLeadResult.lastInsertRowid;

    // Create a call record with 'ringing' status
    // Include user_id so the WebSocket handler can retrieve the correct API keys
    const callResult = db.prepare(`
      INSERT INTO calls (lead_id, user_id, status, started_at, phone_index, phone_number_used)
      VALUES (?, ?, 'ringing', datetime('now'), 0, ?)
    `).run(testLeadId, userId, phone_number);

    const callId = callResult.lastInsertRowid;

    // Initiate call through provider
    let providerCallId = null;

    try {
      // Build webhook URL based on provider
      // For SignalWire: The Url parameter must return LaML (TwiML) instructions
      // For Telnyx: Uses call control API, different approach
      let webhookUrl;
      if (providerName === 'signalwire') {
        // Use public webhook URL if configured, otherwise localhost (for testing with ngrok)
        const baseUrl = process.env.SIGNALWIRE_WEBHOOK_URL || process.env.WEBHOOK_BASE_URL || 'http://localhost:3000';
        webhookUrl = `${baseUrl}/api/webhooks/signalwire/laml?callId=${callId}`;
        console.log(`[Call ${callId}] Using webhook base URL: ${baseUrl}`);
        console.log(`[Call ${callId}] Full webhook URL: ${webhookUrl}`);
      } else {
        webhookUrl = process.env.TELNYX_WEBHOOK_URL || 'http://localhost:3000/api/webhooks/telnyx';
      }

      const callParams = {
        to: phone_number,
        from: fromPhoneNumber,
        connectionId: process.env.TELNYX_CONNECTION_ID,
        webhookUrl: webhookUrl,
        webhookMethod: 'POST',
        amd: { enabled: true, mode: 'detect' },
        timeoutSecs: 30
      };

      const result = await provider.initiateCall(callParams);

      if (result.success && result.callControlId) {
        providerCallId = result.callControlId;

        // Update call record with provider call ID
        // Use appropriate column based on provider
        if (providerName === 'signalwire') {
          db.prepare(`
            UPDATE calls SET signalwire_call_id = ?, status = 'ringing' WHERE id = ?
          `).run(providerCallId, callId);
        } else {
          db.prepare(`
            UPDATE calls SET telnyx_call_id = ?, status = 'ringing' WHERE id = ?
          `).run(providerCallId, callId);
        }
      } else {
        // Provider error - mark call as failed
        db.prepare(`
          UPDATE calls SET status = 'failed', ended_at = datetime('now') WHERE id = ?
        `).run(callId);

        // Clean up test lead
        db.prepare("DELETE FROM leads WHERE id = ? AND status = 'test'").run(testLeadId);

        return res.status(502).json({
          error: `${providerName} API error`,
          message: `Failed to initiate test call through ${providerName}`,
          details: result.error
        });
      }
    } catch (providerError) {
      // Network or other error calling provider
      db.prepare(`
        UPDATE calls SET status = 'failed', ended_at = datetime('now') WHERE id = ?
      `).run(callId);

      // Clean up test lead
      db.prepare("DELETE FROM leads WHERE id = ? AND status = 'test'").run(testLeadId);

      console.error(`${providerName} API error:`, providerError);
      return res.status(502).json({
        error: `Failed to connect to ${providerName}`,
        message: providerError.message
      });
    }

    // Fetch the newly created call with lead info
    const newCall = db.prepare(`
      SELECT
        c.*,
        l.first_name,
        l.last_name,
        l.property_address,
        l.property_city,
        l.property_state,
        l.phones
      FROM calls c
      LEFT JOIN leads l ON c.lead_id = l.id
      WHERE c.id = ?
    `).get(callId);

    // Parse JSON fields
    const parsedCall = {
      ...newCall,
      phones: newCall.phones ? JSON.parse(newCall.phones) : [],
      answers: newCall.answers ? JSON.parse(newCall.answers) : {}
    };

    // Broadcast to live monitoring clients
    broadcastCallUpdate('call_started', parsedCall);

    console.log(`[TEST CALL] Initiated test call to ${phone_number} for fake lead: ${first_name} ${last_name || ''} at ${street}, ${city}, ${state}`);

    res.status(201).json({
      message: `Test call initiated successfully via ${providerName}`,
      call_id: callId,
      telnyx_call_id: providerCallId, // Keep for backward compatibility
      provider_call_id: providerCallId,
      test_lead_id: testLeadId,
      to_phone: phone_number,
      from_phone: fromPhoneNumber,
      provider: providerName,
      fake_lead: {
        first_name,
        last_name: last_name || '',
        property_address: `${street}, ${city}, ${state}`
      },
      call: parsedCall
    });
  } catch (error) {
    console.error('Error initiating test call:', error);
    res.status(500).json({ error: 'Failed to initiate test call', details: error.message });
  }
});

// End/cancel a call (Feature #230)
// This endpoint allows users to terminate an active call
router.post('/:id/end', async (req, res) => {
  try {
    const { id } = req.params;

    // Get call info
    const call = db.prepare(`
      SELECT c.*, l.first_name, l.last_name
      FROM calls c
      LEFT JOIN leads l ON c.lead_id = l.id
      WHERE c.id = ?
    `).get(id);

    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    // Check if call is in a state that can be ended
    const activeStatuses = ['in_progress', 'initiated', 'ringing'];
    if (!activeStatuses.includes(call.status)) {
      return res.status(400).json({
        error: 'Call cannot be ended',
        message: `Call is already ${call.status}. Only active calls can be ended.`,
        status: call.status
      });
    }

    // Get Telnyx call control ID
    const telnyxCallId = call.telnyx_call_id;
    if (!telnyxCallId) {
      // No Telnyx call ID - just update the database
      db.prepare(`
        UPDATE calls SET status = 'cancelled', ended_at = datetime('now') WHERE id = ?
      `).run(id);

      return res.json({
        message: 'Call cancelled (no active Telnyx call)',
        call_id: id,
        status: 'cancelled'
      });
    }

    // Get user ID from auth
    const userId = req.user?.id || 1;

    // Get telephony provider
    let provider, providerName;
    try {
      ({ provider, providerName } = await getTelephonyProvider(userId));
    } catch (configError) {
      // If provider not configured, just update the database
      db.prepare(`
        UPDATE calls SET status = 'cancelled', ended_at = datetime('now') WHERE id = ?
      `).run(id);

      return res.json({
        message: 'Call cancelled (provider not configured)',
        call_id: id,
        status: 'cancelled'
      });
    }

    // Call provider endCall API
    try {
      const result = await provider.endCall({
        callControlId: telnyxCallId,
        reason: 'normal'
      });

      if (result.success) {
        console.log(`[END CALL] Call ${id} (${providerName}: ${telnyxCallId}) hangup requested by user`);

        // Update call status in database
        db.prepare(`
          UPDATE calls SET status = 'cancelled', ended_at = datetime('now'), disposition = 'User Cancelled' WHERE id = ?
        `).run(id);

        // Broadcast to live monitoring clients
        broadcastCallUpdate('call_ended', {
          ...call,
          status: 'cancelled',
          disposition: 'User Cancelled'
        });

        res.json({
          message: 'Call ended successfully',
          call_id: id,
          telnyx_call_id: telnyxCallId,
          provider_call_id: telnyxCallId,
          provider: providerName,
          status: 'cancelled'
        });
      } else {
        console.error(`[END CALL] Failed to hangup call ${telnyxCallId}:`, result.error);

        // Still update database since the call may already be ended
        db.prepare(`
          UPDATE calls SET status = 'cancelled', ended_at = datetime('now') WHERE id = ?
        `).run(id);

        res.json({
          message: 'Call marked as cancelled (provider hangup returned error)',
          call_id: id,
          warning: result.error
        });
      }
    } catch (providerError) {
      console.error(`[END CALL] Error calling ${providerName} hangup:`, providerError);

      // Update database anyway
      db.prepare(`
        UPDATE calls SET status = 'cancelled', ended_at = datetime('now') WHERE id = ?
      `).run(id);

      res.json({
        message: 'Call marked as cancelled (could not reach provider)',
        call_id: id,
        warning: providerError.message
      });
    }
  } catch (error) {
    console.error('Error ending call:', error);
    res.status(500).json({ error: 'Failed to end call', details: error.message });
  }
});

// Update call with extracted data (called by voice agent/webhook)
// This is the key endpoint for Feature #180 - extracting qualification status
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const {
      status,
      disposition,
      qualification_status,
      sentiment,
      answers,
      callback_time,
      recording_url,
      transcript,
      ai_summary,
      duration_seconds,
      telnyx_call_id,
      deepgram_session_id
    } = req.body;

    // Check if call exists and get lead info for retry logic
    const existingCall = db.prepare(`
      SELECT c.id, c.lead_id, c.status as current_status, c.disposition as current_disposition,
             l.first_name, l.last_name, l.property_address, l.phones
      FROM calls c
      LEFT JOIN leads l ON c.lead_id = l.id
      WHERE c.id = ?
    `).get(id);

    if (!existingCall) {
      return res.status(404).json({ error: 'Call not found' });
    }

    // Validate qualification_status if provided
    if (qualification_status && !VALID_QUALIFICATION_STATUSES.includes(qualification_status)) {
      return res.status(400).json({
        error: `Invalid qualification_status. Must be one of: ${VALID_QUALIFICATION_STATUSES.join(', ')}`
      });
    }

    // Validate disposition if provided
    if (disposition && !VALID_DISPOSITIONS.includes(disposition)) {
      return res.status(400).json({
        error: `Invalid disposition. Must be one of: ${VALID_DISPOSITIONS.join(', ')}`
      });
    }

    // Validate sentiment if provided
    if (sentiment && !VALID_SENTIMENTS.includes(sentiment)) {
      return res.status(400).json({
        error: `Invalid sentiment. Must be one of: ${VALID_SENTIMENTS.join(', ')}`
      });
    }

    // Build dynamic update query
    const updates = [];
    const params = [];

    if (status !== undefined) {
      updates.push('status = ?');
      params.push(status);
    }
    if (disposition !== undefined) {
      updates.push('disposition = ?');
      params.push(disposition);
    }
    if (qualification_status !== undefined) {
      updates.push('qualification_status = ?');
      params.push(qualification_status);
    }
    if (sentiment !== undefined) {
      updates.push('sentiment = ?');
      params.push(sentiment);
    }
    if (answers !== undefined) {
      updates.push('answers = ?');
      params.push(JSON.stringify(answers));
    }
    if (callback_time !== undefined) {
      updates.push('callback_time = ?');
      params.push(callback_time);
    }
    if (recording_url !== undefined) {
      updates.push('recording_url = ?');
      params.push(recording_url);
    }
    if (transcript !== undefined) {
      updates.push('transcript = ?');
      params.push(transcript);
    }
    if (ai_summary !== undefined) {
      updates.push('ai_summary = ?');
      params.push(ai_summary);
    }
    if (duration_seconds !== undefined) {
      updates.push('duration_seconds = ?');
      params.push(duration_seconds);
    }
    if (telnyx_call_id !== undefined) {
      updates.push('telnyx_call_id = ?');
      params.push(telnyx_call_id);
    }
    if (deepgram_session_id !== undefined) {
      updates.push('deepgram_session_id = ?');
      params.push(deepgram_session_id);
    }

    // Set ended_at if status is completed or failed
    if (status === 'completed' || status === 'failed') {
      updates.push("ended_at = datetime('now')");
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(id);

    db.prepare(`
      UPDATE calls SET ${updates.join(', ')} WHERE id = ?
    `).run(...params);

    // Fetch and return the updated call
    const updatedCall = db.prepare(`
      SELECT
        c.*,
        l.first_name,
        l.last_name,
        l.property_address,
        l.phones
      FROM calls c
      LEFT JOIN leads l ON c.lead_id = l.id
      WHERE c.id = ?
    `).get(id);

    const parsedCall = {
      ...updatedCall,
      phones: updatedCall.phones ? JSON.parse(updatedCall.phones) : [],
      answers: updatedCall.answers ? JSON.parse(updatedCall.answers) : {}
    };

    // Broadcast to live monitoring clients based on status change
    if (status === 'completed' || status === 'failed') {
      broadcastCallUpdate('call_ended', parsedCall);
    } else {
      broadcastCallUpdate('call_status_update', parsedCall);
    }

    // RETRY LOGIC for Feature #187 + PHONE ROTATION for Feature #159
    // Automatically schedule retry calls for retryable dispositions
    const retryableDispositions = ['No Answer', 'Voicemail Left', "Couldn't Reach"];

    // Check if call is ending with a retryable disposition
    if ((status === 'completed' || status === 'failed') &&
        disposition &&
        retryableDispositions.includes(disposition)) {

      // Get current attempt count for this lead
      const callHistory = db.prepare(`
        SELECT COUNT(*) as attempt_count
        FROM calls
        WHERE lead_id = ?
      `).get(existingCall.lead_id);

      const currentAttempt = callHistory.attempt_count;

      // Get max_attempts setting (stored with call_ prefix in settings table)
      const maxAttemptsSetting = db.prepare(`
        SELECT value FROM settings WHERE user_id = 1 AND key = 'call_max_attempts'
      `).get();

      const maxAttempts = maxAttemptsSetting ? parseInt(maxAttemptsSetting.value, 10) : 3;

      // Get retry_interval_days setting (stored with call_ prefix in settings table)
      const retryIntervalSetting = db.prepare(`
        SELECT value FROM settings WHERE user_id = 1 AND key = 'call_retry_interval_days'
      `).get();

      const retryIntervalDays = retryIntervalSetting ? parseInt(retryIntervalSetting.value, 10) : 1;

      // PHONE ROTATION LOGIC (Feature #159)
      // Get the phone_index used for the current call and total available phones
      const currentCallDetails = db.prepare(`
        SELECT c.phone_index, l.phones
        FROM calls c
        LEFT JOIN leads l ON c.lead_id = l.id
        WHERE c.id = ?
      `).get(id);

      let currentPhoneIndex = currentCallDetails?.phone_index || 0;
      let phoneNumbers = [];
      try {
        phoneNumbers = currentCallDetails?.phones ? JSON.parse(currentCallDetails.phones) : [];
      } catch (e) {
        phoneNumbers = [];
      }
      const totalPhones = phoneNumbers.length;

      // Calculate next phone index for rotation (wrap around if needed)
      // Increment to next phone number for retry
      const nextPhoneIndex = totalPhones > 0 ? (currentPhoneIndex + 1) % totalPhones : 0;

      // Check if we should schedule a retry
      if (currentAttempt < maxAttempts) {
        // Calculate next scheduled time (next day at configured time)
        const scheduledTime = new Date();
        scheduledTime.setDate(scheduledTime.getDate() + retryIntervalDays);
        scheduledTime.setHours(9, 0, 0, 0); // Default to 9 AM

        // Get time settings (stored with call_ prefix in settings table)
        const startTimeSetting = db.prepare(`
          SELECT value FROM settings WHERE user_id = 1 AND key = 'call_start_time'
        `).get();
        const startTime = startTimeSetting ? startTimeSetting.value : '09:00';

        const [hours, minutes] = startTime.split(':');
        scheduledTime.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);

        // Schedule retry by adding to call_queue with NEXT phone index for rotation
        const retryResult = db.prepare(`
          INSERT INTO call_queue (lead_id, status, attempt_number, scheduled_time, phone_index)
          VALUES (?, 'pending', ?, ?, ?)
        `).run(existingCall.lead_id, currentAttempt, scheduledTime.toISOString(), nextPhoneIndex);

        console.log(`Retry #${currentAttempt + 1} scheduled for lead ${existingCall.lead_id} at ${scheduledTime.toISOString()} - using phone index ${nextPhoneIndex} (rotated from ${currentPhoneIndex})`);

        // Include retry info in response
        parsedCall.retryScheduled = {
          queue_id: retryResult.lastInsertRowid,
          attempt_number: currentAttempt + 1,
          scheduled_for: scheduledTime.toISOString(),
          max_attempts: maxAttempts,
          phone_rotation: {
            previous_phone_index: currentPhoneIndex,
            next_phone_index: nextPhoneIndex,
            total_phones: totalPhones
          }
        };
      } else {
        console.log(`Max attempts (${maxAttempts}) reached for lead ${existingCall.lead_id}, not scheduling retry`);
        parsedCall.retryStopped = {
          reason: 'max_attempts_reached',
          attempts_made: currentAttempt,
          max_attempts: maxAttempts
        };
      }
    }

    // PERMANENT FAILURE LOGIC for Feature #191
    // Skip lead when call ends with permanent failure disposition (wrong number, do not call, etc.)
    const permanentFailureDispositions = ['Wrong Number', 'Not Interested', 'Already Sold', 'Disqualified'];

    if ((status === 'completed' || status === 'failed') &&
        disposition &&
        permanentFailureDispositions.includes(disposition)) {

      // Mark any existing queue entries for this lead as 'skipped'
      const skipResult = db.prepare(`
        UPDATE call_queue
        SET status = 'skipped', updated_at = datetime('now')
        WHERE lead_id = ? AND status IN ('pending', 'in_progress')
      `).run(existingCall.lead_id);

      console.log(`Lead ${existingCall.lead_id} skipped due to permanent failure: ${disposition} (${skipResult.changes} queue entries updated)`);

      // Include skip info in response
      parsedCall.leadSkipped = {
        reason: disposition,
        queue_entries_skipped: skipResult.changes,
        message: `Lead permanently skipped due to ${disposition}`
      };

      // Update lead status to indicate permanent skip (optional but helpful for reporting)
      db.prepare(`
        UPDATE leads
        SET status = 'skipped', updated_at = datetime('now')
        WHERE id = ?
      `).run(existingCall.lead_id);
    }

    res.json({
      message: 'Call updated successfully',
      call: parsedCall
    });
  } catch (error) {
    console.error('Error updating call:', error);
    res.status(500).json({ error: 'Failed to update call' });
  }
});

// Extract qualification data from a completed call
// This is a helper endpoint that simulates the data extraction process
router.post('/:id/extract', (req, res) => {
  try {
    const { id } = req.params;
    const { transcript, answers } = req.body;

    // Check if call exists
    const call = db.prepare('SELECT * FROM calls WHERE id = ?').get(id);
    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    // Use provided transcript or existing one
    const callTranscript = transcript || call.transcript;

    if (!callTranscript && !answers) {
      return res.status(400).json({ error: 'No transcript or answers provided for extraction' });
    }

    // Extract qualification status based on answers or transcript analysis
    let extractedData = {
      qualification_status: null,
      sentiment: null,
      disposition: null
    };

    if (answers) {
      // If answers are provided, determine qualification from them
      extractedData = extractQualificationFromAnswers(answers);
    } else if (callTranscript) {
      // Otherwise, try to extract from transcript (simplified analysis)
      extractedData = extractQualificationFromTranscript(callTranscript);
    }

    // Update the call with extracted data
    const updates = [];
    const params = [];

    if (extractedData.qualification_status) {
      updates.push('qualification_status = ?');
      params.push(extractedData.qualification_status);
    }
    if (extractedData.sentiment) {
      updates.push('sentiment = ?');
      params.push(extractedData.sentiment);
    }
    if (extractedData.disposition) {
      updates.push('disposition = ?');
      params.push(extractedData.disposition);
    }
    if (answers) {
      updates.push('answers = ?');
      params.push(JSON.stringify(answers));
    }

    if (updates.length > 0) {
      params.push(id);
      db.prepare(`UPDATE calls SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    // Fetch updated call
    const updatedCall = db.prepare('SELECT * FROM calls WHERE id = ?').get(id);

    res.json({
      message: 'Qualification data extracted',
      extracted: extractedData,
      call: {
        ...updatedCall,
        answers: updatedCall.answers ? JSON.parse(updatedCall.answers) : {}
      }
    });
  } catch (error) {
    console.error('Error extracting qualification data:', error);
    res.status(500).json({ error: 'Failed to extract qualification data' });
  }
});

// Helper function to extract qualification from answers
function extractQualificationFromAnswers(answers) {
  let qualification_status = "Couldn't Reach";
  let sentiment = 'Neutral';
  let disposition = 'No Answer';

  // Check for positive indicators
  const hasMotivation = answers.motivation_to_sell &&
    ['yes', 'very', 'interested', 'soon', 'ready'].some(word =>
      answers.motivation_to_sell.toLowerCase().includes(word));

  const hasTimeline = answers.timeline &&
    ['soon', 'month', 'weeks', 'asap', 'now', 'ready'].some(word =>
      answers.timeline.toLowerCase().includes(word));

  const hasPrice = answers.price_expectations && answers.price_expectations.trim() !== '';

  // Check for negative indicators
  const notInterested = answers.motivation_to_sell &&
    ['no', 'not interested', 'remove', 'stop calling'].some(word =>
      answers.motivation_to_sell.toLowerCase().includes(word));

  const wrongNumber = answers.wrong_number === true ||
    (answers.response && answers.response.toLowerCase().includes('wrong number'));

  const alreadySold = answers.already_sold === true ||
    (answers.response && answers.response.toLowerCase().includes('already sold'));

  // Determine qualification status
  if (wrongNumber) {
    qualification_status = 'Not Qualified';
    disposition = 'Wrong Number';
    sentiment = 'Neutral';
  } else if (alreadySold) {
    qualification_status = 'Not Qualified';
    disposition = 'Already Sold';
    sentiment = 'Neutral';
  } else if (notInterested) {
    qualification_status = 'Not Qualified';
    disposition = 'Not Interested';
    sentiment = 'Not Interested';
  } else if (hasMotivation && (hasTimeline || hasPrice)) {
    qualification_status = 'Qualified';
    disposition = 'Callback Scheduled';
    sentiment = hasMotivation ? 'Very Motivated' : 'Somewhat Motivated';
  } else if (hasMotivation || hasTimeline) {
    qualification_status = 'Qualified';
    disposition = 'Callback Scheduled';
    sentiment = 'Somewhat Motivated';
  } else if (Object.keys(answers).length > 0) {
    // Had some conversation but unclear outcome
    qualification_status = 'Not Qualified';
    disposition = 'Disqualified';
    sentiment = 'Reluctant';
  }

  return { qualification_status, sentiment, disposition };
}

// Generate AI summary for a call
// This can be called after a call completes to summarize the conversation
router.post('/:id/generate-summary', async (req, res) => {
  try {
    const { id } = req.params;
    const { postToFUB = false } = req.body;

    // Check if call exists
    const call = db.prepare(`
      SELECT c.*, l.first_name, l.last_name, l.property_address, l.fub_id
      FROM calls c
      LEFT JOIN leads l ON c.lead_id = l.id
      WHERE c.id = ?
    `).get(id);

    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    // Need transcript or answers to generate summary
    if (!call.transcript && !call.answers) {
      return res.status(400).json({
        error: 'Cannot generate summary - call has no transcript or answers'
      });
    }

    // Generate AI summary from available data
    const summary = generateCallSummary(call);

    // Update the call with the generated summary
    db.prepare('UPDATE calls SET ai_summary = ? WHERE id = ?').run(summary, id);

    let fubPostResult = null;

    // Optionally post to Follow-up Boss
    if (postToFUB && call.fub_id) {
      try {
        fubPostResult = await postSummaryToFUB(call.fub_id, summary, call);
      } catch (fubError) {
        console.error('Error posting to FUB:', fubError);
        fubPostResult = { success: false, error: fubError.message };
      }
    }

    // Fetch updated call
    const updatedCall = db.prepare(`
      SELECT c.*, l.first_name, l.last_name, l.property_address, l.fub_id
      FROM calls c
      LEFT JOIN leads l ON c.lead_id = l.id
      WHERE c.id = ?
    `).get(id);

    res.json({
      message: 'AI summary generated successfully',
      summary,
      fubPost: fubPostResult,
      call: {
        ...updatedCall,
        answers: updatedCall.answers ? JSON.parse(updatedCall.answers) : {}
      }
    });
  } catch (error) {
    console.error('Error generating summary:', error);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
});

// Helper function to generate a natural-language summary of the call
function generateCallSummary(call) {
  const parts = [];
  const answers = call.answers ? JSON.parse(call.answers) : {};

  // Lead info
  const leadName = [call.first_name, call.last_name].filter(Boolean).join(' ') || 'Unknown contact';
  const propertyAddr = call.property_address || 'unknown property';

  // Call outcome
  parts.push(`Call with ${leadName} regarding ${propertyAddr}.`);

  // Qualification status
  if (call.qualification_status) {
    if (call.qualification_status === 'Qualified') {
      parts.push(`Lead is QUALIFIED for follow-up.`);
    } else if (call.qualification_status === 'Not Qualified') {
      parts.push(`Lead is NOT QUALIFIED.`);
    } else {
      parts.push(`Could not reach the lead.`);
    }
  }

  // Sentiment analysis
  if (call.sentiment) {
    const sentimentDescriptions = {
      'Very Motivated': 'The lead expressed strong motivation to sell.',
      'Somewhat Motivated': 'The lead showed some interest in selling.',
      'Neutral': 'The lead had a neutral response.',
      'Reluctant': 'The lead seemed hesitant or reluctant.',
      'Not Interested': 'The lead expressed no interest in selling.'
    };
    parts.push(sentimentDescriptions[call.sentiment] || '');
  }

  // Key answers/information gathered
  if (Object.keys(answers).length > 0) {
    parts.push('Key information gathered:');

    if (answers.motivation_to_sell) {
      parts.push(`- Motivation: ${answers.motivation_to_sell}`);
    }
    if (answers.timeline) {
      parts.push(`- Timeline: ${answers.timeline}`);
    }
    if (answers.price_expectations) {
      parts.push(`- Price expectations: ${answers.price_expectations}`);
    }
    if (answers.property_condition) {
      parts.push(`- Property condition: ${answers.property_condition}`);
    }
    if (answers.occupancy_status) {
      parts.push(`- Occupancy: ${answers.occupancy_status}`);
    }
    if (answers.mortgage_situation) {
      parts.push(`- Mortgage: ${answers.mortgage_situation}`);
    }
    if (answers.reason_for_selling) {
      parts.push(`- Reason for selling: ${answers.reason_for_selling}`);
    }
  }

  // Disposition/next steps
  if (call.disposition) {
    const dispositionActions = {
      'Callback Scheduled': call.callback_time
        ? `Callback scheduled for ${new Date(call.callback_time).toLocaleString()}.`
        : 'Callback requested - schedule follow-up.',
      'Not Interested': 'Lead declined - no further action needed.',
      'Wrong Number': 'Wrong number - remove from list or verify contact info.',
      'Already Sold': 'Property already sold - no further action.',
      'Voicemail Left': 'Left voicemail - retry later.',
      'No Answer': 'No answer - retry later.',
      'Disqualified': 'Lead disqualified based on responses.'
    };
    parts.push(dispositionActions[call.disposition] || `Disposition: ${call.disposition}`);
  }

  // Call duration
  if (call.duration_seconds) {
    const mins = Math.floor(call.duration_seconds / 60);
    const secs = call.duration_seconds % 60;
    parts.push(`Call duration: ${mins}:${secs.toString().padStart(2, '0')}`);
  }

  // Extract any key phrases from transcript if available
  if (call.transcript) {
    const keyPhrases = extractKeyPhrases(call.transcript);
    if (keyPhrases.length > 0) {
      parts.push(`Notable mentions: ${keyPhrases.join(', ')}`);
    }
  }

  return parts.filter(Boolean).join(' ');
}

// Helper function to extract key phrases from transcript
function extractKeyPhrases(transcript) {
  const keyPhrases = [];
  const lowerTranscript = transcript.toLowerCase();

  // Check for specific topics mentioned
  if (lowerTranscript.includes('foreclosure')) keyPhrases.push('foreclosure');
  if (lowerTranscript.includes('divorce')) keyPhrases.push('divorce');
  if (lowerTranscript.includes('inherited')) keyPhrases.push('inherited property');
  if (lowerTranscript.includes('behind on payments') || lowerTranscript.includes('behind on mortgage')) {
    keyPhrases.push('behind on payments');
  }
  if (lowerTranscript.includes('repairs') || lowerTranscript.includes('needs work')) {
    keyPhrases.push('repairs needed');
  }
  if (lowerTranscript.includes('vacant')) keyPhrases.push('vacant property');
  if (lowerTranscript.includes('tenant') || lowerTranscript.includes('renter')) {
    keyPhrases.push('tenant-occupied');
  }
  if (lowerTranscript.includes('cash') || lowerTranscript.includes('quick sale')) {
    keyPhrases.push('interested in cash offer');
  }
  if (lowerTranscript.includes('relocating') || lowerTranscript.includes('moving')) {
    keyPhrases.push('relocating');
  }

  return keyPhrases;
}

// Helper function to post summary to Follow-up Boss
async function postSummaryToFUB(fubId, summary, call) {
  // Import crypto for decryption
  const crypto = await import('crypto');
  const { default: dbModule } = await import('../db/index.js');

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

  // Get FUB API key
  const row = dbModule.prepare(`
    SELECT api_key_encrypted FROM api_keys WHERE user_id = ? AND service = 'followupboss'
  `).get(userId);

  if (!row || !row.api_key_encrypted) {
    return { success: false, error: 'FUB API key not configured' };
  }

  const apiKey = decrypt(row.api_key_encrypted);
  if (!apiKey) {
    return { success: false, error: 'Failed to decrypt FUB API key' };
  }

  // Create a note in Follow-up Boss with the call summary
  const noteContent = `
📞 AI CALL SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━

${summary}

${call.recording_url ? `🎙️ Recording: ${call.recording_url}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
Generated by Property Call AI
  `.trim();

  const response = await fetch(`${getFubApiBase()}/v1/notes`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(apiKey + ':').toString('base64'),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      personId: fubId,
      body: noteContent,
      subject: `Call Summary - ${call.qualification_status || 'Pending'}`,
      isHtml: false
    })
  });

  if (response.ok) {
    const data = await response.json();
    return { success: true, noteId: data.id };
  } else {
    const errorData = await response.json().catch(() => ({}));
    return {
      success: false,
      error: `FUB API error: ${response.status}`,
      details: errorData
    };
  }
}

// Post call results to Follow-up Boss (Feature #169)
// This posts qualification status, recording URL, and transcript summary to FUB
router.post('/:id/post-to-fub', async (req, res) => {
  try {
    const { id } = req.params;

    // Get call with lead info
    const call = db.prepare(`
      SELECT c.*, l.first_name, l.last_name, l.property_address, l.fub_id
      FROM calls c
      LEFT JOIN leads l ON c.lead_id = l.id
      WHERE c.id = ?
    `).get(id);

    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    if (!call.fub_id) {
      return res.status(400).json({
        error: 'Lead not linked to FUB',
        message: 'This lead does not have a Follow-up Boss ID. Import the lead to FUB first.'
      });
    }

    // Post call results to FUB
    const result = await postCallResultsToFUB(call);

    res.json({
      message: 'Call results posted to Follow-up Boss',
      ...result
    });
  } catch (error) {
    console.error('Error posting call results to FUB:', error);
    res.status(500).json({ error: 'Failed to post call results to FUB', details: error.message });
  }
});

// Helper function to post complete call results to FUB (Feature #169)
async function postCallResultsToFUB(call) {
  const cryptoModule = await import('crypto');
  const { default: dbModule } = await import('../db/index.js');

  const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'property-call-default-key-32b!';
  const ALGORITHM = 'aes-256-cbc';

  function decryptKey(encryptedText) {
    if (!encryptedText) return null;
    try {
      const key = cryptoModule.scryptSync(ENCRYPTION_KEY, 'salt', 32);
      const [ivHex, encrypted] = encryptedText.split(':');
      const iv = Buffer.from(ivHex, 'hex');
      const decipher = cryptoModule.createDecipheriv(ALGORITHM, key, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      return null;
    }
  }

  const userId = 1; // Should come from auth middleware in production

  // Get FUB API key
  const row = dbModule.prepare(`
    SELECT api_key_encrypted FROM api_keys WHERE user_id = ? AND service = 'followupboss'
  `).get(userId);

  if (!row || !row.api_key_encrypted) {
    return { success: false, error: 'FUB API key not configured' };
  }

  const apiKey = decryptKey(row.api_key_encrypted);
  if (!apiKey) {
    return { success: false, error: 'Failed to decrypt FUB API key' };
  }

  const fubApiBase = getFubApiBase();
  const authHeader = 'Basic ' + Buffer.from(apiKey + ':').toString('base64');

  const results = {
    personUpdate: null,
    noteCreated: null,
    success: true,
    errors: []
  };

  // Step 1: Update person record with custom fields (qualification status, etc.)
  try {
    const customFields = {};

    // Map call data to FUB custom fields
    if (call.qualification_status) {
      customFields['AI Qualification Status'] = call.qualification_status;
    }
    if (call.sentiment) {
      customFields['AI Call Sentiment'] = call.sentiment;
    }
    if (call.disposition) {
      customFields['Call Disposition'] = call.disposition;
    }
    if (call.recording_url) {
      customFields['Call Recording URL'] = call.recording_url;
    }

    if (Object.keys(customFields).length > 0) {
      const updateResponse = await fetch(`${fubApiBase}/v1/people/${call.fub_id}`, {
        method: 'PUT',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          customFields: customFields
        })
      });

      if (updateResponse.ok) {
        const updateData = await updateResponse.json();
        results.personUpdate = { success: true, personId: updateData.id, fieldsUpdated: Object.keys(customFields) };
        console.log(`[FUB] Updated person ${call.fub_id} with call results`);
      } else {
        const errorData = await updateResponse.json().catch(() => ({}));
        results.personUpdate = { success: false, error: `API error: ${updateResponse.status}`, details: errorData };
        results.errors.push(`Person update failed: ${updateResponse.status}`);
      }
    } else {
      results.personUpdate = { success: true, skipped: true, reason: 'No custom fields to update' };
    }
  } catch (error) {
    results.personUpdate = { success: false, error: error.message };
    results.errors.push(`Person update error: ${error.message}`);
  }

  // Step 2: Create a note with call summary and transcript
  try {
    // Generate summary from call data
    const summary = generateCallSummary(call);

    // Build note content
    let noteContent = `📞 AI CALL SUMMARY\n`;
    noteContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    noteContent += summary + '\n\n';

    // Add qualification details
    if (call.qualification_status) {
      noteContent += `📊 QUALIFICATION STATUS: ${call.qualification_status}\n`;
    }
    if (call.sentiment) {
      noteContent += `💭 SENTIMENT: ${call.sentiment}\n`;
    }
    if (call.disposition) {
      noteContent += `📋 DISPOSITION: ${call.disposition}\n`;
    }

    // Add recording link
    if (call.recording_url) {
      noteContent += `\n🎙️ RECORDING: ${call.recording_url}\n`;
    }

    // Add transcript excerpt if available
    if (call.transcript) {
      const transcriptExcerpt = call.transcript.length > 1000
        ? call.transcript.substring(0, 1000) + '...'
        : call.transcript;
      noteContent += `\n📝 TRANSCRIPT:\n${transcriptExcerpt}\n`;
    }

    // Add answers if available
    if (call.answers) {
      const answers = typeof call.answers === 'string' ? JSON.parse(call.answers) : call.answers;
      if (Object.keys(answers).length > 0) {
        noteContent += `\n❓ QUALIFYING ANSWERS:\n`;
        for (const [question, answer] of Object.entries(answers)) {
          noteContent += `• ${question}: ${answer}\n`;
        }
      }
    }

    noteContent += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    noteContent += `Generated by Property Call AI`;

    const noteResponse = await fetch(`${fubApiBase}/v1/notes`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personId: parseInt(call.fub_id),
        body: noteContent,
        subject: `AI Call Summary - ${call.qualification_status || 'Pending'}`,
        isHtml: false
      })
    });

    if (noteResponse.ok) {
      const noteData = await noteResponse.json();
      results.noteCreated = { success: true, noteId: noteData.id };
      console.log(`[FUB] Created note for person ${call.fub_id}`);
    } else {
      const errorData = await noteResponse.json().catch(() => ({}));
      results.noteCreated = { success: false, error: `API error: ${noteResponse.status}`, details: errorData };
      results.errors.push(`Note creation failed: ${noteResponse.status}`);
    }
  } catch (error) {
    results.noteCreated = { success: false, error: error.message };
    results.errors.push(`Note creation error: ${error.message}`);
  }

  results.success = results.errors.length === 0;
  return results;
}

// Helper function to extract qualification from transcript (simplified)
function extractQualificationFromTranscript(transcript) {
  const lowerTranscript = transcript.toLowerCase();

  let qualification_status = "Couldn't Reach";
  let sentiment = 'Neutral';
  let disposition = 'No Answer';

  // Check for positive keywords
  const positiveKeywords = ['interested', 'sell', 'motivated', 'yes', 'ready', 'how much', 'offer'];
  const negativeKeywords = ['not interested', 'remove me', 'stop calling', 'no thanks', 'wrong number'];
  const voicemailKeywords = ['leave a message', 'voicemail', 'not available', 'beep'];

  const hasPositive = positiveKeywords.some(kw => lowerTranscript.includes(kw));
  const hasNegative = negativeKeywords.some(kw => lowerTranscript.includes(kw));
  const isVoicemail = voicemailKeywords.some(kw => lowerTranscript.includes(kw));

  if (isVoicemail) {
    qualification_status = "Couldn't Reach";
    disposition = 'Voicemail Left';
    sentiment = 'Neutral';
  } else if (lowerTranscript.includes('wrong number')) {
    qualification_status = 'Not Qualified';
    disposition = 'Wrong Number';
    sentiment = 'Neutral';
  } else if (lowerTranscript.includes('already sold')) {
    qualification_status = 'Not Qualified';
    disposition = 'Already Sold';
    sentiment = 'Neutral';
  } else if (hasNegative) {
    qualification_status = 'Not Qualified';
    disposition = 'Not Interested';
    sentiment = 'Not Interested';
  } else if (hasPositive) {
    qualification_status = 'Qualified';
    disposition = 'Callback Scheduled';
    sentiment = 'Somewhat Motivated';
  }

  return { qualification_status, sentiment, disposition };
}

export default router;
