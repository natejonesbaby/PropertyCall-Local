/**
 * Telnyx Telephony Provider
 *
 * Implementation of the TelephonyProvider interface for Telnyx.
 * Refactored from existing Telnyx integration code to implement
 * the common telephony provider interface.
 *
 * @module providers/telnyx-provider
 */

import crypto from 'crypto';
import { TELNYX_CAPABILITIES } from './provider-factory.js';
import { Recording } from './recording.model.js';

/**
 * Telnyx-specific error codes
 */
const TelnyxErrorCode = {
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
  INVALID_API_KEY: 'INVALID_API_KEY',
  INVALID_PHONE_NUMBER: 'INVALID_PHONE_NUMBER',
  CALL_NOT_FOUND: 'CALL_NOT_FOUND',
  API_REQUEST_FAILED: 'API_REQUEST_FAILED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  NETWORK_ERROR: 'NETWORK_ERROR'
};

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG = {
  maxRetries: 2,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableStatusCodes: [429, 500, 502, 503],
  retryableErrors: ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND']
};

/**
 * Telnyx-specific error class
 */
export class TelnyxError extends Error {
  constructor(message, code = 'TELNYX_ERROR', details = null) {
    super(message);
    this.name = 'TelnyxError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Telnyx Telephony Provider
 *
 * Implements the TelephonyProvider interface for Telnyx REST API.
 * Supports outbound calling, call control, recording, AMD, and webhooks.
 */
export class TelnyxProvider {
  /**
   * Create a new Telnyx provider instance
   */
  constructor() {
    this.name = 'telnyx';
    this.version = '1.0.0';
    this._initialized = false;
    this._capabilities = TELNYX_CAPABILITIES;

    // Telnyx credentials
    this._apiKey = null;

    // HTTP client configuration
    this._baseUrl = null;
    this._timeout = 30000; // 30 seconds default

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
   * Initialize the Telnyx provider with API credentials
   *
   * Telnyx uses a single API key for authentication.
   * The API key is passed in the Authorization header as a Bearer token.
   *
   * @param {string} apiKey - Telnyx API key
   * @param {Object} options - Initialization options
   * @param {string} [options.baseUrl] - Custom base URL (for testing with mock server)
   * @param {number} [options.timeout] - Request timeout in milliseconds
   * @returns {Promise<void>}
   * @throws {TelnyxError} If authentication fails or API key is invalid
   */
  async initialize(apiKey, options = {}) {
    try {
      // Validate API key
      if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
        throw new TelnyxError(
          'API key is required for Telnyx authentication',
          TelnyxErrorCode.INVALID_API_KEY
        );
      }

      this._apiKey = apiKey.trim();

      // Set base URL (supports mock server for testing)
      this._baseUrl = options.baseUrl || process.env.TELNYX_API_BASE || 'https://api.telnyx.com';

      // Set timeout
      if (options.timeout) {
        this._timeout = options.timeout;
      }

      // Test authentication with a simple API call
      await this._testAuthentication();

      this._initialized = true;
      console.log(`[TelnyxProvider] Initialized successfully with base URL: ${this._baseUrl}`);
    } catch (error) {
      if (error instanceof TelnyxError) {
        throw error;
      }
      throw new TelnyxError(
        `Failed to initialize Telnyx provider: ${error.message}`,
        TelnyxErrorCode.AUTHENTICATION_FAILED,
        { originalError: error.message }
      );
    }
  }

  /**
   * Test authentication with a simple API call
   *
   * @returns {Promise<void>}
   * @private
   */
  async _testAuthentication() {
    try {
      const result = await this._makeRequest('GET', '/v2/phone_numbers', {
        limit: 1
      });

      if (result && result.data !== undefined) {
        console.log('[TelnyxProvider] Authentication test successful');
      }
    } catch (error) {
      if (error instanceof TelnyxError) {
        throw error;
      }
      throw new TelnyxError(
        `Authentication test failed: ${error.message}`,
        TelnyxErrorCode.AUTHENTICATION_FAILED
      );
    }
  }

  /**
   * Make an authenticated HTTP request to the Telnyx API
   *
   * @param {string} method - HTTP method (GET, POST, DELETE, etc.)
   * @param {string} path - API endpoint path
   * @param {Object} [body] - Request body for POST/PUT requests
   * @param {Object} [query] - Query parameters
   * @returns {Promise<Object>} Response data
   * @private
   */
  async _makeRequest(method, path, body = null, query = null) {
    let url = `${this._baseUrl}${path}`;

    // Add query parameters
    if (query) {
      const queryParams = new URLSearchParams(query);
      url += `?${queryParams.toString()}`;
    }

    const headers = {
      'Authorization': `Bearer ${this._apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    const options = {
      method,
      headers,
      timeout: this._timeout
    };

    // Only add body for non-GET/HEAD requests
    if (body && method !== 'GET' && method !== 'HEAD') {
      options.body = JSON.stringify(body);
    } else if (body && (method === 'GET' || method === 'HEAD')) {
      // For GET requests, move body parameters to query string
      const queryParams = new URLSearchParams(body);
      url += (url.includes('?') ? '&' : '?') + queryParams.toString();
    }

    try {
      const response = await fetch(url, options);

      // Handle non-JSON responses (like 204 No Content)
      const contentType = response.headers.get('content-type');
      let data;
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = { status: response.status };
      }

      // Handle error responses
      if (!response.ok) {
        throw this._handleErrorResponse(response, data);
      }

      return data;
    } catch (error) {
      // Re-throw Telnyx errors
      if (error instanceof TelnyxError) {
        throw error;
      }

      // Handle network errors
      if (error.type === 'system' || error.code === 'ECONNREFUSED') {
        throw new TelnyxError(
          `Network error: ${error.message}`,
          TelnyxErrorCode.NETWORK_ERROR,
          { originalError: error.message }
        );
      }

      throw new TelnyxError(
        `API request failed: ${error.message}`,
        TelnyxErrorCode.API_REQUEST_FAILED,
        { originalError: error.message }
      );
    }
  }

  /**
   * Handle error responses from Telnyx API
   *
   * @param {Response} response - Fetch response object
   * @param {Object} data - Response data
   * @returns {TelnyxError} Error object with appropriate code
   * @private
   */
  _handleErrorResponse(response, data) {
    const statusCode = response.status;
    const errorMessage = data?.errors?.[0]?.detail || data?.error || data?.message || 'Unknown error';

    // Map HTTP status codes to Telnyx error codes
    switch (statusCode) {
      case 401:
        return new TelnyxError(
          `Authentication failed: ${errorMessage}`,
          TelnyxErrorCode.INVALID_API_KEY,
          { statusCode, response: data }
        );

      case 404:
        return new TelnyxError(
          `Resource not found: ${errorMessage}`,
          TelnyxErrorCode.CALL_NOT_FOUND,
          { statusCode, response: data }
        );

      case 422:
        return new TelnyxError(
          `Validation error: ${errorMessage}`,
          TelnyxErrorCode.INVALID_PHONE_NUMBER,
          { statusCode, response: data }
        );

      case 429:
        return new TelnyxError(
          `Rate limit exceeded: ${errorMessage}`,
          TelnyxErrorCode.RATE_LIMIT_EXCEEDED,
          { statusCode, response: data }
        );

      default:
        return new TelnyxError(
          `API request failed (${statusCode}): ${errorMessage}`,
          TelnyxErrorCode.API_REQUEST_FAILED,
          { statusCode, response: data }
        );
    }
  }

  /**
   * Initiate an outbound call
   *
   * Refactored from existing Telnyx call initiation code in routes/calls.js
   *
   * @param {Object} params - Call parameters
   * @param {string} params.to - Destination phone number (E.164 format)
   * @param {string} params.from - Caller ID phone number (E.164 format)
   * @param {string} [params.connectionId] - Telnyx connection ID
   * @param {string} [params.webhookUrl] - URL for call event webhooks
   * @param {string} [params.webhookMethod] - HTTP method for webhooks (POST or GET)
   * @param {boolean} [params.record] - Whether to enable call recording
   * @param {Object} [params.amd] - AMD configuration options
   * @param {Object} [params.metadata] - Custom metadata
   * @param {number} [params.timeoutSecs] - Call timeout in seconds
   * @returns {Promise<Object>} Call initiation result
   */
  async initiateCall(params) {
    try {
      // Validate parameters
      if (!params.to || !params.from) {
        throw new TelnyxError(
          'Missing required parameters: to and from are required',
          TelnyxErrorCode.INVALID_PHONE_NUMBER
        );
      }

      // Normalize phone numbers to E.164 format
      const to = this._normalizePhoneNumber(params.to);
      const from = this._normalizePhoneNumber(params.from);

      // Build request payload based on Telnyx API
      const payload = {
        to: to,
        from: from,
        connection_id: params.connectionId,
        webhook_url: params.webhookUrl,
        webhook_method: params.webhookMethod || 'POST',
        timeout_secs: params.timeoutSecs
      };

      // Add recording parameters
      if (params.record) {
        payload.record = 'true';
        payload.recording_channels = 'dual'; // or 'single'
      }

      // Add AMD parameters
      if (params.amd && params.amd.enabled) {
        payload.answering_machine_detection = params.amd.mode || 'detect';

        if (params.amd.timeoutMs) {
          payload.answering_machine_detection_timeout = Math.floor(params.amd.timeoutMs / 1000);
        }

        if (params.amd.waitForBeep) {
          payload.answering_machine_detection_silence_ttl = 2; // Wait for beep
        }
      }

      // Add metadata
      if (params.metadata) {
        payload.client_state = JSON.stringify(params.metadata);
      }

      // Make API request to Telnyx
      const result = await this._makeRequest('POST', '/v2/calls', payload);

      // Extract call control ID from response
      const callControlId = result.data?.call_control_id;

      if (!callControlId) {
        throw new TelnyxError(
          'Call initiated but no call_control_id returned',
          TelnyxErrorCode.API_REQUEST_FAILED,
          { response: result }
        );
      }

      return {
        success: true,
        callControlId: callControlId,
        callSessionId: result.data?.call_session_id || callControlId,
        status: 'initiated',
        rawResponse: result
      };
    } catch (error) {
      if (error instanceof TelnyxError) {
        throw error;
      }
      throw new TelnyxError(
        `Failed to initiate call: ${error.message}`,
        TelnyxErrorCode.API_REQUEST_FAILED
      );
    }
  }

  /**
   * End an active call
   *
   * Refactored from existing Telnyx hangup code in routes/calls.js
   *
   * @param {Object} params - Parameters identifying the call to end
   * @param {string} params.callControlId - Telnyx call control ID
   * @param {string} [params.reason] - Reason for ending the call
   * @returns {Promise<Object>} Call ending result
   */
  async endCall(params) {
    try {
      if (!params.callControlId) {
        throw new TelnyxError(
          'Missing required parameter: callControlId is required',
          TelnyxErrorCode.INVALID_PHONE_NUMBER
        );
      }

      // Telnyx uses hangup payload with reason
      const payload = {
        reason: params.reason || 'normal'
      };

      await this._makeRequest(
        'POST',
        `/v2/calls/${params.callControlId}/actions/hangup`,
        payload
      );

      return {
        success: true,
        status: 'cancelled'
      };
    } catch (error) {
      if (error instanceof TelnyxError) {
        throw error;
      }
      throw new TelnyxError(
        `Failed to end call: ${error.message}`,
        TelnyxErrorCode.API_REQUEST_FAILED
      );
    }
  }

  /**
   * Get the current status of a call
   *
   * @param {Object} params - Parameters identifying the call
   * @param {string} params.callControlId - Telnyx call control ID
   * @returns {Promise<Object>} Call status information
   */
  async getCallStatus(params) {
    try {
      if (!params.callControlId) {
        throw new TelnyxError(
          'Missing required parameter: callControlId is required',
          TelnyxErrorCode.INVALID_PHONE_NUMBER
        );
      }

      const result = await this._makeRequest('GET', `/v2/calls/${params.callControlId}`);
      const callData = result.data;

      // Map Telnyx status to unified status
      const statusMapping = {
        'initializing': 'initiated',
        'ringing': 'ringing',
        'answered': 'answered',
        'bridged': 'in_progress',
        'completed': 'completed',
        'failed': 'failed',
        'busy': 'busy',
        'no-answer': 'no_answer',
        'canceled': 'cancelled',
        'voicemail': 'voicemail'
      };

      const unifiedStatus = statusMapping[callData?.status] || callData?.status || 'unknown';

      // Extract AMD result if present
      let amdResult = 'not_detected';
      if (callData?.answering_machine_detection) {
        const amdResultMapping = {
          'machine': 'machine',
          'human': 'human',
          'unknown': 'unknown'
        };
        amdResult = amdResultMapping[callData.answering_machine_detection] || 'unknown';
      }

      return {
        success: true,
        status: unifiedStatus,
        durationSecs: callData?.duration_secs || 0,
        answeredAt: callData?.started_at ? new Date(callData.started_at) : undefined,
        endedAt: callData?.ended_at ? new Date(callData.ended_at) : undefined,
        amdResult: amdResult,
        rawResponse: result
      };
    } catch (error) {
      if (error instanceof TelnyxError) {
        throw error;
      }
      throw new TelnyxError(
        `Failed to get call status: ${error.message}`,
        TelnyxErrorCode.API_REQUEST_FAILED
      );
    }
  }

  /**
   * Get the recording URL for a completed call
   *
   * Refactored from existing Recording model code
   *
   * @param {Object} params - Parameters identifying the call or recording
   * @param {string} [params.callControlId] - Telnyx call control ID
   * @param {string} [params.recordingId] - Telnyx recording ID
   * @param {string} [params.recordingUrl] - Direct recording URL (for backward compatibility)
   * @param {Object} [params.webhookData] - Webhook data containing recording info
   * @returns {Promise<Object>} Recording information
   */
  async getRecording(params) {
    try {
      // Support backward compatibility with Recording model
      if (params.recordingUrl) {
        return Recording.fromLegacyUrl(params.recordingUrl, 'telnyx');
      }

      if (params.webhookData) {
        return Recording.fromTelnyxWebhook(params.webhookData);
      }

      // If callControlId is provided, fetch recording from Telnyx API
      if (params.callControlId || params.recordingId) {
        const recordingId = params.recordingId || params.callControlId;

        const result = await this._makeRequest('GET', `/v2/recordings/${recordingId}`);
        const recordingData = result.data;

        return {
          success: true,
          recordingUrl: recordingData?.url || recordingData?.download_url,
          durationSecs: recordingData?.duration_secs || 0,
          format: recordingData?.recording_format || 'mp3',
          sizeBytes: recordingData?.file_size_bytes || 0,
          recordingStatus: 'ready',
          rawResponse: result
        };
      }

      throw new TelnyxError(
        'Recording URL, webhook data, or call/recording ID required',
        TelnyxErrorCode.INVALID_PHONE_NUMBER
      );
    } catch (error) {
      if (error instanceof TelnyxError) {
        throw error;
      }
      throw new TelnyxError(
        `Failed to get recording: ${error.message}`,
        TelnyxErrorCode.API_REQUEST_FAILED
      );
    }
  }

  /**
   * Configure Answering Machine Detection for calls
   *
   * @param {Object} config - AMD configuration options
   * @param {boolean} config.enabled - Whether AMD is enabled
   * @param {string} [config.mode] - Detection mode: 'detect' | 'detect_beep' | 'async'
   * @param {number} [config.timeoutMs] - Maximum time to wait for AMD detection
   * @param {number} [config.silenceThresholdMs] - Silence threshold for machine detection
   * @param {boolean} [config.waitForBeep] - Whether to wait for beep before playing message
   * @returns {Promise<Object>} Configuration result
   */
  async configureAMD(config) {
    try {
      if (!config || typeof config.enabled !== 'boolean') {
        throw new TelnyxError(
          'AMD configuration must include enabled boolean',
          TelnyxErrorCode.INVALID_PHONE_NUMBER
        );
      }

      // Validate AMD mode
      const validModes = ['detect', 'detect_beep', 'async'];
      if (config.mode && !validModes.includes(config.mode)) {
        throw new TelnyxError(
          `Invalid AMD mode: ${config.mode}. Valid modes: ${validModes.join(', ')}`,
          TelnyxErrorCode.INVALID_PHONE_NUMBER
        );
      }

      // Store AMD configuration for use in initiateCall
      this._amdConfig = {
        enabled: config.enabled,
        mode: config.mode || 'detect',
        timeoutMs: config.timeoutMs || 15000,
        silenceThresholdMs: config.silenceThresholdMs || 5000,
        waitForBeep: config.waitForBeep || false
      };

      return {
        success: true,
        config: this._amdConfig
      };
    } catch (error) {
      if (error instanceof TelnyxError) {
        throw error;
      }
      throw new TelnyxError(
        `Failed to configure AMD: ${error.message}`,
        TelnyxErrorCode.API_REQUEST_FAILED
      );
    }
  }

  /**
   * Check the health/connectivity of the Telnyx provider
   *
   * @returns {Promise<Object>} Health check result
   */
  async healthCheck() {
    const startTime = Date.now();

    try {
      if (!this._initialized) {
        return {
          healthy: false,
          provider: this.name,
          error: 'Provider not initialized'
        };
      }

      // Test API connectivity
      await this._makeRequest('GET', '/v2/phone_numbers', { limit: 1 });

      const responseTimeMs = Date.now() - startTime;

      return {
        healthy: true,
        provider: this.name,
        responseTimeMs,
        details: {
          baseUrl: this._baseUrl,
          authenticated: true
        }
      };
    } catch (error) {
      return {
        healthy: false,
        provider: this.name,
        error: error.message,
        responseTimeMs: Date.now() - startTime
      };
    }
  }

  /**
   * Normalize phone number to E.164 format
   *
   * @param {string} phoneNumber - Phone number to normalize
   * @returns {string} E.164 formatted phone number
   * @private
   */
  _normalizePhoneNumber(phoneNumber) {
    let normalized = phoneNumber.trim();

    // Add + if not present and not a special number
    if (!normalized.startsWith('+') && !normalized.startsWith('sip:')) {
      // If it's a US number (10 digits), add +1
      if (/^\d{10}$/.test(normalized)) {
        normalized = '+1' + normalized;
      } else if (/^\d{11}$/.test(normalized) && normalized.startsWith('1')) {
        normalized = '+' + normalized;
      } else {
        normalized = '+' + normalized;
      }
    }

    return normalized;
  }

  /**
   * Play an audio message or speak text on an active call
   *
   * This is used for playing voicemail messages when AMD detects a machine.
   *
   * @param {Object} params - Speak parameters
   * @param {string} params.callControlId - Telnyx call control ID
   * @param {string} params.text - Text to speak (TTS)
   * @param {string} [params.voice='female'] - Voice to use
   * @param {string} [params.language='en-US'] - Language
   * @param {string} [params.payload] - Audio payload URL (optional, for pre-recorded audio)
   * @returns {Promise<Object>} Speak result
   */
  async speak(params) {
    try {
      if (!params.callControlId) {
        throw new TelnyxError(
          'Missing required parameter: callControlId is required',
          TelnyxErrorCode.INVALID_PHONE_NUMBER
        );
      }

      if (!params.text && !params.payload) {
        throw new TelnyxError(
          'Either text or payload is required for speak action',
          TelnyxErrorCode.INVALID_PHONE_NUMBER
        );
      }

      // Telnyx speak payload
      const payload = {
        payload: params.payload || params.text,
        voice: params.voice || 'female',
        language: params.language || 'en-US'
      };

      await this._makeRequest(
        'POST',
        `/v2/calls/${params.callControlId}/actions/speak`,
        payload
      );

      return {
        success: true
      };
    } catch (error) {
      if (error instanceof TelnyxError) {
        throw error;
      }
      throw new TelnyxError(
        `Failed to play audio: ${error.message}`,
        TelnyxErrorCode.API_REQUEST_FAILED
      );
    }
  }

  /**
   * Cleanup and disconnect from the provider
   *
   * @returns {Promise<void>}
   */
  async disconnect() {
    this._apiKey = null;
    this._initialized = false;
    console.log('[TelnyxProvider] Disconnected');
  }
}

export default TelnyxProvider;
