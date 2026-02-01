/**
 * SignalWire Telephony Provider
 *
 * Implementation of the TelephonyProvider interface for SignalWire.
 * Provides REST API client with authentication using Project ID and API Token.
 *
 * @module providers/signalwire-provider
 */

import { SIGNALWIRE_CAPABILITIES } from './provider-factory.js';
import {
  TelephonyError,
  AuthenticationError,
  RateLimitError,
  CallFailedError,
  NetworkError,
  ValidationError,
  ResourceNotFoundError,
  ServiceUnavailableError,
  TimeoutError,
  mapSignalWireError
} from './telephony-errors.js';

/**
 * SignalWire-specific error codes
 */
const SignalWireErrorCode = {
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  INVALID_SPACE_URL: 'INVALID_SPACE_URL',
  API_REQUEST_FAILED: 'API_REQUEST_FAILED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  INVALID_PHONE_NUMBER: 'INVALID_PHONE_NUMBER',
  CALL_NOT_FOUND: 'CALL_NOT_FOUND',
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS'
};

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG = {
  maxRetries: 2, // Maximum number of retries (total attempts = maxRetries + 1)
  initialDelayMs: 1000, // Initial retry delay in milliseconds
  maxDelayMs: 10000, // Maximum retry delay
  backoffMultiplier: 2, // Exponential backoff multiplier
  retryableStatusCodes: [429, 500, 502, 503], // Retryable HTTP status codes
  retryableErrors: ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'] // Retryable network errors
};

/**
 * SignalWire-specific error class
 */
export class SignalWireError extends Error {
  constructor(message, code = 'SIGNALWIRE_ERROR', details = null) {
    super(message);
    this.name = 'SignalWireError';
    this.code = code;
    this.details = details;
  }
}

/**
 * SignalWire Telephony Provider
 *
 * Implements the TelephonyProvider interface for SignalWire REST API.
 * Supports outbound calling, call control, recording, and webhooks.
 */
export class SignalWireProvider {
  /**
   * Create a new SignalWire provider instance
   */
  constructor() {
    this.name = 'signalwire';
    this.version = '1.0.0';
    this._initialized = false;
    this._capabilities = SIGNALWIRE_CAPABILITIES;

    // SignalWire credentials
    this._projectId = null;
    this._apiToken = null;
    this._spaceUrl = null;

    // HTTP client configuration
    this._baseUrl = null;
    this._timeout = 30000; // 30 seconds default

    // Request state
    this._authHeader = null;

    // Retry configuration
    this._retryConfig = { ...DEFAULT_RETRY_CONFIG };
  }

  /**
   * Get the capabilities of this provider
   *
   * @returns {Object} Provider capabilities object
   */
  getCapabilities() {
    return this._capabilities;
  }

  /**
   * Initialize the SignalWire provider with API credentials
   *
   * SignalWire uses three authentication components:
   * - Project ID: UUID identifying the project
   * - API Token: Secret token for API authentication
   * - Space URL: Your SignalWire space URL (e.g., example.signalwire.com)
   *
   * @param {string} apiKey - API credentials (can be JSON string with all credentials or just API Token)
   * @param {Object} options - Initialization options
   * @param {string} [options.projectId] - SignalWire Project ID
   * @param {string} [options.apiToken] - SignalWire API Token
   * @param {string} [options.spaceUrl] - SignalWire Space URL
   * @param {number} [options.timeout] - Request timeout in milliseconds
   * @returns {Promise<void>}
   * @throws {SignalWireError} If authentication fails or credentials are invalid
   */
  async initialize(apiKey, options = {}) {
    try {
      // Parse credentials
      // Support both JSON string with all credentials or direct options
      let creds = {};
      if (typeof apiKey === 'string') {
        try {
          creds = JSON.parse(apiKey);
        } catch {
          // If not JSON, apiKey itself might be the token
          creds = { apiToken: apiKey };
        }
      } else if (typeof apiKey === 'object' && apiKey !== null) {
        creds = apiKey;
      }

      // Extract credentials from options first, then from parsed object
      this._projectId = options.projectId || creds.projectId || creds.project_id;
      this._apiToken = options.apiToken || creds.apiToken || creds.api_token || creds.token;
      this._spaceUrl = options.spaceUrl || creds.spaceUrl || creds.space_url || creds.space;

      // Validate required credentials
      if (!this._projectId) {
        throw new SignalWireError(
          'Project ID is required for SignalWire authentication',
          SignalWireErrorCode.INVALID_CREDENTIALS
        );
      }

      if (!this._apiToken) {
        throw new SignalWireError(
          'API Token is required for SignalWire authentication',
          SignalWireErrorCode.INVALID_CREDENTIALS
        );
      }

      if (!this._spaceUrl) {
        throw new SignalWireError(
          'Space URL is required for SignalWire authentication',
          SignalWireErrorCode.INVALID_CREDENTIALS
        );
      }

      // Normalize space URL
      this._spaceUrl = this._normalizeSpaceUrl(this._spaceUrl);

      // Build base URL for API requests
      this._baseUrl = `https://${this._spaceUrl}`;

      // Create authentication header for Basic Auth
      // SignalWire uses Project ID as username, API Token as password
      this._authHeader = this._createAuthHeader(this._projectId, this._apiToken);

      // Set timeout
      if (options.timeout) {
        this._timeout = options.timeout;
      }

      // Test authentication with a simple API call
      await this._testAuthentication();

      this._initialized = true;
      console.log(`[SignalWireProvider] Initialized successfully for space: ${this._spaceUrl}`);
    } catch (error) {
      if (error instanceof SignalWireError) {
        throw error;
      }
      throw new SignalWireError(
        `Failed to initialize SignalWire provider: ${error.message}`,
        SignalWireErrorCode.AUTHENTICATION_FAILED,
        { originalError: error.message }
      );
    }
  }

