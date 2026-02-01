/**
 * Provider Health Monitor Service
 *
 * Feature #280: Monitors telephony provider health and automatically
 * resumes the call queue when the provider recovers from an outage.
 *
 * This service runs periodic health checks and manages auto-pause/auto-resume
 * of the calling queue based on provider availability.
 *
 * @module services/provider-health-monitor
 */

import db from '../db/index.js';
import { createProviderInstance } from '../providers/provider-factory.js';
import crypto from 'crypto';

// Encryption settings (must match settings.js)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'property-call-default-key-32b!';
const ALGORITHM = 'aes-256-cbc';

/**
 * Decrypt a value
 */
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

/**
 * Health check interval in milliseconds (default: 5 minutes)
 */
const HEALTH_CHECK_INTERVAL = 5 * 60 * 1000;

/**
 * Current interval timer reference
 */
let healthCheckTimer = null;

/**
 * Last health check result
 */
let lastHealthCheckResult = {
  healthy: null,
  provider: null,
  timestamp: null,
  error: null
};

/**
 * Check if the queue is currently paused
 *
 * @param {number} userId - User ID
 * @returns {boolean} True if queue is paused
 */
function isQueuePaused(userId) {
  const setting = db.prepare(`
    SELECT value FROM settings WHERE user_id = ? AND key = 'queue_paused'
  `).get(userId);

  return setting ? setting.value === 'true' : false;
}

/**
 * Check if the queue was paused due to provider health check
 *
 * @param {number} userId - User ID
 * @returns {boolean} True if queue has auto-pause marker
 */
function isAutoPaused(userId) {
  const setting = db.prepare(`
    SELECT value FROM settings WHERE user_id = ? AND key = 'queue_auto_paused'
  `).get(userId);

  return setting ? setting.value === 'true' : false;
}

/**
 * Mark the queue as auto-paused
 *
 * @param {number} userId - User ID
 */
function markAutoPaused(userId) {
  db.prepare(`
    INSERT OR REPLACE INTO settings (user_id, key, value, created_at, updated_at)
    VALUES (?, 'queue_auto_paused', 'true', datetime('now'), datetime('now'))
  `).run(userId);

  console.log(`[ProviderHealthMonitor] Marked queue as auto-paused for user ${userId}`);
}

/**
 * Clear the auto-pause marker
 *
 * @param {number} userId - User ID
 */
function clearAutoPaused(userId) {
  db.prepare(`
    DELETE FROM settings WHERE user_id = ? AND key = 'queue_auto_paused'
  `).run(userId);

  console.log(`[ProviderHealthMonitor] Cleared auto-pause marker for user ${userId}`);
}

/**
 * Resume the queue (clear pause flag)
 *
 * @param {number} userId - User ID
 */
function resumeQueue(userId) {
  db.prepare(`
    INSERT OR REPLACE INTO settings (user_id, key, value, created_at, updated_at)
    VALUES (?, 'queue_paused', 'false', datetime('now'), datetime('now'))
  `).run(userId);

  console.log(`[ProviderHealthMonitor] Queue auto-resumed for user ${userId}`);
}

/**
 * Perform a health check on the active telephony provider
 *
 * @param {number} userId - User ID
 * @returns {Promise<Object>} Health check result
 */
async function checkProviderHealth(userId) {
  let providerName = null;

  try {
    // Get active telephony provider from settings
    const providerSetting = db.prepare(`
      SELECT value FROM settings WHERE user_id = ? AND key = 'telephony_provider'
    `).get(userId);

    if (!providerSetting || !providerSetting.value) {
      return {
        healthy: false,
        provider: null,
        error: 'No telephony provider configured'
      };
    }

    providerName = providerSetting.value;

    // Get API key for the provider
    const apiKeyRow = db.prepare(`
      SELECT api_key_encrypted FROM api_keys WHERE user_id = ? AND service = ?
    `).get(userId, providerName);

    if (!apiKeyRow || !apiKeyRow.api_key_encrypted) {
      return {
        healthy: false,
        provider: providerName,
        error: `${providerName} API key not configured`
      };
    }

    const apiKey = decrypt(apiKeyRow.api_key_encrypted);
    if (!apiKey) {
      return {
        healthy: false,
        provider: providerName,
        error: 'Failed to decrypt API key'
      };
    }

    // Create provider instance and perform health check
    const provider = await createProviderInstance(providerName);
    await provider.initialize(apiKey);

    const healthResult = await provider.healthCheck();

    return {
      healthy: healthResult.healthy,
      provider: providerName,
      responseTimeMs: healthResult.responseTimeMs,
      error: healthResult.error,
      details: healthResult.details
    };

  } catch (error) {
    console.error(`[ProviderHealthMonitor] Health check error for ${providerName}:`, error);
    return {
      healthy: false,
      provider: providerName,
      error: error.message || 'Health check failed'
    };
  }
}

