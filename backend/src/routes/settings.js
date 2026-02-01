import express from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { createProviderInstance } from '../providers/provider-factory.js';

const router = express.Router();

// Apply auth middleware to all settings routes
router.use(requireAuth);

// API base URLs - use getters to read env vars at runtime (after dotenv loads)
function getTelnyxApiBase() {
  return process.env.TELNYX_API_BASE || 'https://api.telnyx.com';
}
function getDeepgramApiBase() {
  return process.env.DEEPGRAM_API_BASE || 'https://api.deepgram.com';
}
function getFubApiBase() {
  return process.env.FUB_API_BASE || 'https://api.followupboss.com';
}

// Helper to get SignalWire configuration
async function getSignalwireConfig(userId) {
  // Get SignalWire credentials from multiple sources
  // Note: service names use underscores (signalwire_project_id, signalwire_api_token)
  const projectIdRow = db.prepare(`
    SELECT api_key_encrypted FROM api_keys WHERE user_id = ? AND service = 'signalwire_project_id'
  `).get(userId);

  const apiTokenRow = db.prepare(`
    SELECT api_key_encrypted FROM api_keys WHERE user_id = ? AND service = 'signalwire_api_token'
  `).get(userId);

  const spaceUrlRow = db.prepare(`
    SELECT value FROM settings WHERE user_id = ? AND key = 'signalwire_space_url'
  `).get(userId);

  if (!projectIdRow || !apiTokenRow || !spaceUrlRow) {
    return null;
  }

  const projectId = decrypt(projectIdRow.api_key_encrypted);
  const apiToken = decrypt(apiTokenRow.api_key_encrypted);
  const spaceUrl = spaceUrlRow.value;

  if (!projectId || !apiToken || !spaceUrl) {
    return null;
  }

  return { projectId, apiToken, spaceUrl };
}

// Encryption key - in production, this should be from environment variables
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'property-call-default-key-32b!';
const ALGORITHM = 'aes-256-cbc';

