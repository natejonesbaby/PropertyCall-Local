import express from 'express';
import crypto from 'crypto';
import { db } from '../db/setup.js';

// Encryption settings for API key decryption
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

// Cache for LLM models fetched from Deepgram
let cachedLLMModels = null;
let llmModelsCacheTime = 0;
const LLM_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Default models in case API call fails
const DEFAULT_LLM_MODELS = [
  { id: 'gpt-4.1-mini', name: 'GPT-4.1 mini', provider: 'open_ai', description: 'Fast and cost-effective' },
  { id: 'gpt-4.1-nano', name: 'GPT-4.1 nano', provider: 'open_ai', description: 'Fastest, lowest cost' },
  { id: 'gpt-4o-mini', name: 'GPT-4o mini', provider: 'open_ai', description: 'Optimized for speed' },
  { id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku', provider: 'anthropic', description: 'Fast Anthropic model' }
];

/**
 * Fetch LLM models from Deepgram API
 * @param {string} apiKey - Deepgram API key
 * @returns {Promise<Array>} - Array of model objects
 */
async function fetchDeepgramModels(apiKey) {
  try {
    const response = await fetch('https://api.deepgram.com/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Token ${apiKey}`
      }
    });

    if (!response.ok) {
      console.error('Deepgram models API error:', response.status);
      return null;
    }

    const data = await response.json();

    // Filter and format LLM models (tts models have "aura" or similar naming)
    // We want models usable for the "think" provider in Voice Agent
    const llmModels = [];

    // The models endpoint returns STT/TTS models, not LLM models
    // For Voice Agent LLM, we use the known supported models from docs
    // Map provider types and names
    const knownModels = [
      // OpenAI models
      { id: 'gpt-5.1-chat-latest', name: 'GPT-5.1 Instant', provider: 'open_ai' },
      { id: 'gpt-5.1', name: 'GPT-5.1 Thinking', provider: 'open_ai' },
      { id: 'gpt-5-nano', name: 'GPT-5 Nano', provider: 'open_ai' },
      { id: 'gpt-5-mini', name: 'GPT-5 Mini', provider: 'open_ai' },
      { id: 'gpt-5', name: 'GPT-5', provider: 'open_ai' },
      { id: 'gpt-4.1', name: 'GPT-4.1', provider: 'open_ai' },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 mini', provider: 'open_ai' },
      { id: 'gpt-4.1-nano', name: 'GPT-4.1 nano', provider: 'open_ai' },
      { id: 'gpt-4o', name: 'GPT-4o', provider: 'open_ai' },
      { id: 'gpt-4o-mini', name: 'GPT-4o mini', provider: 'open_ai' },
      // Anthropic models
      { id: 'claude-4-5-haiku-latest', name: 'Claude 4.5 Haiku', provider: 'anthropic' },
      { id: 'claude-sonnet-4-5', name: 'Claude 4.5 Sonnet', provider: 'anthropic' },
      { id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku', provider: 'anthropic' },
      { id: 'claude-sonnet-4-20250514', name: 'Claude 4 Sonnet', provider: 'anthropic' },
      // Google models
      { id: 'gemini-3-pro-preview', name: 'Gemini 3.0 Pro Preview', provider: 'google' },
      { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', provider: 'google' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'google' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'google' }
    ];

    return knownModels;
  } catch (error) {
    console.error('Error fetching Deepgram models:', error);
    return null;
  }
}

/**
 * Get LLM models, using cache if available
 */
async function getLLMModels(userId) {
  const now = Date.now();

  // Return cached models if still valid
  if (cachedLLMModels && (now - llmModelsCacheTime) < LLM_CACHE_DURATION) {
    return cachedLLMModels;
  }

  // Try to fetch from Deepgram API
  try {
    // Get user's Deepgram API key
    const apiKeyRow = db.prepare(`
      SELECT api_key_encrypted FROM api_keys WHERE user_id = ? AND service = 'deepgram'
    `).get(userId);

    if (apiKeyRow && apiKeyRow.api_key_encrypted) {
      const apiKey = decrypt(apiKeyRow.api_key_encrypted);
      if (apiKey) {
        const models = await fetchDeepgramModels(apiKey);
        if (models && models.length > 0) {
          cachedLLMModels = models;
          llmModelsCacheTime = now;
          console.log(`Cached ${models.length} LLM models from Deepgram`);
          return models;
        }
      }
    }
  } catch (error) {
    console.error('Error getting LLM models:', error);
  }

  // Fall back to defaults
  return DEFAULT_LLM_MODELS;
}

const router = express.Router();

// Middleware to verify session and get user_id
const authenticateSession = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const session = db.prepare(`
      SELECT s.*, u.email
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.id = ? AND s.expires_at > datetime('now')
    `).get(token);

    if (!session) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    req.userId = session.user_id;
    req.userEmail = session.email;
    next();
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(500).json({ error: 'Authentication error' });
  }
};