/**
 * Log a provider recovery event
 *
 * @param {string} provider - Provider name
 * @param {number} responseTimeMs - Response time in milliseconds
 */
function logProviderRecovery(provider, responseTimeMs) {
  db.prepare(`
    INSERT INTO provider_recoveries (provider, response_time_ms, recovered_at)
    VALUES (?, ?, datetime('now'))
  `).run(provider, responseTimeMs);

  console.log(`[ProviderHealthMonitor] Provider ${provider} recovered (${responseTimeMs}ms)`);
}

/**
 * Run a single health check cycle
 * This checks provider health and auto-resumes if conditions are met
 *
 * @param {number} userId - User ID
 */
async function runHealthCheckCycle(userId) {
  try {
    const healthResult = await checkProviderHealth(userId);

    // Update last health check result
    lastHealthCheckResult = {
      ...healthResult,
      timestamp: new Date().toISOString()
    };

    console.log(`[ProviderHealthMonitor] Health check completed:`, {
      provider: healthResult.provider,
      healthy: healthResult.healthy,
      responseTimeMs: healthResult.responseTimeMs
    });

    // Check if queue is auto-paused
    const autoPaused = isAutoPaused(userId);
    const paused = isQueuePaused(userId);

    if (autoPaused && paused && healthResult.healthy) {
      // Provider has recovered - auto-resume the queue
      console.log(`[ProviderHealthMonitor] Provider ${healthResult.provider} recovered, auto-resuming queue`);

      resumeQueue(userId);
      clearAutoPaused(userId);
      logProviderRecovery(healthResult.provider, healthResult.responseTimeMs || 0);

      // Log recovery to provider_errors table with negative error_type to indicate recovery
      db.prepare(`
        INSERT INTO provider_errors (provider, error_type, error_message, created_at)
        VALUES (?, 'recovered', ?, datetime('now'))
      `).run(healthResult.provider, `Auto-resume: Provider recovered after outage (${healthResult.responseTimeMs || 0}ms)`);

    } else if (!healthResult.healthy && paused && !autoPaused) {
      // Queue is paused but NOT due to health check - don't interfere
      console.log(`[ProviderHealthMonitor] Queue paused (manual), not auto-resuming`);

    } else if (healthResult.healthy && !paused) {
      // Everything is normal
      console.log(`[ProviderHealthMonitor] Provider ${healthResult.provider} healthy, queue running`);
    }

  } catch (error) {
    console.error('[ProviderHealthMonitor] Health check cycle error:', error);
  }
}

/**
 * Start the health monitor
 * Begins periodic health checks at the configured interval
 *
 * @param {number} userId - User ID (default: 1)
 * @param {number} intervalMs - Check interval in milliseconds (optional)
 */
export function startHealthMonitor(userId = 1, intervalMs = HEALTH_CHECK_INTERVAL) {
  // Stop any existing monitor
  stopHealthMonitor();

  console.log(`[ProviderHealthMonitor] Starting health monitor for user ${userId} (interval: ${intervalMs}ms)`);

  // Run initial health check
  runHealthCheckCycle(userId);

  // Start periodic health checks
  healthCheckTimer = setInterval(() => {
    runHealthCheckCycle(userId);
  }, intervalMs);

  return {
    started: true,
    interval: intervalMs,
    userId
  };
}

/**
 * Stop the health monitor
 */
export function stopHealthMonitor() {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
    console.log('[ProviderHealthMonitor] Health monitor stopped');
  }
}

/**
 * Get the last health check result
 *
 * @returns {Object} Last health check result
 */
export function getLastHealthCheckResult() {
  return lastHealthCheckResult;
}

/**
 * Manually trigger a health check (e.g., from API endpoint)
 *
 * @param {number} userId - User ID
 * @returns {Promise<Object>} Health check result
 */
export async function triggerHealthCheck(userId = 1) {
  return await runHealthCheckCycle(userId);
}

// Auto-start the health monitor when the module is imported (if not in test mode)
if (process.env.NODE_ENV !== 'test' && !process.env.DISABLE_HEALTH_MONITOR) {
  startHealthMonitor(1);
}

// Export for use in tests and manual control
export default {
  startHealthMonitor,
  stopHealthMonitor,
  checkProviderHealth,
  runHealthCheckCycle,
  getLastHealthCheckResult,
  triggerHealthCheck
};