// Encrypt a value
function encrypt(text) {
  if (!text) return null;
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

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

// Mask API key for display (show first 4 and last 4 chars)
function maskApiKey(key) {
  if (!key || key.length < 12) return '****';
  return key.substring(0, 4) + '****' + key.substring(key.length - 4);
}

// Helper to get active telephony provider for a user
function getActiveProvider(userId) {
  const row = db.prepare(`
    SELECT value FROM settings WHERE user_id = ? AND key = 'telephony_provider'
  `).get(userId);
  return row ? row.value : 'telnyx'; // Default to Telnyx
}

// Helper to get provider-specific setting key
function getProviderSpecificKey(baseKey, provider) {
  return `${provider}_${baseKey}`;
}

// Helper to get provider-specific setting value
function getProviderSetting(userId, baseKey, provider = null) {
  const activeProvider = provider || getActiveProvider(userId);
  const providerKey = getProviderSpecificKey(baseKey, activeProvider);

  const row = db.prepare(`
    SELECT value FROM settings WHERE user_id = ? AND key = ?
  `).get(userId, providerKey);

  return row ? row.value : null;
}

// Helper to set provider-specific setting value
function setProviderSetting(userId, baseKey, value, provider = null) {
  const activeProvider = provider || getActiveProvider(userId);
  const providerKey = getProviderSpecificKey(baseKey, activeProvider);

  db.prepare(`
    INSERT INTO settings (user_id, key, value, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, key) DO UPDATE SET
      value = excluded.value,
      updated_at = datetime('now')
  `).run(userId, providerKey, value);
}

// Helper to get all provider-specific settings for a base key (returns all providers)
function getAllProviderSettings(userId, baseKey) {
  const telnyxKey = getProviderSpecificKey(baseKey, 'telnyx');
  const signalwireKey = getProviderSpecificKey(baseKey, 'signalwire');

  const rows = db.prepare(`
    SELECT key, value FROM settings WHERE user_id = ? AND key IN (?, ?)
  `).all(userId, telnyxKey, signalwireKey);

  const result = {
    telnyx: null,
    signalwire: null
  };

  for (const row of rows) {
    if (row.key === telnyxKey) {
      result.telnyx = row.value;
    } else if (row.key === signalwireKey) {
      result.signalwire = row.value;
    }
  }

  return result;
}

// API key format validation rules by service
const apiKeyValidation = {
  telnyx: {
    validate: (key) => {
      // Telnyx API keys are typically 40+ characters, alphanumeric with possible underscores/hyphens
      // Can start with KEY or be a longer string
      if (key.length < 20) return false;
      return /^[A-Za-z0-9_-]+$/.test(key);
    },
    formatHint: 'Telnyx API key should be at least 20 characters (alphanumeric, underscores, hyphens allowed)'
  },
  deepgram: {
    validate: (key) => {
      // Deepgram API keys are typically 40+ character alphanumeric strings
      if (key.length < 20) return false;
      return /^[A-Za-z0-9]+$/.test(key);
    },
    formatHint: 'Deepgram API key should be at least 20 alphanumeric characters'
  },
  followupboss: {
    validate: (key) => {
      // Follow-up Boss API keys can start with fka_ prefix and contain underscores
      // Example format: fka_0YTjTbKqzVtsdeg04sKPrRbbsUk5Oapgfc
      if (key.length < 10) return false;
      return /^[A-Za-z0-9_]+$/.test(key);
    },
    formatHint: 'Follow-up Boss API key should be at least 10 characters (alphanumeric and underscores, e.g., fka_xxx...)'
  },
  openai: {
    validate: (key) => {
      // OpenAI API keys start with 'sk-' and are followed by alphanumeric characters
      // New format: sk-proj-xxx or sk-xxx (51+ chars total typically)
      if (!key.startsWith('sk-')) return false;
      if (key.length < 20) return false;
      return /^sk-[A-Za-z0-9_-]+$/.test(key);
    },
    formatHint: 'OpenAI API key should start with "sk-" and be at least 20 characters'
  },
  signalwire: {
    validate: (key) => {
      // SignalWire has three separate credentials:
      // - Project ID: UUID format
      // - API Token: alphanumeric token
      // - Space URL: domain format
      // Each is validated separately based on the credential type
      if (key.length < 10) return false;
      return /^[A-Za-z0-9_.-]+$/.test(key);
    },
    formatHint: 'SignalWire credentials should be at least 10 characters (alphanumeric, dots, hyphens allowed)'
  }
};

// GET /api/settings/api-keys - Get all API key statuses (masked)
router.get('/api-keys', (req, res) => {
  try {
    // For now, we'll use user_id 1 (should come from auth middleware)
    const userId = req.user.id;

    const services = ['telnyx', 'deepgram', 'followupboss', 'openai', 'signalwire'];
    const result = {};

    for (const service of services) {
      const row = db.prepare(`
        SELECT api_key_encrypted FROM api_keys WHERE user_id = ? AND service = ?
      `).get(userId, service);

      if (row && row.api_key_encrypted) {
        const decrypted = decrypt(row.api_key_encrypted);
        result[service] = {
          configured: true,
          masked: maskApiKey(decrypted)
        };
      } else {
        result[service] = {
          configured: false,
          masked: null
        };
      }
    }

    res.json({ apiKeys: result });
  } catch (error) {
    console.error('Get API keys error:', error);
    res.status(500).json({ error: 'Failed to fetch API key statuses' });
  }
});

// PUT /api/settings/api-keys/:service - Save an API key (requires password confirmation)
router.put('/api-keys/:service', async (req, res) => {
  try {
    const { service } = req.params;
    const { apiKey, password } = req.body;
    const userId = req.user.id;

    const validServices = ['telnyx', 'deepgram', 'followupboss', 'openai', 'signalwire'];
    if (!validServices.includes(service)) {
      return res.status(400).json({ error: 'Invalid service name' });
    }

    if (!apiKey || apiKey.trim() === '') {
      return res.status(400).json({ error: 'API key is required' });
    }

    // Require password confirmation for sensitive operation
    if (!password) {
      return res.status(400).json({ error: 'Password confirmation is required' });
    }

    // Get user's password hash for verification
    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    const trimmedKey = apiKey.trim();

    // Validate API key format
    const validation = apiKeyValidation[service];
    if (validation && !validation.validate(trimmedKey)) {
      return res.status(400).json({
        error: 'Invalid API key format',
        hint: validation.formatHint
      });
    }

    const encrypted = encrypt(trimmedKey);

    // Upsert the API key
    db.prepare(`
      INSERT INTO api_keys (user_id, service, api_key_encrypted, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(user_id, service) DO UPDATE SET
        api_key_encrypted = excluded.api_key_encrypted,
        updated_at = datetime('now')
    `).run(userId, service, encrypted);

    res.json({
      success: true,
      service,
      masked: maskApiKey(trimmedKey)
    });
  } catch (error) {
    console.error('Save API key error:', error);
    res.status(500).json({ error: 'Failed to save API key' });
  }
});

// DELETE /api/settings/api-keys/:service - Remove an API key
router.delete('/api-keys/:service', (req, res) => {
  try {
    const { service } = req.params;
    const userId = req.user.id;

    const validServices = ['telnyx', 'deepgram', 'followupboss', 'openai', 'signalwire'];
    if (!validServices.includes(service)) {
      return res.status(400).json({ error: 'Invalid service name' });
    }

    const result = db.prepare(`
      DELETE FROM api_keys WHERE user_id = ? AND service = ?
    `).run(userId, service);

    res.json({
      success: true,
      deleted: result.changes > 0
    });
  } catch (error) {
    console.error('Delete API key error:', error);
    res.status(500).json({ error: 'Failed to delete API key' });
  }
});

// GET /api/settings/telephony-provider - Get telephony provider selection
router.get('/telephony-provider', (req, res) => {
  try {
    const userId = req.user.id;
    const row = db.prepare(`
      SELECT value FROM settings WHERE user_id = ? AND key = 'telephony_provider'
    `).get(userId);

    res.json({
      provider: row ? row.value : 'telnyx' // Default to Telnyx if not set
    });
  } catch (error) {
    console.error('Get telephony provider error:', error);
    res.status(500).json({ error: 'Failed to fetch telephony provider' });
  }
});

// PUT /api/settings/telephony-provider - Save telephony provider selection
router.put('/telephony-provider', (req, res) => {
  try {
    const { provider } = req.body;
    const userId = req.user.id;

    const validProviders = ['telnyx', 'signalwire'];
    if (!provider || !validProviders.includes(provider)) {
      return res.status(400).json({ error: 'Invalid provider. Must be telnyx or signalwire' });
    }

    db.prepare(`
      INSERT INTO settings (user_id, key, value, updated_at)
      VALUES (?, 'telephony_provider', ?, datetime('now'))
      ON CONFLICT(user_id, key) DO UPDATE SET
        value = excluded.value,
        updated_at = datetime('now')
    `).run(userId, provider);

    res.json({
      success: true,
      provider
    });
  } catch (error) {
    console.error('Save telephony provider error:', error);
    res.status(500).json({ error: 'Failed to save telephony provider' });
  }
});

// GET /api/settings/telnyx-phone - Get Telnyx phone number
router.get('/telnyx-phone', (req, res) => {
  try {
    const userId = req.user.id;
    const phoneNumber = getProviderSetting(userId, 'phone_number', 'telnyx');

    res.json({
      phoneNumber: phoneNumber
    });
  } catch (error) {
    console.error('Get Telnyx phone error:', error);
    res.status(500).json({ error: 'Failed to fetch Telnyx phone number' });
  }
});

// PUT /api/settings/telnyx-phone - Save Telnyx phone number
router.put('/telnyx-phone', (req, res) => {
  try {
    const { phoneNumber } = req.body;
    const userId = req.user.id;

    if (!phoneNumber || phoneNumber.trim() === '') {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    setProviderSetting(userId, 'phone_number', phoneNumber.trim(), 'telnyx');

    res.json({
      success: true,
      phoneNumber: phoneNumber.trim()
    });
  } catch (error) {
    console.error('Save Telnyx phone error:', error);
    res.status(500).json({ error: 'Failed to save Telnyx phone number' });
  }
});

// GET /api/settings/signalwire-phone - Get SignalWire phone number
router.get('/signalwire-phone', (req, res) => {
  try {
    const userId = req.user.id;
    const phoneNumber = getProviderSetting(userId, 'phone_number', 'signalwire');

    res.json({
      phoneNumber: phoneNumber
    });
  } catch (error) {
    console.error('Get SignalWire phone error:', error);
    res.status(500).json({ error: 'Failed to fetch SignalWire phone number' });
  }
});

// PUT /api/settings/signalwire-phone - Save SignalWire phone number
router.put('/signalwire-phone', (req, res) => {
  try {
    const { phoneNumber } = req.body;
    const userId = req.user.id;

    if (!phoneNumber || phoneNumber.trim() === '') {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    setProviderSetting(userId, 'phone_number', phoneNumber.trim(), 'signalwire');

    res.json({
      success: true,
      phoneNumber: phoneNumber.trim()
    });
  } catch (error) {
    console.error('Save SignalWire phone error:', error);
    res.status(500).json({ error: 'Failed to save SignalWire phone number' });
  }
});

// GET /api/settings/phone-numbers - Fetch phone numbers from active provider
router.get('/phone-numbers', async (req, res) => {
  try {
    const userId = req.user.id;

    // Get the active telephony provider
    const providerRow = db.prepare(`
      SELECT value FROM settings WHERE user_id = ? AND key = 'telephony_provider'
    `).get(userId);

    const provider = providerRow ? providerRow.value : 'telnyx';

    // Get API keys for the provider
    let apiKey;
    let credentials = {};

    if (provider === 'telnyx') {
      const keyRow = db.prepare(`
        SELECT api_key_encrypted FROM api_keys WHERE user_id = ? AND service = 'telnyx'
      `).get(userId);

      if (!keyRow || !keyRow.api_key_encrypted) {
        return res.json({
          provider,
          phoneNumbers: [],
          error: 'Telnyx API key not configured'
        });
      }

      apiKey = decrypt(keyRow.api_key_encrypted);
    } else if (provider === 'signalwire') {
      // Get SignalWire credentials from api_keys table (encrypted) and settings table (space URL)
      const projectIdRow = db.prepare(`
        SELECT api_key_encrypted FROM api_keys WHERE user_id = ? AND service = 'signalwire_project_id'
      `).get(userId);

      const apiTokenRow = db.prepare(`
        SELECT api_key_encrypted FROM api_keys WHERE user_id = ? AND service = 'signalwire_api_token'
      `).get(userId);

      const spaceUrlRow = db.prepare(`
        SELECT value FROM settings WHERE user_id = ? AND key = 'signalwire_space_url'
      `).get(userId);

      if (!projectIdRow || !apiTokenRow || !spaceUrlRow) {
        return res.json({
          provider,
          phoneNumbers: [],
          error: 'SignalWire credentials not configured'
        });
      }

      credentials = {
        projectId: decrypt(projectIdRow.api_key_encrypted),
        apiToken: decrypt(apiTokenRow.api_key_encrypted),
        spaceUrl: spaceUrlRow.value
      };
    }

    // Create provider instance and fetch phone numbers
    const providerInstance = await createProviderInstance(provider);

    // Initialize the provider with credentials
    if (provider === 'telnyx') {
      await providerInstance.initialize(apiKey);
    } else if (provider === 'signalwire') {
      await providerInstance.initialize(credentials);
    }

    let phoneNumbers = [];

    if (provider === 'telnyx') {
      // Fetch Telnyx phone numbers
      const result = await providerInstance._makeRequest('GET', '/v2/phone_numbers', {
        limit: 100
      });

      if (result && result.data) {
        phoneNumbers = result.data.map(number => ({
          phoneNumber: number.phone_number,
          friendlyName: number.phone_number,
          capabilities: number.capabilities || []
        }));
      }
    } else if (provider === 'signalwire') {
      // Fetch SignalWire phone numbers
      const result = await providerInstance.listPhoneNumbers();

      if (result && result.phoneNumbers) {
        phoneNumbers = result.phoneNumbers.map(number => ({
          phoneNumber: number.phoneNumber,
          friendlyName: number.friendlyName || number.phoneNumber,
          sid: number.sid
        }));
      }
    }

    // Get currently selected default phone number (provider-specific)
    const defaultPhoneNumber = getProviderSetting(userId, 'default_phone_number', provider);

    res.json({
      provider,
      phoneNumbers,
      defaultPhoneNumber
    });
  } catch (error) {
    console.error('Fetch phone numbers error:', error);
    res.status(500).json({ error: 'Failed to fetch phone numbers', details: error.message });
  }
});

// GET /api/settings/default-phone-number - Get default outbound phone number for active provider
router.get('/default-phone-number', (req, res) => {
  try {
    const userId = req.user.id;
    const phoneNumber = getProviderSetting(userId, 'default_phone_number');

    if (phoneNumber) {
      res.json({
        phoneNumber: phoneNumber
      });
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  } catch (error) {
    console.error('Get default phone number error:', error);
    res.status(500).json({ error: 'Failed to fetch default phone number' });
  }
});

// PUT /api/settings/default-phone-number - Save default outbound phone number for active provider
router.put('/default-phone-number', (req, res) => {
  try {
    const { phoneNumber } = req.body;
    const userId = req.user.id;

    if (!phoneNumber || phoneNumber.trim() === '') {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    // Store as provider-specific setting
    setProviderSetting(userId, 'default_phone_number', phoneNumber.trim());

    res.json({
      success: true,
      phoneNumber: phoneNumber.trim()
    });
  } catch (error) {
    console.error('Save default phone number error:', error);
    res.status(500).json({ error: 'Failed to save default phone number' });
  }
});

// GET /api/settings/health/telnyx - Check Telnyx API connection
router.get('/health/telnyx', async (req, res) => {
  try {
    const userId = req.user.id;

    // Get the Telnyx API key
    const row = db.prepare(`
      SELECT api_key_encrypted FROM api_keys WHERE user_id = ? AND service = 'telnyx'
    `).get(userId);

    if (!row || !row.api_key_encrypted) {
      return res.json({
        status: 'not_configured',
        message: 'Telnyx API key not configured'
      });
    }

    const apiKey = decrypt(row.api_key_encrypted);
    if (!apiKey) {
      return res.json({
        status: 'error',
        message: 'Failed to decrypt API key'
      });
    }

    // Test the Telnyx API connection using provider
    try {
      const provider = await createProviderInstance('telnyx', apiKey, {
        baseUrl: getTelnyxApiBase()
      });

      const healthResult = await provider.healthCheck();

      if (healthResult.healthy) {
        res.json({
          status: 'connected',
          message: 'Telnyx API connection successful',
          responseTimeMs: healthResult.responseTimeMs
        });
      } else {
        res.json({
          status: 'error',
          message: healthResult.error || 'Telnyx API health check failed',
          details: healthResult.details
        });
      }
    } catch (healthError) {
      if (healthError.message?.includes('401') || healthError.code === 'INVALID_API_KEY') {
        res.json({
          status: 'invalid_credentials',
          message: 'Invalid Telnyx API key'
        });
      } else {
        res.json({
          status: 'error',
          message: `Telnyx API error: ${healthError.message}`
        });
      }
    }
  } catch (error) {
    console.error('Telnyx health check error:', error);
    res.json({
      status: 'error',
      message: error.message || 'Failed to connect to Telnyx'
    });
  }
});

// GET /api/settings/health/signalwire - Check SignalWire API connection
router.get('/health/signalwire', async (req, res) => {
  try {
    const userId = req.user.id;

    // Get SignalWire credentials
    const credentials = await getSignalwireConfig(userId);

    if (!credentials) {
      return res.json({
        status: 'not_configured',
        message: 'SignalWire credentials not configured'
      });
    }

    const { projectId, apiToken, spaceUrl } = credentials;

    // Test the SignalWire API connection
    try {
      const startTime = Date.now();

      // Use SignalWire REST API to list phone numbers as a health check
      const response = await fetch(`https://${spaceUrl}/api/laml/2010-04-01/Accounts/${projectId}/IncomingPhoneNumbers.json`, {
        method: 'GET',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${projectId}:${apiToken}`).toString('base64'),
          'Content-Type': 'application/json'
        }
      });

      const responseTimeMs = Date.now() - startTime;

      if (response.ok) {
        res.json({
          status: 'connected',
          message: 'SignalWire API connection successful',
          responseTimeMs: responseTimeMs
        });
      } else if (response.status === 401 || response.status === 403) {
        res.json({
          status: 'invalid_credentials',
          message: 'Invalid SignalWire credentials'
        });
      } else {
        res.json({
          status: 'error',
          message: `SignalWire API error: ${response.status} ${response.statusText}`
        });
      }
    } catch (healthError) {
      res.json({
        status: 'error',
        message: `SignalWire API error: ${healthError.message}`
      });
    }
  } catch (error) {
    console.error('SignalWire health check error:', error);
    res.json({
      status: 'error',
      message: error.message || 'Failed to connect to SignalWire'
    });
  }
});

// GET /api/settings/health/deepgram - Check Deepgram API connection
router.get('/health/deepgram', async (req, res) => {
  try {
    const userId = req.user.id;

    const row = db.prepare(`
      SELECT api_key_encrypted FROM api_keys WHERE user_id = ? AND service = 'deepgram'
    `).get(userId);

    if (!row || !row.api_key_encrypted) {
      return res.json({
        status: 'not_configured',
        message: 'Deepgram API key not configured'
      });
    }

    const apiKey = decrypt(row.api_key_encrypted);
    if (!apiKey) {
      return res.json({
        status: 'error',
        message: 'Failed to decrypt API key'
      });
    }

    // Test the Deepgram API connection using /v1/projects endpoint
    // This endpoint lists all projects accessible by the API key
    // and works for validating the API key is active
    const response = await fetch(`${getDeepgramApiBase()}/v1/projects`, {
      method: 'GET',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      res.json({
        status: 'connected',
        message: 'Deepgram API connection successful'
      });
    } else if (response.status === 401 || response.status === 403) {
      res.json({
        status: 'invalid_credentials',
        message: 'Invalid Deepgram API key'
      });
    } else {
      res.json({
        status: 'error',
        message: `Deepgram API error: ${response.status}`
      });
    }
  } catch (error) {
    console.error('Deepgram health check error:', error);
    res.json({
      status: 'error',
      message: error.message || 'Failed to connect to Deepgram'
    });
  }
});

// GET /api/settings/health/followupboss - Check Follow-up Boss API connection
router.get('/health/followupboss', async (req, res) => {
  try {
    const userId = req.user.id;

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

    // Test the Follow-up Boss API connection
    const response = await fetch(`${getFubApiBase()}/v1/users`, {
      method: 'GET',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(apiKey + ':').toString('base64'),
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      res.json({
        status: 'connected',
        message: 'Follow-up Boss API connection successful'
      });
    } else if (response.status === 401) {
      res.json({
        status: 'invalid_credentials',
        message: 'Invalid Follow-up Boss API key'
      });
    } else {
      res.json({
        status: 'error',
        message: `Follow-up Boss API error: ${response.status}`
      });
    }
  } catch (error) {
    console.error('Follow-up Boss health check error:', error);
    res.json({
      status: 'error',
      message: error.message || 'Failed to connect to Follow-up Boss'
    });
  }
});

// Helper function to check if queue is paused due to FUB outage
function isQueuePausedForFub(userId) {
  const setting = db.prepare(`
    SELECT value FROM settings WHERE user_id = ? AND key = 'queue_paused_reason'
  `).get(userId);
  return setting && setting.value === 'fub_outage';
}

// Helper function to pause queue due to FUB outage
function pauseQueueForFubOutage(userId) {
  db.prepare(`
    INSERT OR REPLACE INTO settings (user_id, key, value, created_at, updated_at)
    VALUES (?, 'queue_paused', 'true', datetime('now'), datetime('now'))
  `).run(userId);

  db.prepare(`
    INSERT OR REPLACE INTO settings (user_id, key, value, created_at, updated_at)
    VALUES (?, 'queue_paused_reason', 'fub_outage', datetime('now'), datetime('now'))
  `).run(userId);

  console.log(`[Health Check] Queue auto-paused due to Follow-up Boss outage for user ${userId}`);
}

// Helper function to resume queue after FUB is restored (only if paused due to FUB)
function resumeQueueAfterFubRestore(userId) {
  const pausedReason = db.prepare(`
    SELECT value FROM settings WHERE user_id = ? AND key = 'queue_paused_reason'
  `).get(userId);

  // Only auto-resume if the pause was due to FUB outage
  if (pausedReason && pausedReason.value === 'fub_outage') {
    db.prepare(`
      INSERT OR REPLACE INTO settings (user_id, key, value, created_at, updated_at)
      VALUES (?, 'queue_paused', 'false', datetime('now'), datetime('now'))
    `).run(userId);

    db.prepare(`
      DELETE FROM settings WHERE user_id = ? AND key = 'queue_paused_reason'
    `).run(userId);

    console.log(`[Health Check] Queue auto-resumed after Follow-up Boss restored for user ${userId}`);
    return true;
  }
  return false;
}

// GET /api/settings/health - Get all health statuses
router.get('/health', async (req, res) => {
  try {
    const userId = req.user.id;

    // Get all API keys
    const apiKeys = db.prepare(`
      SELECT service, api_key_encrypted FROM api_keys WHERE user_id = ?
    `).all(userId);

    const keyMap = {};
    for (const row of apiKeys) {
      keyMap[row.service] = row.api_key_encrypted;
    }

    const results = {
      telnyx: { status: 'not_configured', message: 'Telnyx API key not configured' },
      deepgram: { status: 'not_configured', message: 'Deepgram API key not configured' },
      followupboss: { status: 'not_configured', message: 'Follow-up Boss API key not configured' },
      openai: { status: 'not_configured', message: 'OpenAI API key not configured' }
    };

    // Check Telnyx
    if (keyMap.telnyx) {
      const apiKey = decrypt(keyMap.telnyx);
      if (apiKey) {
        try {
          const response = await fetch(`${getTelnyxApiBase()}/v2/phone_numbers`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${apiKey}` }
          });
          if (response.ok) {
            results.telnyx = { status: 'connected', message: 'Connected' };
          } else if (response.status === 401) {
            results.telnyx = { status: 'invalid_credentials', message: 'Invalid credentials' };
          } else {
            results.telnyx = { status: 'error', message: `Error: ${response.status}` };
          }
        } catch (e) {
          results.telnyx = { status: 'error', message: e.message };
        }
      }
    }

    // Check Deepgram using /v1/projects endpoint (lists projects accessible by API key)
    if (keyMap.deepgram) {
      const apiKey = decrypt(keyMap.deepgram);
      if (apiKey) {
        try {
          const response = await fetch(`${getDeepgramApiBase()}/v1/projects`, {
            method: 'GET',
            headers: { 'Authorization': `Token ${apiKey}` }
          });
          if (response.ok) {
            results.deepgram = { status: 'connected', message: 'Connected' };
          } else if (response.status === 401 || response.status === 403) {
            results.deepgram = { status: 'invalid_credentials', message: 'Invalid credentials' };
          } else {
            results.deepgram = { status: 'error', message: `Error: ${response.status}` };
          }
        } catch (e) {
          results.deepgram = { status: 'error', message: e.message };
        }
      }
    }

    // Check Follow-up Boss
    let fubWasDown = false;
    let fubIsNowUp = false;

    if (keyMap.followupboss) {
      const apiKey = decrypt(keyMap.followupboss);
      if (apiKey) {
        try {
          const response = await fetch(`${getFubApiBase()}/v1/users`, {
            method: 'GET',
            headers: { 'Authorization': 'Basic ' + Buffer.from(apiKey + ':').toString('base64') }
          });
          if (response.ok) {
            results.followupboss = { status: 'connected', message: 'Connected' };
            fubIsNowUp = true;
          } else if (response.status === 401) {
            results.followupboss = { status: 'invalid_credentials', message: 'Invalid credentials' };
            fubWasDown = true;
          } else {
            results.followupboss = { status: 'error', message: `Error: ${response.status}` };
            fubWasDown = true;
          }
        } catch (e) {
          results.followupboss = { status: 'error', message: e.message };
          fubWasDown = true;
        }
      }
    }

    // Auto-pause/resume queue based on FUB status
    let queueAutoAction = null;
    if (fubWasDown && !isQueuePausedForFub(userId)) {
      // FUB is down and queue isn't already paused for this reason - pause it
      pauseQueueForFubOutage(userId);
      queueAutoAction = 'paused';
    } else if (fubIsNowUp && isQueuePausedForFub(userId)) {
      // FUB is back up and queue was paused for this reason - resume it
      const resumed = resumeQueueAfterFubRestore(userId);
      if (resumed) {
        queueAutoAction = 'resumed';
      }
    }

    // Check OpenAI (just verify key format for now)
    if (keyMap.openai) {
      const apiKey = decrypt(keyMap.openai);
      if (apiKey && apiKey.startsWith('sk-')) {
        results.openai = { status: 'configured', message: 'Key configured (validation on use)' };
      } else if (apiKey) {
        results.openai = { status: 'configured', message: 'Key configured' };
      }
    }

    // Get current queue paused status
    const queuePausedSetting = db.prepare(`
      SELECT value FROM settings WHERE user_id = ? AND key = 'queue_paused'
    `).get(userId);
    const queuePausedReasonSetting = db.prepare(`
      SELECT value FROM settings WHERE user_id = ? AND key = 'queue_paused_reason'
    `).get(userId);

    res.json({
      health: results,
      queueStatus: {
        paused: queuePausedSetting ? queuePausedSetting.value === 'true' : false,
        pausedReason: queuePausedReasonSetting ? queuePausedReasonSetting.value : null,
        autoAction: queueAutoAction
      }
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({ error: 'Failed to check health statuses' });
  }
});

// GET /api/settings/signalwire-credentials - Get SignalWire credentials (masked)
router.get('/signalwire-credentials', (req, res) => {
  try {
    const userId = req.user.id;

    // Get all three SignalWire credentials
    const projectIdRow = db.prepare(`
      SELECT api_key_encrypted FROM api_keys WHERE user_id = ? AND service = 'signalwire_project_id'
    `).get(userId);

    const apiTokenRow = db.prepare(`
      SELECT api_key_encrypted FROM api_keys WHERE user_id = ? AND service = 'signalwire_api_token'
    `).get(userId);

    const spaceUrlRow = db.prepare(`
      SELECT value FROM settings WHERE user_id = ? AND key = 'signalwire_space_url'
    `).get(userId);

    const result = {
      projectId: projectIdRow && projectIdRow.api_key_encrypted
        ? { configured: true, masked: maskApiKey(decrypt(projectIdRow.api_key_encrypted)) }
        : { configured: false, masked: null },
      apiToken: apiTokenRow && apiTokenRow.api_key_encrypted
        ? { configured: true, masked: maskApiKey(decrypt(apiTokenRow.api_key_encrypted)) }
        : { configured: false, masked: null },
      spaceUrl: spaceUrlRow ? { configured: true, masked: spaceUrlRow.value }
        : { configured: false, masked: null }
    };

    res.json(result);
  } catch (error) {
    console.error('Get SignalWire credentials error:', error);
    res.status(500).json({ error: 'Failed to fetch SignalWire credentials' });
  }
});

// PUT /api/settings/signalwire-credentials/:type - Save SignalWire credential
router.put('/signalwire-credentials/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const { value, password } = req.body;
    const userId = req.user.id;

    const validTypes = ['project-id', 'api-token', 'space-url'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid credential type' });
    }

    if (!value || value.trim() === '') {
      return res.status(400).json({ error: 'Credential value is required' });
    }

    // Require password confirmation for sensitive operations (project-id and api-token)
    if ((type === 'project-id' || type === 'api-token') && !password) {
      return res.status(400).json({ error: 'Password confirmation is required' });
    }

    if (type === 'project-id' || type === 'api-token') {
      // Verify password for sensitive credentials
      const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId);
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      const validPassword = await bcrypt.compare(password, user.password_hash);
      if (!validPassword) {
        return res.status(401).json({ error: 'Incorrect password' });
      }
    }

    const trimmedValue = value.trim();
    let service;

    if (type === 'project-id') {
      service = 'signalwire_project_id';
      // Validate Project ID format (UUID-like)
      if (!/^[A-Fa-f0-9-]{36}$/.test(trimmedValue) && trimmedValue.length < 10) {
        return res.status(400).json({
          error: 'Invalid Project ID format',
          hint: 'Project ID should be a UUID or at least 10 characters'
        });
      }
    } else if (type === 'api-token') {
      service = 'signalwire_api_token';
      // Validate API Token format
      if (trimmedValue.length < 10) {
        return res.status(400).json({
          error: 'Invalid API Token format',
          hint: 'API Token should be at least 10 characters'
        });
      }
    } else if (type === 'space-url') {
      // Store Space URL in settings table (not encrypted)
      db.prepare(`
        INSERT INTO settings (user_id, key, value, updated_at)
        VALUES (?, 'signalwire_space_url', ?, datetime('now'))
        ON CONFLICT(user_id, key) DO UPDATE SET
          value = excluded.value,
          updated_at = datetime('now')
      `).run(userId, trimmedValue);

      return res.json({
        success: true,
        type: 'space-url',
        value: trimmedValue
      });
    }

    // Encrypt and save sensitive credentials
    const encrypted = encrypt(trimmedValue);
    db.prepare(`
      INSERT INTO api_keys (user_id, service, api_key_encrypted, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(user_id, service) DO UPDATE SET
        api_key_encrypted = excluded.api_key_encrypted,
        updated_at = datetime('now')
    `).run(userId, service, encrypted);

    res.json({
      success: true,
      type,
      masked: maskApiKey(trimmedValue)
    });
  } catch (error) {
    console.error('Save SignalWire credential error:', error);
    res.status(500).json({ error: 'Failed to save credential' });
  }
});

// DELETE /api/settings/signalwire-credentials/:type - Delete SignalWire credential
router.delete('/signalwire-credentials/:type', (req, res) => {
  try {
    const { type } = req.params;
    const userId = req.user.id;

    const validTypes = ['project-id', 'api-token', 'space-url'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid credential type' });
    }

    if (type === 'project-id') {
      db.prepare(`DELETE FROM api_keys WHERE user_id = ? AND service = 'signalwire_project_id'`)
        .run(userId);
    } else if (type === 'api-token') {
      db.prepare(`DELETE FROM api_keys WHERE user_id = ? AND service = 'signalwire_api_token'`)
        .run(userId);
    } else if (type === 'space-url') {
      db.prepare(`DELETE FROM settings WHERE user_id = ? AND key = 'signalwire_space_url'`)
        .run(userId);
    }

    res.json({
      success: true,
      type
    });
  } catch (error) {
    console.error('Delete SignalWire credential error:', error);
    res.status(500).json({ error: 'Failed to delete credential' });
  }
});

export default router;