// Apply auth middleware to all routes
router.use(authenticateSession);

// ============ QUALIFYING QUESTIONS ============

// GET /api/config/questions - Get all qualifying questions
router.get('/questions', (req, res) => {
  try {
    const questions = db.prepare(`
      SELECT id, question, order_index, created_at, updated_at
      FROM qualifying_questions
      WHERE user_id = ?
      ORDER BY order_index ASC, id ASC
    `).all(req.userId);

    res.json({ questions });
  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
});

// POST /api/config/questions - Create a new qualifying question
router.post('/questions', (req, res) => {
  try {
    const { question } = req.body;

    if (!question || !question.trim()) {
      return res.status(400).json({ error: 'Question text is required' });
    }

    // Get the max order_index for this user
    const maxOrder = db.prepare(`
      SELECT MAX(order_index) as max_order
      FROM qualifying_questions
      WHERE user_id = ?
    `).get(req.userId);

    const nextOrder = (maxOrder?.max_order ?? -1) + 1;

    const result = db.prepare(`
      INSERT INTO qualifying_questions (user_id, question, order_index, created_at, updated_at)
      VALUES (?, ?, ?, datetime('now'), datetime('now'))
    `).run(req.userId, question.trim(), nextOrder);

    const newQuestion = db.prepare(`
      SELECT id, question, order_index, created_at, updated_at
      FROM qualifying_questions
      WHERE id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json({ question: newQuestion });
  } catch (error) {
    console.error('Error creating question:', error);
    res.status(500).json({ error: 'Failed to create question' });
  }
});

// PUT /api/config/questions/reorder - Reorder qualifying questions
// NOTE: This route MUST be defined BEFORE /questions/:id to avoid "reorder" being matched as :id
router.put('/questions/reorder', (req, res) => {
  try {
    const { questionIds } = req.body;

    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      return res.status(400).json({ error: 'questionIds array is required' });
    }

    const updateOrder = db.prepare(`
      UPDATE qualifying_questions
      SET order_index = ?, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `);

    const transaction = db.transaction(() => {
      questionIds.forEach((questionId, index) => {
        updateOrder.run(index, questionId, req.userId);
      });
    });

    transaction();

    // Fetch updated questions
    const questions = db.prepare(`
      SELECT id, question, order_index, created_at, updated_at
      FROM qualifying_questions
      WHERE user_id = ?
      ORDER BY order_index ASC, id ASC
    `).all(req.userId);

    res.json({ questions });
  } catch (error) {
    console.error('Error reordering questions:', error);
    res.status(500).json({ error: 'Failed to reorder questions' });
  }
});

// PUT /api/config/questions/:id - Update a qualifying question
router.put('/questions/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { question } = req.body;

    if (!question || !question.trim()) {
      return res.status(400).json({ error: 'Question text is required' });
    }

    // Verify ownership
    const existing = db.prepare(`
      SELECT id FROM qualifying_questions
      WHERE id = ? AND user_id = ?
    `).get(id, req.userId);

    if (!existing) {
      return res.status(404).json({ error: 'Question not found' });
    }

    db.prepare(`
      UPDATE qualifying_questions
      SET question = ?, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(question.trim(), id, req.userId);

    const updated = db.prepare(`
      SELECT id, question, order_index, created_at, updated_at
      FROM qualifying_questions
      WHERE id = ?
    `).get(id);

    res.json({ question: updated });
  } catch (error) {
    console.error('Error updating question:', error);
    res.status(500).json({ error: 'Failed to update question' });
  }
});

// DELETE /api/config/questions/:id - Delete a qualifying question
router.delete('/questions/:id', (req, res) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const existing = db.prepare(`
      SELECT id, question FROM qualifying_questions
      WHERE id = ? AND user_id = ?
    `).get(id, req.userId);

    if (!existing) {
      return res.status(404).json({ error: 'Question not found' });
    }

    db.prepare(`
      DELETE FROM qualifying_questions
      WHERE id = ? AND user_id = ?
    `).run(id, req.userId);

    res.json({ message: 'Question deleted successfully', deleted: existing });
  } catch (error) {
    console.error('Error deleting question:', error);
    res.status(500).json({ error: 'Failed to delete question' });
  }
});

