/**
 * Webhook Signature Validation Middleware
 *
 * Provides signature validation for telephony provider webhooks to ensure
 * requests are authentic and prevent spoofing attacks.
 *
 * Currently supports:
 * - SignalWire: X-Signature header with HMAC-SHA256
 *
 * @module middleware/webhook-signature
 */

import crypto from 'crypto';

// Encryption settings (must match settings.js)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'property-call-encryption-key-32b';
const ALGORITHM = 'aes-256-cbc';

/**
 * Decrypt an encrypted API key
 *
 * @param {string} encryptedText - The encrypted text
 * @returns {string|null} Decrypted text or null if decryption fails
 * @private
 */
function decryptApiKey(encryptedText) {
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
    console.error('[Webhook Signature] Decryption error:', error);
    return null;
  }
}

/**
 * Webhook signature validation error
 */
export class WebhookSignatureError extends Error {
  constructor(message, reason = 'VALIDATION_FAILED') {
    super(message);
    this.name = 'WebhookSignatureError';
    this.reason = reason;
  }
}

/**
 * Validate SignalWire webhook signature
 *
 * SignalWire sends an X-Signature header containing the HMAC-SHA256 hash
 * of the request payload. The signature is computed as:
 *   base64(hmac-sha256(api_token, payload))
 *
 * @param {string} signature - The X-Signature header value
 * @param {string|Buffer} payload - The raw request body (string or Buffer)
 * @param {string} apiToken - The SignalWire API Token (used as HMAC key)
 * @returns {boolean} True if signature is valid
 * @throws {WebhookSignatureError} If signature is invalid
 */
export function validateSignalWireSignature(signature, payload, apiToken) {
  if (!signature) {
    throw new WebhookSignatureError(
      'Missing X-Signature header',
      'MISSING_SIGNATURE'
    );
  }

  if (!apiToken) {
    throw new WebhookSignatureError(
      'API Token not configured for signature validation',
      'MISSING_SECRET'
    );
  }

  // Ensure payload is a string for hashing
  const payloadString = typeof payload === 'string' ? payload : String(payload);

  try {
    // Compute expected signature using HMAC-SHA256
    const hmac = crypto.createHmac('sha256', apiToken);
    hmac.update(payloadString, 'utf8');
    const expectedSignature = hmac.digest('base64');

    // Use timing-safe comparison to prevent timing attacks
    // Convert to buffers for constant-time comparison
    const signatureBuffer = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

    // If lengths differ, signatures definitely don't match
    if (signatureBuffer.length !== expectedBuffer.length) {
      throw new WebhookSignatureError(
        'Invalid signature length',
        'SIGNATURE_MISMATCH'
      );
    }

    // Constant-time comparison
    let match = true;
    for (let i = 0; i < signatureBuffer.length; i++) {
      if (signatureBuffer[i] !== expectedBuffer[i]) {
        match = false;
      }
    }

    if (!match) {
      throw new WebhookSignatureError(
        'Signature verification failed',
        'SIGNATURE_MISMATCH'
      );
    }

    return true;
  } catch (error) {
    if (error instanceof WebhookSignatureError) {
      throw error;
    }

    // Re-throw crypto errors as signature errors
    throw new WebhookSignatureError(
      `Signature validation error: ${error.message}`,
      'VALIDATION_ERROR'
    );
  }
}

/**
 * Express middleware to validate SignalWire webhook signatures
 *
 * This middleware:
 * 1. Extracts the X-Signature header from the request
 * 2. Retrieves the raw request body (already parsed by express.raw())
 * 3. Validates the signature using the API Token from database
 * 4. Logs validation failures for security monitoring
 * 5. Returns 401 if signature is invalid
 *
 * Usage:
 *   // Apply to specific webhook routes
 *   router.post('/signalwire/voice',
 *     express.raw({ type: 'application/json' }), // Capture raw body
 *     validateSignalWebhook(db), // Validate signature
 *     express.json(), // Parse JSON
 *     webhookHandler // Handle webhook
 *   );
 *
 * @param {Object} database - Database connection to retrieve API Token
 * @param {Object} [options={}] - Validation options
 * @param {boolean} [options.enabled=true] - Whether validation is enabled
 * @param {boolean} [options.logFailures=true] - Whether to log validation failures
 * @returns {Function} Express middleware function
 */