  /**
   * Normalize space URL to expected format
   *
   * @param {string} spaceUrl - The space URL to normalize
   * @returns {string} Normalized space URL
   * @private
   */
  _normalizeSpaceUrl(spaceUrl) {
    let normalized = spaceUrl.trim().toLowerCase();

    // Remove protocol if present
    normalized = normalized.replace(/^https?:\/\//, '');

    // Remove trailing slash
    normalized = normalized.replace(/\/$/, '');

    // Remove /api path if present
    normalized = normalized.replace(/\/api$/, '');

    // Validate format
    if (!normalized.match(/^[a-z0-9-]+\.signalwire\.com$/)) {
      throw new SignalWireError(
        `Invalid SignalWire Space URL format: "${spaceUrl}". Expected format: example.signalwire.com`,
        SignalWireErrorCode.INVALID_SPACE_URL
      );
    }

    return normalized;
  }

  /**
   * Normalize a phone number to E.164 format
   *
   * SignalWire requires phone numbers in E.164 format (e.g., +12125551234)
   *
   * @param {string} phoneNumber - Phone number in various formats
   * @returns {string} Phone number in E.164 format
   * @private
   */
  _normalizePhoneNumberToE164(phoneNumber) {
    if (!phoneNumber) return phoneNumber;

    // Remove all non-digit characters except leading +
    let normalized = phoneNumber.toString().trim();

    // If it already starts with +, keep it and clean the rest
    if (normalized.startsWith('+')) {
      normalized = '+' + normalized.slice(1).replace(/\D/g, '');
    } else {
      // Remove all non-digits
      normalized = normalized.replace(/\D/g, '');

      // If it's a 10-digit US number, add +1
      if (normalized.length === 10) {
        normalized = '+1' + normalized;
      }
      // If it's 11 digits starting with 1 (US), add +
      else if (normalized.length === 11 && normalized.startsWith('1')) {
        normalized = '+' + normalized;
      }
      // Otherwise just add + prefix
      else {
        normalized = '+' + normalized;
      }
    }

    return normalized;
  }

  /**
   * Create HTTP Basic Auth header
   *
   * SignalWire uses Basic Auth with Project ID as username and API Token as password
   *
   * @param {string} projectId - SignalWire Project ID
   * @param {string} apiToken - SignalWire API Token
   * @returns {string} Base64-encoded auth header value
   * @private
   */
  _createAuthHeader(projectId, apiToken) {
    const credentials = `${projectId}:${apiToken}`;
    const encoded = Buffer.from(credentials).toString('base64');
    return `Basic ${encoded}`;
  }

  /**
   * Check if an error is retryable based on status code or error type
   *
   * @param {number|string} statusCode - HTTP status code or error code
   * @param {Error} error - The error object
   * @returns {boolean} True if error is retryable
   * @private
   */
  _isRetryableError(statusCode, error = null) {
    // Check if status code is retryable
    if (typeof statusCode === 'number') {
      if (this._retryConfig.retryableStatusCodes.includes(statusCode)) {
        return true;
      }
    }

    // Check if error type is retryable (network errors)
    if (error && error.message) {
      for (const retryableError of this._retryConfig.retryableErrors) {
        if (error.message.includes(retryableError)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Calculate retry delay with exponential backoff
   *
   * @param {number} attemptNumber - Current attempt number (0-based)
   * @param {number} [statusCode] - HTTP status code (affects delay for rate limits)
   * @param {string} [retryAfterHeader] - Retry-After header value if present
   * @returns {number} Delay in milliseconds
   * @private
   */
  _calculateRetryDelay(attemptNumber, statusCode = null, retryAfterHeader = null) {
    // If Retry-After header is present, use it
    if (retryAfterHeader) {
      const retryAfterSeconds = parseInt(retryAfterHeader, 10);
      if (!isNaN(retryAfterSeconds)) {
        return Math.min(retryAfterSeconds * 1000, this._retryConfig.maxDelayMs);
      }
    }

    // Rate limit errors (429) get longer initial delay
    let initialDelay = this._retryConfig.initialDelayMs;
    if (statusCode === 429) {
      initialDelay = 2000; // 2 seconds for rate limit
    }

    // Calculate exponential backoff delay
    const delay = Math.min(
      initialDelay * Math.pow(this._retryConfig.backoffMultiplier, attemptNumber),
      this._retryConfig.maxDelayMs
    );

    // Add some jitter (±25%) to avoid thundering herd
    const jitter = delay * 0.25 * (Math.random() * 2 - 1);

    return Math.max(delay + jitter, initialDelay);
  }

  /**
   * Sleep for a specified duration
   *
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   * @private
   */
  async _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Log error with context for debugging
   *
   * @param {Error} error - The error that occurred
   * @param {Object} context - Additional context about the operation
   * @param {number} [attemptNumber] - Attempt number if retrying
   * @private
   */
  _logError(error, context, attemptNumber = null) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      provider: 'signalwire',
      error: {
        name: error.name,
        message: error.message,
        code: error.code || 'UNKNOWN',
        stack: error.stack
      },
      context
    };

    if (attemptNumber !== null) {
      logEntry.attemptNumber = attemptNumber;
    }

    // Log to console
    console.error(`[SignalWireProvider] Error:`, JSON.stringify(logEntry, null, 2));
  }

  /**
   * Test authentication with a simple API call
   *
   * Makes a request to list accounts to verify credentials are valid
   *
   * @returns {Promise<void>}
   * @throws {SignalWireError} If authentication fails
   * @private
   */
  async _testAuthentication() {
    try {
      const response = await this._makeRequest('GET', '/api/laml/2010-04-01/Accounts.json');

      if (!response.success) {
        throw new SignalWireError(
          'Authentication test failed: Invalid credentials',
          SignalWireErrorCode.INVALID_CREDENTIALS,
          { response: response.error }
        );
      }

      // Verify we got account data back
      if (!response.data || !response.data.accounts) {
        throw new SignalWireError(
          'Authentication test failed: Unexpected response format',
          SignalWireErrorCode.AUTHENTICATION_FAILED
        );
      }

      console.log('[SignalWireProvider] Authentication test successful');
    } catch (error) {
      if (error instanceof SignalWireError) {
        throw error;
      }
      throw new SignalWireError(
        `Authentication test failed: ${error.message}`,
        SignalWireErrorCode.AUTHENTICATION_FAILED
      );
    }
  }

  /**
   * Make an authenticated HTTP request to SignalWire API with retry logic
   *
   * Implements automatic retry for transient failures (5xx errors, rate limits, network issues)
   * with exponential backoff. Maps SignalWire errors to common TelephonyError types.
   *
   * @param {string} method - HTTP method (GET, POST, DELETE, etc.)
   * @param {string} path - API path (e.g., '/api/laml/2010-04-01/Accounts/.../Calls.json')
   * @param {Object} [body=null] - Request body for POST requests
   * @param {Object} [headers={}] - Additional headers
   * @param {Object} [context={}] - Additional context for error logging
   * @returns {Promise<Object>} Response object with success, data, error
   * @private
   */
  async _makeRequest(method, path, body = null, headers = {}, context = {}) {
    const url = `${this._baseUrl}${path}`;

    // SignalWire LAML API (Twilio-compatible) requires form-urlencoded for POST requests
    const isLamlEndpoint = path.includes('/api/laml/');
    const useFormEncoded = isLamlEndpoint && (method === 'POST' || method === 'PUT');

    const requestOptions = {
      method,
      headers: {
        'Authorization': this._authHeader,
        'Content-Type': useFormEncoded ? 'application/x-www-form-urlencoded' : 'application/json',
        'Accept': 'application/json',
        ...headers
      }
    };

    if (body) {
      if (useFormEncoded) {
        // Convert object to URL-encoded form data
        const formData = new URLSearchParams();
        for (const [key, value] of Object.entries(body)) {
          if (value !== undefined && value !== null) {
            // Handle arrays by appending multiple values with the same key
            // This is required for parameters like StatusCallbackEvent
            if (Array.isArray(value)) {
              for (const item of value) {
                formData.append(key, item.toString());
              }
            } else {
              formData.append(key, value.toString());
            }
          }
        }
        requestOptions.body = formData.toString();
      } else {
        requestOptions.body = JSON.stringify(body);
      }
    }

    // Retry loop
    let lastError;
    for (let attempt = 0; attempt <= this._retryConfig.maxRetries; attempt++) {
      // Add AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this._timeout);
      requestOptions.signal = controller.signal;

      try {
        const response = await fetch(url, requestOptions);
        clearTimeout(timeoutId);

        const contentType = response.headers.get('content-type') || '';
        const isJson = contentType.includes('application/json');

        let data;
        if (isJson) {
          data = await response.json();
        } else {
          data = await response.text();
        }

        if (response.ok) {
          return {
            success: true,
            data,
            status: response.status
          };
        }

        // Handle error responses
        let errorMessage = 'API request failed';
        let errorCode = SignalWireErrorCode.API_REQUEST_FAILED;

        // Log the full error response for debugging
        console.error(`[SignalWireProvider] API error (${response.status}):`, JSON.stringify(data, null, 2));

        // Extract error message from SignalWire's response format
        // SignalWire uses Twilio-compatible format: { message: "...", code: 12345, more_info: "..." }
        const swMessage = data?.message || data?.Message || data?.error || data?.Error;
        const swCode = data?.code || data?.Code;
        const swMoreInfo = data?.more_info || data?.MoreInfo;

        if (response.status === 401) {
          errorCode = SignalWireErrorCode.INVALID_CREDENTIALS;
          errorMessage = swMessage || 'Authentication failed: Invalid credentials';
        } else if (response.status === 403) {
          errorCode = SignalWireErrorCode.AUTHENTICATION_FAILED;
          errorMessage = swMessage || 'Authentication failed: Access denied';
        } else if (response.status === 404) {
          errorCode = SignalWireErrorCode.CALL_NOT_FOUND;
          errorMessage = swMessage || 'Resource not found';
        } else if (response.status === 429) {
          errorCode = SignalWireErrorCode.RATE_LIMIT_EXCEEDED;
          errorMessage = swMessage || 'Rate limit exceeded';
        } else if (response.status === 400 || response.status === 422) {
          const status = swMessage?.toLowerCase() || '';
          if (status.includes('insufficient funds') || status.includes('balance')) {
            errorCode = SignalWireErrorCode.INSUFFICIENT_FUNDS;
            errorMessage = 'Insufficient funds to complete the call';
          } else {
            errorMessage = swMessage || 'Invalid request';
          }
        } else if (swMessage) {
          errorMessage = swMessage;
        }

        // Include SignalWire error code if available
        if (swCode) {
          errorMessage = `${errorMessage} (Code: ${swCode})`;
        }

        // Create error object
        const error = new SignalWireError(errorMessage, errorCode, {
          status: response.status,
          data,
          url: path,
          method
        });

        // Check if error is retryable
        if (this._isRetryableError(response.status, error) && attempt < this._retryConfig.maxRetries) {
          const retryAfterHeader = response.headers.get('retry-after');
          const delay = this._calculateRetryDelay(attempt, response.status, retryAfterHeader);

          console.log(`[SignalWireProvider] Retryable error (${response.status}), retrying in ${delay}ms (attempt ${attempt + 1}/${this._retryConfig.maxRetries + 1})`);

          // Log the error
          this._logError(error, { ...context, url, method, body }, attempt);

          // Wait before retry
          await this._sleep(delay);
          lastError = error;
          continue; // Retry
        }

        // Non-retryable error or max retries reached
        return {
          success: false,
          error: errorMessage,
          errorCode,
          status: response.status,
          data
        };
      } catch (error) {
        clearTimeout(timeoutId);

        // Network or timeout error
        if (error.name === 'AbortError') {
          const timeoutError = new SignalWireError(
            `Request timeout after ${this._timeout}ms`,
            SignalWireErrorCode.API_REQUEST_FAILED,
            { url, method, timeout: this._timeout }
          );

          // Check if timeout is retryable
          if (this._isRetryableError(null, timeoutError) && attempt < this._retryConfig.maxRetries) {
            const delay = this._calculateRetryDelay(attempt, 408);
            console.log(`[SignalWireProvider] Timeout, retrying in ${delay}ms (attempt ${attempt + 1}/${this._retryConfig.maxRetries + 1})`);
            this._logError(timeoutError, { ...context, url, method }, attempt);
            await this._sleep(delay);
            lastError = timeoutError;
            continue;
          }

          return {
            success: false,
            error: timeoutError.message,
            errorCode: timeoutError.code
          };
        }

        // Other network errors
        const networkError = new SignalWireError(
          error.message,
          SignalWireErrorCode.API_REQUEST_FAILED,
          { url, method, originalError: error.name }
        );

        // Check if network error is retryable
        if (this._isRetryableError(null, networkError) && attempt < this._retryConfig.maxRetries) {
          const delay = this._calculateRetryDelay(attempt, null);
          console.log(`[SignalWireProvider] Network error, retrying in ${delay}ms (attempt ${attempt + 1}/${this._retryConfig.maxRetries + 1})`);
          this._logError(networkError, { ...context, url, method }, attempt);
          await this._sleep(delay);
          lastError = networkError;
          continue;
        }

        return {
          success: false,
          error: networkError.message,
          errorCode: networkError.code
        };
      }
    }

    // Max retries reached, return last error
    console.error(`[SignalWireProvider] Max retries (${this._retryConfig.maxRetries + 1}) exceeded`);

    return {
      success: false,
      error: lastError.message,
      errorCode: lastError.code,
      status: lastError.details?.status,
      data: lastError.details?.data
    };
  }

  /**
   * Initiate an outbound call
   *
   * @param {Object} params - Call parameters
   * @param {string} params.to - Destination phone number (E.164 format)
   * @param {string} params.from - Caller ID phone number (E.164 format)
   * @param {string} [params.webhookUrl] - URL for call status webhooks
   * @param {boolean} [params.record=false] - Whether to record the call
   * @param {Object} [params.recording] - Recording configuration
   * @param {string} [params.recording.channels='dual'] - Recording channels: 'dual' or 'mono'
   * @param {string} [params.recording.callbackUrl] - URL for recording status callbacks
   * @param {boolean} [params.recording.trimSilence=true] - Trim silence from recording
   * @param {Object} [params.amd] - AMD configuration
   * @param {number} [params.timeoutSecs=30] - Ring timeout
   * @returns {Promise<Object>} Call initiation result
   */
  async initiateCall(params) {
    if (!this._initialized) {
      throw new SignalWireError(
        'Provider not initialized. Call initialize() first.',
        SignalWireErrorCode.API_REQUEST_FAILED
      );
    }

    try {
      const { to, from, webhookUrl, record = false, recording, amd, timeoutSecs = 30, metadata } = params;

      // Validate phone numbers
      if (!to || !from) {
        throw new SignalWireError(
          'Both "to" and "from" phone numbers are required',
          SignalWireErrorCode.INVALID_PHONE_NUMBER
        );
      }

      // Normalize phone numbers to E.164 format
      const normalizedTo = this._normalizePhoneNumberToE164(to);
      const normalizedFrom = this._normalizePhoneNumberToE164(from);

      // Build request body
      const body = {
        To: normalizedTo,
        From: normalizedFrom,
        Url: webhookUrl || 'https://example.com/default.xml', // Should point to LaML XML
        Method: 'POST',
        Timeout: timeoutSecs,
        Record: record ? 'true' : 'false'
      };

      // Configure recording parameters
      if (record && recording) {
        // Recording channels: 'dual' (both directions) or 'mono' (single mixed track)
        // SignalWire uses 'record' attribute in LaML, but for REST API we set parameters
        if (recording.channels !== undefined) {
          const validChannels = ['dual', 'mono'];
          if (!validChannels.includes(recording.channels)) {
            throw new SignalWireError(
              `Invalid recording channels: "${recording.channels}". Valid options: ${validChannels.join(', ')}`,
              SignalWireErrorCode.INVALID_CREDENTIALS
            );
          }
          // SignalWire REST API doesn't have a direct channels parameter in the Call creation
          // This would typically be set in the LaML XML, but we can pass it as metadata
          // for use in the webhook handler
          if (!body.StatusCallback) {
            body.StatusCallback = webhookUrl ? webhookUrl.replace('/webhook', '/status') : undefined;
          }
        }

        // Recording status callback URL
        if (recording.callbackUrl) {
          body.RecordingStatusCallback = recording.callbackUrl;
          body.RecordingStatusCallbackMethod = 'POST';
        }

        // Trim silence from recording
        // SignalWire uses 'Trim' parameter: 'trim-silence' or 'do-not-trim'
        if (recording.trimSilence !== undefined) {
          body.Trim = recording.trimSilence ? 'trim-silence' : 'do-not-trim';
        }
      }

      // Add AMD detection if enabled
      if (amd && amd.enabled) {
        // MachineDetection: Enable, DetectMessageEnd, or none
        // Enable: Quick detection, result as soon as machine detected (good for hanging up)
        // DetectMessageEnd: Wait for machine message to end (good for leaving voicemail)
        if (amd.mode === 'detect_message_end' || amd.waitForBeep) {
          body.MachineDetection = 'DetectMessageEnd';
        } else {
          body.MachineDetection = 'Enable';
        }

        // MachineDetectionTimeout: Time to wait for AMD to complete (default 30s)
        if (amd.timeoutMs) {
          body.MachineDetectionTimeout = Math.floor(amd.timeoutMs / 1000);
        }

        // MachineDetectionSilenceTimeout: Time to wait for initial voice (default 5000ms)
        if (amd.silenceThresholdMs) {
          body.MachineDetectionSilenceTimeout = amd.silenceThresholdMs;
        }

        // MachineDetectionSpeechThreshold: How long to detect speech before determining machine (default 2400ms)
        if (amd.speechThresholdMs) {
          body.MachineDetectionSpeechThreshold = amd.speechThresholdMs;
        }

        // MachineDetectionSpeechEndThreshold: Silence before considering speech complete (default 1200ms)
        if (amd.speechEndThresholdMs) {
          body.MachineDetectionSpeechEndThreshold = amd.speechEndThresholdMs;
        }

        // MachineWordsThreshold: How many words before returning machine result (default 6)
        if (amd.wordsThreshold) {
          body.MachineWordsThreshold = amd.wordsThreshold;
        }

        // Async AMD: Run AMD in background while call proceeds
        if (amd.async) {
          body.AsyncAmd = 'true';

          // Async AMD requires a callback URL
          if (webhookUrl) {
            body.AsyncAmdStatusCallback = webhookUrl.replace('/webhook', '/amd');
            body.AsyncAmdStatusCallbackMethod = 'POST';
          }
        }
      }

      // Add status callback URL
      if (webhookUrl) {
        // Extract base URL and build proper status callback URL
        // webhookUrl is like: https://domain/api/webhooks/signalwire/laml?callId=123
        // We want: https://domain/api/webhooks/signalwire/voice?callId=123
        const statusCallbackUrl = webhookUrl.replace('/laml', '/voice');
        body.StatusCallback = statusCallbackUrl;
        // Note: StatusCallbackEvent needs to be passed as an array for multiple events
        // The _makeRequest method will handle converting this to multiple form parameters
        body.StatusCallbackEvent = ['initiated', 'ringing', 'answered', 'completed'];
      }

      // Make API request
      const response = await this._makeRequest(
        'POST',
        `/api/laml/2010-04-01/Accounts/${this._projectId}/Calls.json`,
        body
      );

      if (!response.success) {
        throw new SignalWireError(
          response.error,
          response.errorCode,
          { response }
        );
      }

      // Extract call data from response
      const callData = response.data;

      return {
        success: true,
        callControlId: callData.sid, // SignalWire Call SID
        callSessionId: callData.sid,
        status: this._mapSignalWireStatus(callData.status),
        rawResponse: callData
      };
    } catch (error) {
      if (error instanceof SignalWireError) {
        throw error;
      }
      throw new SignalWireError(
        `Failed to initiate call: ${error.message}`,
        SignalWireErrorCode.API_REQUEST_FAILED
      );
    }
  }

  /**
   * End an active call
   *
   * @param {Object} params - End call parameters
   * @param {string} params.callControlId - SignalWire Call SID
   * @param {string} [params.reason='normal'] - Reason for ending call
   * @returns {Promise<Object>} End call result
   */
  async endCall(params) {
    if (!this._initialized) {
      throw new SignalWireError('Provider not initialized', SignalWireErrorCode.API_REQUEST_FAILED);
    }

    try {
      const { callControlId, reason = 'completed' } = params;

      // Update call status to completed
      const response = await this._makeRequest(
        'POST',
        `/api/laml/2010-04-01/Accounts/${this._projectId}/Calls/${callControlId}.json`,
        { Status: 'completed' }
      );

      if (!response.success) {
        throw new SignalWireError(response.error, response.errorCode);
      }

      return {
        success: true,
        status: 'completed'
      };
    } catch (error) {
      if (error instanceof SignalWireError) {
        throw error;
      }
      throw new SignalWireError(
        `Failed to end call: ${error.message}`,
        SignalWireErrorCode.API_REQUEST_FAILED
      );
    }
  }

  /**
   * Get the current status of a call
   *
   * @param {Object} params - Get status parameters
   * @param {string} params.callControlId - SignalWire Call SID
   * @returns {Promise<Object>} Call status result
   */
  async getCallStatus(params) {
    if (!this._initialized) {
      throw new SignalWireError('Provider not initialized', SignalWireErrorCode.API_REQUEST_FAILED);
    }

    try {
      const { callControlId } = params;

      const response = await this._makeRequest(
        'GET',
        `/api/laml/2010-04-01/Accounts/${this._projectId}/Calls/${callControlId}.json`
      );

      if (!response.success) {
        throw new SignalWireError(response.error, response.errorCode);
      }

      const callData = response.data;

      // Extract AMD result if available
      let amdResult;
      if (callData.machine_detection) {
        // SignalWire returns: 'machine', 'human', 'unknown', or absent
        const md = callData.machine_detection.toLowerCase();
        if (md === 'machine') {
          amdResult = 'machine';
        } else if (md === 'human') {
          amdResult = 'human';
        } else {
          amdResult = 'unknown';
        }
      } else {
        amdResult = 'not_detected';
      }

      return {
        success: true,
        status: this._mapSignalWireStatus(callData.status),
        durationSecs: parseInt(callData.duration) || 0,
        answeredAt: callData.start_time ? new Date(callData.start_time) : undefined,
        endedAt: callData.end_time ? new Date(callData.end_time) : undefined,
        amdResult,
        rawResponse: callData
      };
    } catch (error) {
      if (error instanceof SignalWireError) {
        throw error;
      }
      throw new SignalWireError(
        `Failed to get call status: ${error.message}`,
        SignalWireErrorCode.API_REQUEST_FAILED
      );
    }
  }

  /**
   * Get the recording URL for a completed call
   *
   * @param {Object} params - Get recording parameters
   * @param {string} params.callControlId - SignalWire Call SID
   * @returns {Promise<Object>} Recording result
   */
  async getRecording(params) {
    if (!this._initialized) {
      throw new SignalWireError('Provider not initialized', SignalWireErrorCode.API_REQUEST_FAILED);
    }

    try {
      const { callControlId } = params;

      // List recordings for this call
      const response = await this._makeRequest(
        'GET',
        `/api/laml/2010-04-01/Accounts/${this._projectId}/Calls/${callControlId}/Recordings.json`
      );

      if (!response.success) {
        throw new SignalWireError(response.error, response.errorCode);
      }

      const recordings = response.data.recordings || [];
      if (recordings.length === 0) {
        return {
          success: true,
          recordingUrl: null,
          recordingStatus: 'not_available'
        };
      }

      // Get the first (usually only) recording
      const recording = recordings[0];

      return {
        success: true,
        recordingUrl: recording.uri,
        durationSecs: parseInt(recording.duration) || 0,
        format: 'wav', // SignalWire uses WAV
        recordingStatus: recording.status || 'ready'
      };
    } catch (error) {
      if (error instanceof SignalWireError) {
        throw error;
      }
      throw new SignalWireError(
        `Failed to get recording: ${error.message}`,
        SignalWireErrorCode.API_REQUEST_FAILED
      );
    }
  }

  /**
   * Configure Answering Machine Detection
   *
   * Validates and normalizes AMD configuration parameters for SignalWire.
   *
   * @param {Object} config - AMD configuration
   * @param {boolean} config.enabled - Whether AMD is enabled
   * @param {string} [config.mode='detect'] - Detection mode: 'detect', 'detect_message_end'
   * @param {number} [config.timeoutMs=30000] - Time to wait for AMD to complete
   * @param {number} [config.silenceThresholdMs=5000] - Time to wait for initial voice
   * @param {number} [config.speechThresholdMs=2400] - How long to detect speech before determining machine
   * @param {number} [config.speechEndThresholdMs=1200] - Silence before considering speech complete
   * @param {number} [config.wordsThreshold=6] - How many words before returning machine result
   * @param {boolean} [config.async=false] - Whether to use async AMD
   * @param {boolean} [config.waitForBeep=false] - Whether to wait for beep (alias for detect_message_end)
   * @returns {Promise<Object>} Configuration result
   */
  async configureAMD(config) {
    // Validate and normalize the configuration
    const normalized = {
      enabled: !!config.enabled,
      mode: config.mode || 'detect',
      timeoutMs: config.timeoutMs || 30000,
      silenceThresholdMs: config.silenceThresholdMs || 5000,
      speechThresholdMs: config.speechThresholdMs || 2400,
      speechEndThresholdMs: config.speechEndThresholdMs || 1200,
      wordsThreshold: config.wordsThreshold || 6,
      async: !!config.async,
      waitForBeep: !!config.waitForBeep
    };

    // Validate mode
    const validModes = ['detect', 'detect_message_end', 'detect_beep'];
    if (!validModes.includes(normalized.mode)) {
      throw new SignalWireError(
        `Invalid AMD mode: "${config.mode}". Valid modes: ${validModes.join(', ')}`,
        SignalWireErrorCode.INVALID_CREDENTIALS
      );
    }

    // Validate timeouts are positive numbers
    if (normalized.timeoutMs <= 0 || normalized.timeoutMs > 120000) {
      throw new SignalWireError(
        'AMD timeout must be between 1 and 120 seconds',
        SignalWireErrorCode.INVALID_CREDENTIALS
      );
    }

    // Validate thresholds are reasonable
    if (normalized.silenceThresholdMs < 2000 || normalized.silenceThresholdMs > 30000) {
      throw new SignalWireError(
        'Silence threshold must be between 2000 and 30000 ms',
        SignalWireErrorCode.INVALID_CREDENTIALS
      );
    }

    if (normalized.speechThresholdMs < 500 || normalized.speechThresholdMs > 10000) {
      throw new SignalWireError(
        'Speech threshold must be between 500 and 10000 ms',
        SignalWireErrorCode.INVALID_CREDENTIALS
      );
    }

    // SignalWire-specific parameters for documentation
    const signalWireParams = {
      MachineDetection: normalized.waitForBeep || normalized.mode === 'detect_message_end'
        ? 'DetectMessageEnd'
        : 'Enable',
      MachineDetectionTimeout: Math.floor(normalized.timeoutMs / 1000), // SignalWire uses seconds
      MachineDetectionSilenceTimeout: normalized.silenceThresholdMs, // SignalWire uses ms
      MachineDetectionSpeechThreshold: normalized.speechThresholdMs,
      MachineDetectionSpeechEndThreshold: normalized.speechEndThresholdMs,
      MachineWordsThreshold: normalized.wordsThreshold,
      AsyncAmd: normalized.async ? 'true' : 'false'
    };

    return {
      success: true,
      config: normalized,
      signalWireParams
    };
  }

  /**
   * Check the health of the SignalWire connection
   *
   * @returns {Promise<Object>} Health check result
   */
  async healthCheck() {
    const startTime = Date.now();

    if (!this._initialized) {
      return {
        healthy: false,
        provider: this.name,
        error: 'Provider not initialized'
      };
    }

    try {
      // Make a simple API call to test connectivity
      await this._testAuthentication();

      const responseTime = Date.now() - startTime;

      return {
        healthy: true,
        provider: this.name,
        responseTimeMs: responseTime,
        details: {
          spaceUrl: this._spaceUrl,
          projectId: this._projectId.substring(0, 8) + '...' // Partial for security
        }
      };
    } catch (error) {
      return {
        healthy: false,
        provider: this.name,
        error: error.message
      };
    }
  }

  /**
   * Map SignalWire status to unified call status
   *
   * @param {string} signalWireStatus - SignalWire status string
   * @returns {string} Unified call status
   * @private
   */
  _mapSignalWireStatus(signalWireStatus) {
    const statusMap = {
      'queued': 'queued',
      'initiated': 'initiated',
      'ringing': 'ringing',
      'in-progress': 'in_progress',
      'completed': 'completed',
      'failed': 'failed',
      'busy': 'busy',
      'no-answer': 'no_answer',
      'canceled': 'cancelled'
    };

    return statusMap[signalWireStatus] || signalWireStatus.toLowerCase().replace('-', '_');
  }

  /**
   * List phone numbers associated with the account
   *
   * @param {Object} [options={}] - Filtering options
   * @param {string} [options.phoneNumber] - Filter by specific phone number
   * @param {string} [options.friendlyName] - Filter by friendly name
   * @param {number} [options.limit=50] - Maximum number of results
   * @param {number} [options.offset=0] - Offset for pagination
   * @returns {Promise<Object>} List of phone numbers
   */
  async listPhoneNumbers(options = {}) {
    if (!this._initialized) {
      throw new SignalWireError('Provider not initialized', SignalWireErrorCode.API_REQUEST_FAILED);
    }

    try {
      const { phoneNumber, friendlyName, limit = 50, offset = 0 } = options;

      // Build query parameters
      // Note: SignalWire uses 0-based page numbering
      const params = new URLSearchParams({
        PageSize: limit.toString(),
        Page: Math.floor(offset / limit).toString()
      });

      if (phoneNumber) {
        params.append('PhoneNumber', phoneNumber);
      }

      if (friendlyName) {
        params.append('FriendlyName', friendlyName);
      }

      const queryString = params.toString();
      const path = `/api/laml/2010-04-01/Accounts/${this._projectId}/IncomingPhoneNumbers.json${queryString ? '?' + queryString : ''}`;

      const response = await this._makeRequest('GET', path);

      if (!response.success) {
        throw new SignalWireError(response.error, response.errorCode);
      }

      // Normalize phone number objects
      const numbers = (response.data.incoming_phone_numbers || response.data.phone_numbers || [])
        .map(num => this._normalizePhoneNumber(num));

      return {
        success: true,
        phoneNumbers: numbers,
        total: response.data.total || response.data.total_number_of_records || numbers.length,
        limit,
        offset
      };
    } catch (error) {
      if (error instanceof SignalWireError) {
        throw error;
      }
      throw new SignalWireError(
        `Failed to list phone numbers: ${error.message}`,
        SignalWireErrorCode.API_REQUEST_FAILED
      );
    }
  }

  /**
   * Search for available phone numbers to purchase
   *
   * @param {Object} options - Search criteria
   * @param {string} [options.areaCode] - Area code to search (e.g., '212')
   * @param {string} [options.contains] - Pattern the number should contain
   * @param {string} [options.country='US'] - Country code (default: US)
   * @param {string} [options.inLocalAreacode=true] - Search within local area code
   * @param {number} [options.limit=10] - Maximum numbers to return
   * @param {string} [options.type='any'] - Number type: 'local', 'tollFree', or 'any'
   * @returns {Promise<Object>} Available phone numbers
   */
  async searchAvailableNumbers(options = {}) {
    if (!this._initialized) {
      throw new SignalWireError('Provider not initialized', SignalWireErrorCode.API_REQUEST_FAILED);
    }

    try {
      const {
        areaCode,
        contains,
        country = 'US',
        inLocalAreacode = true,
        limit = 10,
        type = 'any'
      } = options;

      // Determine which endpoint to use based on type
      let endpoint;
      const params = new URLSearchParams({
        PageSize: limit.toString()
      });

      if (areaCode) {
        // Search by area code
        if (type === 'tollFree') {
          endpoint = `/api/laml/2010-04-01/Accounts/${this._projectId}/AvailablePhoneNumbers/${country}/TollFree.json`;
        } else {
          endpoint = `/api/laml/2010-04-01/Accounts/${this._projectId}/AvailablePhoneNumbers/${country}/Local.json`;
          params.append('AreaCode', areaCode);
        }
      } else if (contains) {
        // Search by pattern
        if (type === 'tollFree') {
          endpoint = `/api/laml/2010-04-01/Accounts/${this._projectId}/AvailablePhoneNumbers/${country}/TollFree.json`;
        } else {
          endpoint = `/api/laml/2010-04-01/Accounts/${this._projectId}/AvailablePhoneNumbers/${country}/Local.json`;
        }
        params.append('Contains', contains);
      } else {
        throw new SignalWireError(
          'Either areaCode or contains parameter is required',
          SignalWireErrorCode.INVALID_PHONE_NUMBER
        );
      }

      if (inLocalAreacode && areaCode) {
        params.append('InLocalAreacode', 'true');
      }

      const queryString = params.toString();
      const path = `${endpoint}${queryString ? '?' + queryString : ''}`;

      const response = await this._makeRequest('GET', path);

      if (!response.success) {
        throw new SignalWireError(response.error, response.errorCode);
      }

      // Normalize available phone numbers
      const numbers = (response.data.available_phone_numbers || [])
        .map(num => this._normalizePhoneNumber({
          ...num,
          phone_number: num.phone_number || num.phoneNumber,
          friendly_name: num.friendly_name || num.friendlyName,
          region: num.region || num.city || '',
          country: num.country || country
        }));

      return {
        success: true,
        phoneNumbers: numbers,
        total: numbers.length,
        country,
        type
      };
    } catch (error) {
      if (error instanceof SignalWireError) {
        throw error;
      }
      throw new SignalWireError(
        `Failed to search available numbers: ${error.message}`,
        SignalWireErrorCode.API_REQUEST_FAILED
      );
    }
  }

  /**
   * Provision (purchase) a phone number
   *
   * @param {Object} options - Provisioning options
   * @param {string} options.phoneNumber - The phone number to purchase (E.164 format)
   * @param {string} [options.friendlyName] - Optional friendly name for the number
   * @param {string} [options.voiceUrl] - URL for voice webhook
   * @param {string} [options.smsUrl] - URL for SMS webhook
   * @param {string} [options.statusCallback] - URL for status callbacks
   * @returns {Promise<Object>} Provisioned phone number details
   */
  async provisionNumber(options) {
    if (!this._initialized) {
      throw new SignalWireError('Provider not initialized', SignalWireErrorCode.API_REQUEST_FAILED);
    }

    try {
      const { phoneNumber, friendlyName, voiceUrl, smsUrl, statusCallback } = options;

      if (!phoneNumber) {
        throw new SignalWireError(
          'phoneNumber is required for provisioning',
          SignalWireErrorCode.INVALID_PHONE_NUMBER
        );
      }

      // Build request body
      const body = {
        PhoneNumber: phoneNumber
      };

      if (friendlyName) {
        body.FriendlyName = friendlyName;
      }

      if (voiceUrl) {
        body.VoiceUrl = voiceUrl;
        body.VoiceMethod = 'POST';
      }

      if (smsUrl) {
        body.SmsUrl = smsUrl;
        body.SmsMethod = 'POST';
      }

      if (statusCallback) {
        body.StatusCallback = statusCallback;
      }

      const response = await this._makeRequest(
        'POST',
        `/api/laml/2010-04-01/Accounts/${this._projectId}/IncomingPhoneNumbers.json`,
        body
      );

      if (!response.success) {
        // Handle specific provisioning errors
        if (response.status === 400) {
          throw new SignalWireError(
            `Invalid phone number or number already taken: ${response.error}`,
            SignalWireErrorCode.INVALID_PHONE_NUMBER,
            { originalError: response.data }
          );
        }
        if (response.status === 402 && response.errorCode === SignalWireErrorCode.INSUFFICIENT_FUNDS) {
          throw new SignalWireError(
            'Insufficient funds to purchase phone number',
            SignalWireErrorCode.INSUFFICIENT_FUNDS
          );
        }
        throw new SignalWireError(response.error, response.errorCode);
      }

      // Normalize the provisioned number
      const provisioned = this._normalizePhoneNumber(response.data);

      console.log(`[SignalWireProvider] Successfully provisioned number: ${phoneNumber}`);

      return {
        success: true,
        phoneNumber: provisioned,
        accountSid: response.data.account_sid,
        sid: response.data.sid
      };
    } catch (error) {
      if (error instanceof SignalWireError) {
        throw error;
      }
      throw new SignalWireError(
        `Failed to provision phone number: ${error.message}`,
        SignalWireErrorCode.API_REQUEST_FAILED
      );
    }
  }

  /**
   * Release (delete) a phone number from the account
   *
   * @param {Object} options - Release options
   * @param {string} options.phoneNumberSid - The SID of the phone number to release
   * @returns {Promise<Object>} Release result
   */
  async releaseNumber(options) {
    if (!this._initialized) {
      throw new SignalWireError('Provider not initialized', SignalWireErrorCode.API_REQUEST_FAILED);
    }

    try {
      const { phoneNumberSid } = options;

      if (!phoneNumberSid) {
        throw new SignalWireError(
          'phoneNumberSid is required for releasing a number',
          SignalWireErrorCode.INVALID_PHONE_NUMBER
        );
      }

      const response = await this._makeRequest(
        'DELETE',
        `/api/laml/2010-04-01/Accounts/${this._projectId}/IncomingPhoneNumbers/${phoneNumberSid}.json`
      );

      if (!response.success && response.status !== 404) {
        throw new SignalWireError(response.error, response.errorCode);
      }

      console.log(`[SignalWireProvider] Successfully released number SID: ${phoneNumberSid}`);

      return {
        success: true,
        released: true,
        phoneNumberSid
      };
    } catch (error) {
      if (error instanceof SignalWireError) {
        throw error;
      }
      throw new SignalWireError(
        `Failed to release phone number: ${error.message}`,
        SignalWireErrorCode.API_REQUEST_FAILED
      );
    }
  }

  /**
   * Normalize a phone number object to a standard format
   *
   * @param {Object} rawNumber - Raw phone number from SignalWire API
   * @returns {Object} Normalized phone number object
   * @private
   */
  _normalizePhoneNumber(rawNumber) {
    return {
      phoneNumber: rawNumber.phone_number || rawNumber.phoneNumber,
      friendlyName: rawNumber.friendly_name || rawNumber.friendlyName || '',
      sid: rawNumber.sid || rawNumber.phone_number_sid || rawNumber.phoneNumberSid,
      accountSid: rawNumber.account_sid || rawNumber.accountSid,
      capabilities: {
        voice: rawNumber.capabilities?.voice || rawNumber.capabilities_voice || true,
        sms: rawNumber.capabilities?.sms || rawNumber.capabilities_sms || true,
        mms: rawNumber.capabilities?.mms || rawNumber.capabilities_mms || false,
        fax: rawNumber.capabilities?.fax || rawNumber.capabilities_fax || false
      },
      region: rawNumber.region || rawNumber.city || rawNumber.state || '',
      country: rawNumber.iso_country || rawNumber.country || 'US',
      latency: rawNumber.latency || null,
      beta: rawNumber.beta || false,
      rateCenter: rawNumber.rate_center || rawNumber.rateCenter || '',
      lata: rawNumber.lata || '',
      voiceUrl: rawNumber.voice_url || rawNumber.voiceUrl || '',
      smsUrl: rawNumber.sms_url || rawNumber.smsUrl || '',
      statusCallback: rawNumber.status_callback || rawNumber.statusCallback || '',
      dateCreated: rawNumber.date_created ? new Date(rawNumber.date_created) : null,
      dateUpdated: rawNumber.date_updated ? new Date(rawNumber.date_updated) : null
    };
  }

  /**
   * Disconnect and cleanup
   *
   * @returns {Promise<void>}
   */
  async disconnect() {
    this._initialized = false;
    this._projectId = null;
    this._apiToken = null;
    this._spaceUrl = null;
    this._authHeader = null;
    console.log('[SignalWireProvider] Disconnected');
  }
}

// Export error code enum for use in tests
export { SignalWireErrorCode };

export default SignalWireProvider;