// ============ VOICE SELECTION ============

// GET /api/config/voices - Get all available voice options
router.get('/voices', (req, res) => {
  try {
    const voices = db.prepare(`
      SELECT id, voice_id, name, description, gender, accent
      FROM voice_options
      WHERE is_active = 1
      ORDER BY gender ASC, name ASC
    `).all();

    // Get the user's selected voice from settings
    const selectedVoiceSetting = db.prepare(`
      SELECT value FROM settings
      WHERE user_id = ? AND key = 'selected_voice'
    `).get(req.userId);

    const selectedVoice = selectedVoiceSetting?.value || 'aura-asteria-en';

    res.json({ voices, selectedVoice });
  } catch (error) {
    console.error('Error fetching voices:', error);
    res.status(500).json({ error: 'Failed to fetch voice options' });
  }
});

// PUT /api/config/voices/selected - Set the selected voice
router.put('/voices/selected', (req, res) => {
  try {
    const { voice_id } = req.body;

    if (!voice_id) {
      return res.status(400).json({ error: 'voice_id is required' });
    }

    // Verify the voice exists
    const voiceExists = db.prepare(`
      SELECT id FROM voice_options
      WHERE voice_id = ? AND is_active = 1
    `).get(voice_id);

    if (!voiceExists) {
      return res.status(400).json({ error: 'Invalid voice_id' });
    }

    // Upsert the setting
    db.prepare(`
      INSERT INTO settings (user_id, key, value, created_at, updated_at)
      VALUES (?, 'selected_voice', ?, datetime('now'), datetime('now'))
      ON CONFLICT(user_id, key) DO UPDATE SET
        value = excluded.value,
        updated_at = datetime('now')
    `).run(req.userId, voice_id);

    // Get the full voice details
    const voice = db.prepare(`
      SELECT id, voice_id, name, description, gender, accent
      FROM voice_options
      WHERE voice_id = ?
    `).get(voice_id);

    res.json({ selectedVoice: voice_id, voice });
  } catch (error) {
    console.error('Error setting voice:', error);
    res.status(500).json({ error: 'Failed to set voice' });
  }
});

// ============ LLM MODEL ============

// GET /api/config/llm-models - Get all available LLM models (fetched from Deepgram)
router.get('/llm-models', async (req, res) => {
  try {
    // Get the user's selected LLM model from settings
    const selectedModelSetting = db.prepare(`
      SELECT value FROM settings
      WHERE user_id = ? AND key = 'selected_llm_model'
    `).get(req.userId);

    const selectedModel = selectedModelSetting?.value || 'gpt-4.1-mini';

    // Get models (from cache or API)
    const models = await getLLMModels(req.userId);

    res.json({ models, selectedModel });
  } catch (error) {
    console.error('Error fetching LLM models:', error);
    res.status(500).json({ error: 'Failed to fetch LLM models' });
  }
});

// PUT /api/config/llm-models/selected - Set the selected LLM model
router.put('/llm-models/selected', async (req, res) => {
  try {
    const { model_id } = req.body;

    if (!model_id) {
      return res.status(400).json({ error: 'model_id is required' });
    }

    // Get current models to verify selection
    const models = await getLLMModels(req.userId);
    const modelExists = models.find(m => m.id === model_id);

    if (!modelExists) {
      return res.status(400).json({ error: 'Invalid model_id' });
    }

    // Upsert the setting
    db.prepare(`
      INSERT INTO settings (user_id, key, value, created_at, updated_at)
      VALUES (?, 'selected_llm_model', ?, datetime('now'), datetime('now'))
      ON CONFLICT(user_id, key) DO UPDATE SET
        value = excluded.value,
        updated_at = datetime('now')
    `).run(req.userId, model_id);

    res.json({ selectedModel: model_id, model: modelExists });
  } catch (error) {
    console.error('Error setting LLM model:', error);
    res.status(500).json({ error: 'Failed to set LLM model' });
  }
});