export function validateSignalWebhook(database, options = {}) {
  const {
    enabled = true,
    logFailures = true
  } = options;

  return async (req, res, next) => {
    // Skip validation if disabled
    if (!enabled) {
      return next();
    }

    try {
      // Get signature from header
      // SignalWire uses 'X-Signature' header
      const signature = req.get('X-Signature') || req.get('x-signature');

      if (!signature) {
        throw new WebhookSignatureError(
          'Missing X-Signature header',
          'MISSING_SIGNATURE'
        );
      }

      // Get raw request body
      // Note: This middleware should be applied AFTER express.raw() middleware
      // which stores the raw body in req.body
      const rawBody = req.body;

      if (!rawBody) {
        throw new WebhookSignatureError(
          'Missing request body for signature validation',
          'MISSING_BODY'
        );
      }

      // Retrieve API Token from database
      const apiConfig = database.prepare(`
        SELECT api_key_encrypted FROM api_keys
        WHERE service = 'signalwire'
        ORDER BY updated_at DESC
        LIMIT 1
      `).get();

      if (!apiConfig || !apiConfig.api_key_encrypted) {
        throw new WebhookSignatureError(
          'SignalWire API Token not configured',
          'MISSING_SECRET'
        );
      }

      // Decrypt the API key
      const decryptedKey = decryptApiKey(apiConfig.api_key_encrypted);

      if (!decryptedKey) {
        throw new WebhookSignatureError(
          'Failed to decrypt SignalWire API Token',
          'DECRYPTION_FAILED'
        );
      }

      // Parse the API key to extract API Token
      // The API key can be stored as JSON string with credentials
      let apiToken;
      try {
        const parsed = JSON.parse(decryptedKey);
        apiToken = parsed.apiToken || parsed.api_token || parsed.token;
      } catch {
        // If not JSON, the API key itself might be the token
        apiToken = decryptedKey;
      }

      if (!apiToken) {
        throw new WebhookSignatureError(
          'SignalWire API Token not found in credentials',
          'MISSING_SECRET'
        );
      }

      // Validate the signature
      validateSignalWireSignature(signature, rawBody, apiToken);

      // Signature is valid, restore the parsed body for next middleware
      // If the raw body was captured by express.raw(), we need to parse it
      if (Buffer.isBuffer(rawBody)) {
        try {
          const contentType = req.get('content-type') || '';
          if (contentType.includes('application/json')) {
            req.body = JSON.parse(rawBody.toString('utf8'));
          } else if (contentType.includes('application/x-www-form-urlencoded')) {
            // Parse form-encoded body
            const queryString = require('querystring');
            req.body = queryString.parse(rawBody.toString('utf8'));
          } else {
            // Keep as buffer
            req.body = rawBody;
          }
        } catch (parseError) {
          throw new WebhookSignatureError(
            `Failed to parse request body: ${parseError.message}`,
            'PARSE_ERROR'
          );
        }
      }

      // Signature validated successfully
      console.log('[Webhook Signature] SignalWire signature validated successfully');
      return next();

    } catch (error) {
      // Log validation failure for security monitoring
      if (logFailures) {
        const logEntry = {
          timestamp: new Date().toISOString(),
          provider: 'signalwire',
          error: error.message,
          reason: error.reason,
          ip: req.ip,
          path: req.path,
          method: req.method,
          headers: {
            'x-signature': req.get('X-Signature') ? '[REDACTED]' : 'not present',
            'user-agent': req.get('user-agent') || 'unknown'
          }
        };

        console.error('[Webhook Signature] Validation failed:', JSON.stringify(logEntry, null, 2));

        // Store in database for security monitoring
        try {
          database.prepare(`
            INSERT INTO webhook_signature_logs (provider, error_reason, ip_address, details, created_at)
            VALUES (?, ?, ?, ?, datetime('now'))
          `).run(
            'signalwire',
            error.reason,
            req.ip,
            JSON.stringify(logEntry)
          );
        } catch (dbError) {
          console.error('[Webhook Signature] Failed to log validation failure:', dbError.message);
        }
      }

      // Return 401 Unauthorized
      return res.status(401).json({
        error: 'Invalid webhook signature',
        message: 'Request signature verification failed'
      });
    }
  };
}

/**
 * Express middleware to validate webhook signatures for any provider
 *
 * Factory function that returns the appropriate validator based on provider.
 *
 * @param {string} provider - Provider name ('signalwire', 'telnyx', etc.)
 * @param {Object} database - Database connection
 * @param {Object} [options={}] - Validation options
 * @returns {Function} Express middleware function
 */
export function validateWebhookSignature(provider, database, options = {}) {
  switch (provider.toLowerCase()) {
    case 'signalwire':
      return validateSignalWebhook(database, options);

    // Add other providers here as needed
    // case 'telnyx':
    //   return validateTelnyxWebhook(database, options);

    default:
      // No validation for unknown providers
      return (req, res, next) => next();
  }
}

export default {
  validateSignalWireSignature,
  validateSignalWebhook,
  validateWebhookSignature,
  WebhookSignatureError
};