// ============ PROMPTS ============

// GET /api/config/prompts - Get all prompts
router.get('/prompts', (req, res) => {
  try {
    const prompts = db.prepare(`
      SELECT id, type, content, created_at, updated_at
      FROM prompts
      WHERE user_id = ?
    `).all(req.userId);

    // Convert to object keyed by type
    const promptsMap = {};
    prompts.forEach(p => {
      promptsMap[p.type] = p;
    });

    res.json({ prompts: promptsMap });
  } catch (error) {
    console.error('Error fetching prompts:', error);
    res.status(500).json({ error: 'Failed to fetch prompts' });
  }
});

// PUT /api/config/prompts/:type - Update or create a prompt
router.put('/prompts/:type', (req, res) => {
  try {
    const { type } = req.params;
    const { content, expected_updated_at } = req.body;

    const validTypes = ['system', 'greeting', 'goodbye', 'voicemail'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `Invalid prompt type. Must be one of: ${validTypes.join(', ')}` });
    }

    if (content === undefined || content === null) {
      return res.status(400).json({ error: 'Content is required' });
    }

    // Check for concurrent edit conflict if expected_updated_at is provided
    if (expected_updated_at) {
      const existing = db.prepare(`
        SELECT updated_at FROM prompts
        WHERE user_id = ? AND type = ?
      `).get(req.userId, type);

      if (existing && existing.updated_at !== expected_updated_at) {
        return res.status(409).json({
          error: 'Conflict: This configuration was modified in another session',
          conflict: true,
          server_updated_at: existing.updated_at,
          message: 'The prompts have been modified since you loaded this page. Please refresh to see the latest changes, or force save to overwrite.'
        });
      }
    }

    // Upsert the prompt
    db.prepare(`
      INSERT INTO prompts (user_id, type, content, created_at, updated_at)
      VALUES (?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(user_id, type) DO UPDATE SET
        content = excluded.content,
        updated_at = datetime('now')
    `).run(req.userId, type, content);

    const prompt = db.prepare(`
      SELECT id, type, content, created_at, updated_at
      FROM prompts
      WHERE user_id = ? AND type = ?
    `).get(req.userId, type);

    res.json({ prompt });
  } catch (error) {
    console.error('Error updating prompt:', error);
    res.status(500).json({ error: 'Failed to update prompt' });
  }
});

// ============ CALL SETTINGS (Retry & Time Restrictions) ============

// Default call settings
const DEFAULT_CALL_SETTINGS = {
  max_attempts: 3,
  retry_interval_days: 1,
  start_time: '09:00',
  end_time: '19:00',
  timezone: 'America/New_York'
};

// GET /api/config/call-settings - Get call settings (retry and time restrictions)
router.get('/call-settings', (req, res) => {
  try {
    // Get settings from database or use defaults
    const settings = {};
    let latestUpdatedAt = null;

    for (const [key, defaultValue] of Object.entries(DEFAULT_CALL_SETTINGS)) {
      const setting = db.prepare(`
        SELECT value, updated_at FROM settings
        WHERE user_id = ? AND key = ?
      `).get(req.userId, `call_${key}`);

      settings[key] = setting ? setting.value : defaultValue;
      if (setting && setting.updated_at) {
        if (!latestUpdatedAt || setting.updated_at > latestUpdatedAt) {
          latestUpdatedAt = setting.updated_at;
        }
      }
    }

    // Convert numeric values
    settings.max_attempts = parseInt(settings.max_attempts, 10);
    settings.retry_interval_days = parseInt(settings.retry_interval_days, 10);

    res.json({ settings, defaults: DEFAULT_CALL_SETTINGS, updated_at: latestUpdatedAt });
  } catch (error) {
    console.error('Error fetching call settings:', error);
    res.status(500).json({ error: 'Failed to fetch call settings' });
  }
});

// PUT /api/config/call-settings - Update call settings
router.put('/call-settings', (req, res) => {
  try {
    const { max_attempts, retry_interval_days, start_time, end_time, timezone, expected_updated_at } = req.body;

    // Validate inputs
    if (max_attempts !== undefined) {
      const attempts = parseInt(max_attempts, 10);
      if (isNaN(attempts) || attempts < 1 || attempts > 10) {
        return res.status(400).json({ error: 'Max attempts must be between 1 and 10' });
      }
    }

    if (retry_interval_days !== undefined) {
      const interval = parseInt(retry_interval_days, 10);
      if (isNaN(interval) || interval < 1 || interval > 7) {
        return res.status(400).json({ error: 'Retry interval must be between 1 and 7 days' });
      }
    }

    if (start_time !== undefined && !/^\d{2}:\d{2}$/.test(start_time)) {
      return res.status(400).json({ error: 'Start time must be in HH:MM format' });
    }

    if (end_time !== undefined && !/^\d{2}:\d{2}$/.test(end_time)) {
      return res.status(400).json({ error: 'End time must be in HH:MM format' });
    }

    // Check for concurrent edit conflict if expected_updated_at is provided
    if (expected_updated_at) {
      // Get the latest updated_at from any call setting
      const latestSetting = db.prepare(`
        SELECT MAX(updated_at) as latest_updated_at FROM settings
        WHERE user_id = ? AND key LIKE 'call_%'
      `).get(req.userId);

      if (latestSetting && latestSetting.latest_updated_at && latestSetting.latest_updated_at !== expected_updated_at) {
        return res.status(409).json({
          error: 'Conflict: Call settings were modified in another session',
          conflict: true,
          server_updated_at: latestSetting.latest_updated_at,
          message: 'Call settings have been modified since you loaded this page. Please refresh to see the latest changes, or force save to overwrite.'
        });
      }
    }

    // Upsert each provided setting
    const updates = { max_attempts, retry_interval_days, start_time, end_time, timezone };

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        db.prepare(`
          INSERT INTO settings (user_id, key, value, created_at, updated_at)
          VALUES (?, ?, ?, datetime('now'), datetime('now'))
          ON CONFLICT(user_id, key) DO UPDATE SET
            value = excluded.value,
            updated_at = datetime('now')
        `).run(req.userId, `call_${key}`, String(value));
      }
    }

    // Fetch updated settings including the latest updated_at
    const settings = {};
    let latestUpdatedAt = null;
    for (const [key, defaultValue] of Object.entries(DEFAULT_CALL_SETTINGS)) {
      const setting = db.prepare(`
        SELECT value, updated_at FROM settings
        WHERE user_id = ? AND key = ?
      `).get(req.userId, `call_${key}`);

      settings[key] = setting ? setting.value : defaultValue;
      if (setting && setting.updated_at) {
        if (!latestUpdatedAt || setting.updated_at > latestUpdatedAt) {
          latestUpdatedAt = setting.updated_at;
        }
      }
    }

    settings.max_attempts = parseInt(settings.max_attempts, 10);
    settings.retry_interval_days = parseInt(settings.retry_interval_days, 10);

    res.json({ settings, updated_at: latestUpdatedAt, message: 'Call settings updated successfully' });
  } catch (error) {
    console.error('Error updating call settings:', error);
    res.status(500).json({ error: 'Failed to update call settings' });
  }
});

// ============ DISQUALIFYING TRIGGERS ============

// GET /api/config/disqualifiers - Get all disqualifying triggers
router.get('/disqualifiers', (req, res) => {
  try {
    const triggers = db.prepare(`
      SELECT id, trigger_phrase, action, created_at, updated_at
      FROM disqualifying_triggers
      WHERE user_id = ?
      ORDER BY id ASC
    `).all(req.userId);

    res.json({ triggers });
  } catch (error) {
    console.error('Error fetching disqualifiers:', error);
    res.status(500).json({ error: 'Failed to fetch disqualifying triggers' });
  }
});

// POST /api/config/disqualifiers - Create a new disqualifying trigger
router.post('/disqualifiers', (req, res) => {
  try {
    const { trigger_phrase, action = 'mark_disqualified' } = req.body;

    if (!trigger_phrase || !trigger_phrase.trim()) {
      return res.status(400).json({ error: 'Trigger phrase is required' });
    }

    const validActions = ['end_call', 'mark_disqualified'];
    if (!validActions.includes(action)) {
      return res.status(400).json({ error: `Invalid action. Must be one of: ${validActions.join(', ')}` });
    }

    const result = db.prepare(`
      INSERT INTO disqualifying_triggers (user_id, trigger_phrase, action, created_at, updated_at)
      VALUES (?, ?, ?, datetime('now'), datetime('now'))
    `).run(req.userId, trigger_phrase.trim(), action);

    const newTrigger = db.prepare(`
      SELECT id, trigger_phrase, action, created_at, updated_at
      FROM disqualifying_triggers
      WHERE id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json({ trigger: newTrigger });
  } catch (error) {
    console.error('Error creating disqualifier:', error);
    res.status(500).json({ error: 'Failed to create disqualifying trigger' });
  }
});

// PUT /api/config/disqualifiers/:id - Update a disqualifying trigger
router.put('/disqualifiers/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { trigger_phrase, action } = req.body;

    // Verify ownership
    const existing = db.prepare(`
      SELECT id FROM disqualifying_triggers
      WHERE id = ? AND user_id = ?
    `).get(id, req.userId);

    if (!existing) {
      return res.status(404).json({ error: 'Disqualifying trigger not found' });
    }

    if (trigger_phrase !== undefined && !trigger_phrase.trim()) {
      return res.status(400).json({ error: 'Trigger phrase cannot be empty' });
    }

    if (action !== undefined) {
      const validActions = ['end_call', 'mark_disqualified'];
      if (!validActions.includes(action)) {
        return res.status(400).json({ error: `Invalid action. Must be one of: ${validActions.join(', ')}` });
      }
    }

    const updates = [];
    const params = [];

    if (trigger_phrase !== undefined) {
      updates.push('trigger_phrase = ?');
      params.push(trigger_phrase.trim());
    }
    if (action !== undefined) {
      updates.push('action = ?');
      params.push(action);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push("updated_at = datetime('now')");
    params.push(id, req.userId);

    db.prepare(`
      UPDATE disqualifying_triggers
      SET ${updates.join(', ')}
      WHERE id = ? AND user_id = ?
    `).run(...params);

    const updated = db.prepare(`
      SELECT id, trigger_phrase, action, created_at, updated_at
      FROM disqualifying_triggers
      WHERE id = ?
    `).get(id);

    res.json({ trigger: updated });
  } catch (error) {
    console.error('Error updating disqualifier:', error);
    res.status(500).json({ error: 'Failed to update disqualifying trigger' });
  }
});

// DELETE /api/config/disqualifiers/:id - Delete a disqualifying trigger
router.delete('/disqualifiers/:id', (req, res) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const existing = db.prepare(`
      SELECT id, trigger_phrase FROM disqualifying_triggers
      WHERE id = ? AND user_id = ?
    `).get(id, req.userId);

    if (!existing) {
      return res.status(404).json({ error: 'Disqualifying trigger not found' });
    }

    db.prepare(`
      DELETE FROM disqualifying_triggers
      WHERE id = ? AND user_id = ?
    `).run(id, req.userId);

    res.json({ message: 'Disqualifying trigger deleted successfully', deleted: existing });
  } catch (error) {
    console.error('Error deleting disqualifier:', error);
    res.status(500).json({ error: 'Failed to delete disqualifying trigger' });
  }
});

// ============ RESET TO DEFAULTS ============

// Default configuration values
const DEFAULT_CONFIG = {
  voice: 'aura-asteria-en',
  prompts: {
    system: `You are a friendly real estate assistant calling to check if the homeowner might be interested in selling their property. Be polite, professional, and conversational. Listen carefully to their responses and ask follow-up questions when appropriate. If they express any interest, gather information about their timeline, asking price expectations, and property condition. If they are not interested, thank them for their time and end the call politely.`,
    greeting: `Hi, is this {{first_name}}? This is Sarah calling about the property at {{property_address}}. Do you have a moment to chat?`,
    goodbye: `Thank you so much for your time today. Have a wonderful day!`,
    voicemail: `Hi {{first_name}}, this is Sarah calling about your property at {{property_address}}. I was wondering if you might be interested in discussing an offer. Please give me a call back when you get a chance. Thank you!`
  },
  questions: [
    'Are you the owner of the property at {{property_address}}?',
    'Have you considered selling your property in the near future?',
    'If you were to sell, what would be your ideal timeline?',
    'Do you have a price in mind that you would be comfortable with?',
    'Is there anything about the property that might need repairs or updates?'
  ],
  disqualifiers: [
    { trigger_phrase: 'do not call', action: 'end_call' },
    { trigger_phrase: 'not interested', action: 'end_call' },
    { trigger_phrase: 'stop calling', action: 'end_call' },
    { trigger_phrase: 'remove me', action: 'end_call' },
    { trigger_phrase: 'already sold', action: 'mark_disqualified' },
    { trigger_phrase: 'not the owner', action: 'mark_disqualified' },
    { trigger_phrase: 'wrong number', action: 'mark_disqualified' }
  ],
  callSettings: {
    max_attempts: 3,
    retry_interval_days: 1,
    start_time: '09:00',
    end_time: '19:00',
    timezone: 'America/New_York'
  }
};

// GET /api/config/defaults - Get default configuration values (for preview)
router.get('/defaults', (req, res) => {
  res.json({ defaults: DEFAULT_CONFIG });
});

// POST /api/config/reset-defaults - Reset all configuration to defaults
router.post('/reset-defaults', (req, res) => {
  try {
    const transaction = db.transaction(() => {
      // 1. Reset voice selection to default
      db.prepare(`
        INSERT INTO settings (user_id, key, value, created_at, updated_at)
        VALUES (?, 'selected_voice', ?, datetime('now'), datetime('now'))
        ON CONFLICT(user_id, key) DO UPDATE SET
          value = excluded.value,
          updated_at = datetime('now')
      `).run(req.userId, DEFAULT_CONFIG.voice);

      // 2. Reset all prompts to defaults
      const upsertPrompt = db.prepare(`
        INSERT INTO prompts (user_id, type, content, created_at, updated_at)
        VALUES (?, ?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(user_id, type) DO UPDATE SET
          content = excluded.content,
          updated_at = datetime('now')
      `);

      for (const [type, content] of Object.entries(DEFAULT_CONFIG.prompts)) {
        upsertPrompt.run(req.userId, type, content);
      }

      // 3. Delete all existing qualifying questions and insert defaults
      db.prepare(`
        DELETE FROM qualifying_questions WHERE user_id = ?
      `).run(req.userId);

      const insertQuestion = db.prepare(`
        INSERT INTO qualifying_questions (user_id, question, order_index, created_at, updated_at)
        VALUES (?, ?, ?, datetime('now'), datetime('now'))
      `);

      DEFAULT_CONFIG.questions.forEach((question, index) => {
        insertQuestion.run(req.userId, question, index);
      });

      // 4. Delete all existing disqualifying triggers and insert defaults
      db.prepare(`
        DELETE FROM disqualifying_triggers WHERE user_id = ?
      `).run(req.userId);

      const insertTrigger = db.prepare(`
        INSERT INTO disqualifying_triggers (user_id, trigger_phrase, action, created_at, updated_at)
        VALUES (?, ?, ?, datetime('now'), datetime('now'))
      `);

      for (const trigger of DEFAULT_CONFIG.disqualifiers) {
        insertTrigger.run(req.userId, trigger.trigger_phrase, trigger.action);
      }

      // 5. Reset call settings to defaults
      for (const [key, value] of Object.entries(DEFAULT_CONFIG.callSettings)) {
        db.prepare(`
          INSERT INTO settings (user_id, key, value, created_at, updated_at)
          VALUES (?, ?, ?, datetime('now'), datetime('now'))
          ON CONFLICT(user_id, key) DO UPDATE SET
            value = excluded.value,
            updated_at = datetime('now')
        `).run(req.userId, `call_${key}`, String(value));
      }
    });

    // Execute the transaction
    transaction();

    // Fetch the updated configuration to return
    const questions = db.prepare(`
      SELECT id, question, order_index, created_at, updated_at
      FROM qualifying_questions
      WHERE user_id = ?
      ORDER BY order_index ASC
    `).all(req.userId);

    const triggers = db.prepare(`
      SELECT id, trigger_phrase, action, created_at, updated_at
      FROM disqualifying_triggers
      WHERE user_id = ?
      ORDER BY id ASC
    `).all(req.userId);

    const prompts = db.prepare(`
      SELECT type, content
      FROM prompts
      WHERE user_id = ?
    `).all(req.userId);

    const promptsMap = {};
    prompts.forEach(p => {
      promptsMap[p.type] = { content: p.content };
    });

    res.json({
      message: 'Configuration reset to defaults successfully',
      config: {
        voice: DEFAULT_CONFIG.voice,
        prompts: promptsMap,
        questions,
        triggers,
        callSettings: DEFAULT_CONFIG.callSettings
      }
    });
  } catch (error) {
    console.error('Error resetting to defaults:', error);
    res.status(500).json({ error: 'Failed to reset configuration to defaults' });
  }
});

export default router;
