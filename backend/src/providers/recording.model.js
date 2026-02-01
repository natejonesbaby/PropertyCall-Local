/**
 * Unified Recording Model
 *
 * This module defines a common Recording interface that abstracts the different
 * URL formats and authentication methods between telephony providers (Telnyx,
 * SignalWire). This allows the application to retrieve and play call recordings
 * uniformly regardless of which provider is being used.
 *
 * The Recording model encapsulates:
 * - URL format normalization
 * - Authentication method abstraction
 * - Metadata (duration, format, size)
 * - Provider-specific retrieval logic
 *
 * @module providers/recording.model
 */

// ============================================================================
// Recording Interface
// ============================================================================

/**
 * Unified Recording interface
 *
 * Represents a call recording with normalized metadata and access methods.
 * Implementations should provider-specific URL formats and auth while exposing
 * a consistent interface to the application.
 *
 * @interface Recording
 *
 * @property {string} url - The normalized recording URL
 * @property {string} provider - The telephony provider ('telnyx' or 'signalwire')
 * @property {string} callId - The provider's call ID
 * @property {string} format - The audio format ('mp3', 'wav', etc.)
 * @property {number|null} durationSeconds - Duration in seconds (if known)
 * @property {number|null} sizeBytes - File size in bytes (if known)
 * @property {Date|null} createdAt - When the recording was created (if known)
 * @property {Object} providerData - Provider-specific data (auth tokens, etc.)
 *
 * @method {Promise<string>} getAuthenticatedUrl - Get URL with authentication applied
 * @method {Promise<Buffer>} fetch - Fetch the recording audio data
 * @method {Object} toJSON - Serialize to plain object for storage/transmission
 */

/**
 * Recording class - Base implementation
 *
 * Provides a unified interface for call recordings. This class abstracts
 * provider-specific differences in URL formats and authentication methods.
 *
 * @example
 * // Create from Telnyx webhook data
 * const recording = Recording.fromTelnyxWebhook({
 *   recording_urls: { mp3: 'https://cdn.telnyx.com/recordings/123.mp3' }
 * });
 *
 * // Get authenticated URL for playback
 * const url = await recording.getAuthenticatedUrl(apiKey);
 *
 * // Serialize for database storage
 * db.prepare('INSERT INTO calls (recording_data) VALUES (?)')
 *   .run(JSON.stringify(recording.toJSON()));
 */
export class Recording {
  /**
   * Create a Recording instance
   *
   * @param {Object} data - Recording data
   * @param {string} data.url - The recording URL
   * @param {string} [data.provider='telnyx'] - The telephony provider
   * @param {string} [data.callId] - The provider's call ID
   * @param {string} [data.format='mp3'] - Audio format
   * @param {number} [data.durationSeconds] - Duration in seconds
   * @param {number} [data.sizeBytes] - File size in bytes
   * @param {Date|string} [data.createdAt] - When recording was created
   * @param {Object} [data.providerData] - Provider-specific data
   */
  constructor(data = {}) {
    this.url = data.url || '';
    this.provider = data.provider || 'telnyx';
    this.callId = data.callId || null;
    this.format = data.format || 'mp3';
    this.durationSeconds = data.durationSeconds || null;
    this.sizeBytes = data.sizeBytes || null;
    this.createdAt = data.createdAt ? new Date(data.createdAt) : null;
    this.providerData = data.providerData || {};

    // Freeze to prevent accidental modification
    Object.freeze(this);
  }

  /**
   * Get URL with authentication applied
   *
   * For some providers (like SignalWire), the URL may need to include
   * authentication tokens or be signed. For others (like Telnyx), the
   * URL is public but authentication is handled via HTTP headers.
   *
   * @param {Object} credentials - Provider credentials
   * @param {string} [credentials.apiKey] - API key for authentication
   * @param {string} [credentials.accessToken] - Access token for authentication
   * @returns {Promise<string>} The URL with authentication applied
   */
  async getAuthenticatedUrl(credentials = {}) {
    switch (this.provider.toLowerCase()) {
      case 'telnyx':
        return this._getTelnyxAuthenticatedUrl(credentials);
      case 'signalwire':
        return this._getSignalWireAuthenticatedUrl(credentials);
      default:
        console.warn(`[Recording] Unknown provider "${this.provider}", returning raw URL`);
        return this.url;
    }
  }

  /**
   * Get authenticated URL for Telnyx recordings
   *
   * Telnyx recordings are hosted on public CDN URLs, but may require
   * API key authentication for access in some configurations.
   *
   * @private
   * @param {Object} credentials
   * @returns {Promise<string>}
   */
  async _getTelnyxAuthenticatedUrl(credentials) {
    // Telnyx recording URLs are typically public CDN URLs
    // Format: https://cdn.telnyx.com/recordings/{callId}.mp3
    // or: https:// recording.telnyx.com/{recordingId}

    // If URL already contains auth params, return as-is
    if (this.url.includes('?')) {
      return this.url;
    }

    // For Telnyx, URLs are usually public, so we return the URL as-is
    // Authentication (if needed) would be handled via HTTP headers when fetching
    return this.url;
  }

  /**
   * Get authenticated URL for SignalWire recordings
   *
   * SignalWire recordings may require authentication tokens in the URL
   * or use signed URLs with expiration times.
   *
   * @private
   * @param {Object} credentials
   * @returns {Promise<string>}
   */
  async _getSignalWireAuthenticatedUrl(credentials) {
    // SignalWire recording URLs may need auth tokens
    // Format: https://{space}.signalwire.com/api/laml/2010-04-01/Accounts/{accountSid}/Recordings/{recordingId}
    // May require ?AccessToken={token} or similar

    // If URL already has query params, return as-is
    if (this.url.includes('?')) {
      return this.url;
    }

    // If access token provided, append it
    if (credentials.accessToken) {
      const url = new URL(this.url);
      url.searchParams.set('AccessToken', credentials.accessToken);
      return url.toString();
    }

    // Return raw URL if no auth needed
    return this.url;
  }

  /**
   * Fetch the recording audio data
   *
   * Downloads the actual audio file from the provider using appropriate
   * authentication.
   *
   * @param {Object} credentials - Provider credentials
   * @param {Object} [options] - Fetch options
   * @param {boolean} [options.verify=false] - Verify SSL certificates (for testing)
   * @returns {Promise<Buffer>} The audio data as a Buffer
   * @throws {Error} If fetch fails
   */
  async fetch(credentials = {}, options = {}) {
    const fetch = (await import('node-fetch')).default;

    const headers = {};

    // Add authentication headers based on provider
    switch (this.provider.toLowerCase()) {
      case 'telnyx':
        if (credentials.apiKey) {
          headers['Authorization'] = `Bearer ${credentials.apiKey}`;
        }
        break;
      case 'signalwire':
        if (credentials.accessToken) {
          headers['Authorization'] = `Bearer ${credentials.accessToken}`;
        }
        break;
    }

    try {
      const response = await fetch(this.url, {
        headers,
        // Add validation if verify is true
        ...options
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch recording: ${response.status} ${response.statusText}`);
      }

      // Get content type to verify format
      const contentType = response.headers.get('content-type');
      if (contentType && !contentType.includes('audio')) {
        console.warn(`[Recording] Unexpected content-type: ${contentType}`);
      }

      // Return as buffer
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      console.error(`[Recording] Error fetching recording from ${this.url}:`, error);
      throw error;
    }
  }

  /**
   * Serialize to plain object
   *
   * Converts the Recording instance to a plain object suitable for:
   * - Database storage (as JSON)
   * - API responses
   * - Logging
   *
   * @returns {Object} Plain object representation
   */
  toJSON() {
    return {
      url: this.url,
      provider: this.provider,
      callId: this.callId,
      format: this.format,
      durationSeconds: this.durationSeconds,
      sizeBytes: this.sizeBytes,
      createdAt: this.createdAt ? this.createdAt.toISOString() : null,
      providerData: this.providerData
    };
  }

  /**
   * Deserialize from plain object
   *
   * Creates a Recording instance from a plain object (e.g., from database).
   *
   * @param {Object} data - Plain object from toJSON()
   * @returns {Recording} Recording instance
   */
  static fromJSON(data) {
    return new Recording(data);
  }

  /**
   * Create Recording from Telnyx webhook data
   *
   * Parses Telnyx webhook event (call.recording.saved) and creates a Recording.
   *
   * @param {Object} webhookData - Telnyx webhook payload
   * @param {Object} webhookData.recording_urls - URLs by format ({ mp3: '...', wav: '...' })
   * @param {Object} [webhookData.public_recording_urls] - Public URLs (alternative)
   * @param {string} [webhookData.call_control_id] - Call ID
   * @param {number} [webhookData.recording_duration] - Duration in seconds
   * @returns {Recording|null} Recording instance or null if no URL found
   *
   * @example
   * const recording = Recording.fromTelnyxWebhook({
   *   event_type: 'call.recording.saved',
   *   call_control_id: 'abc123',
   *   recording_urls: { mp3: 'https://cdn.telnyx.com/recordings/abc123.mp3' },
   *   recording_duration: 45
   * });
   */
  static fromTelnyxWebhook(webhookData) {
    const url = webhookData.recording_urls?.mp3 ||
                webhookData.public_recording_urls?.mp3 ||
                webhookData.recording_urls?.wav ||
                webhookData.public_recording_urls?.wav;

    if (!url) {
      console.warn('[Recording] No recording URL found in Telnyx webhook');
      return null;
    }

    // Determine format from URL
    const format = url.includes('.wav') ? 'wav' : 'mp3';

    return new Recording({
      url,
      provider: 'telnyx',
      callId: webhookData.call_control_id || webhookData.call_call_id || null,
      format,
      durationSeconds: webhookData.recording_duration || null,
      createdAt: new Date(),
      providerData: {
        eventType: webhookData.event_type,
        recordingId: webhookData.recording_id || null
      }
    });
  }

  /**
   * Create Recording from SignalWire data
   *
   * Parses SignalWire recording data and creates a Recording.
   *
   * @param {Object} signalWireData - SignalWire recording data
   * @param {string} signalWireData.recordingUrl - URL to the recording
   * @param {string} [signalWireData.callSid] - Call SID
   * @param {string} [signalWireData.recordingSid] - Recording SID
   * @param {number} [signalWireData.duration] - Duration in seconds
   * @returns {Recording|null} Recording instance or null if no URL found
   *
   * @example
   * const recording = Recording.fromSignalWireData({
   *   recordingUrl: 'https://space.signalwire.com/recording/RE123.mp3',
   *   callSid: 'CA123',
   *   duration: 60
   * });
   */
  static fromSignalWireData(signalWireData) {
    const url = signalWireData.recordingUrl || signalWireData.uri;

    if (!url) {
      console.warn('[Recording] No recording URL found in SignalWire data');
      return null;
    }

    // Determine format from URL or default to mp3
    const format = url.includes('.wav') ? 'wav' :
                   url.includes('.mp3') ? 'mp3' : 'mp3';

    return new Recording({
      url,
      provider: 'signalwire',
      callId: signalWireData.callSid || null,
      format,
      durationSeconds: signalWireData.duration || null,
      createdAt: signalWireData.dateCreated ? new Date(signalWireData.dateCreated) : new Date(),
      providerData: {
        recordingSid: signalWireData.recordingSid || signalWireData.sid || null,
        accountSid: signalWireData.accountSid || null
      }
    });
  }

  /**
   * Create Recording from database recording_url string
   *
   * Legacy method for backward compatibility. Converts old string URLs
   * to Recording instances.
   *
   * @param {string} recordingUrl - The recording URL string from database
   * @param {string} [provider='telnyx'] - Provider name (default: telnyx)
   * @returns {Recording} Recording instance
   */
  static fromLegacyUrl(recordingUrl, provider = 'telnyx') {
    if (!recordingUrl || typeof recordingUrl !== 'string') {
      return null;
    }

    // Determine format from URL
    const format = recordingUrl.includes('.wav') ? 'wav' : 'mp3';

    return new Recording({
      url: recordingUrl,
      provider,
      format
    });
  }

  /**
   * Validate a recording URL
   *
   * Checks if a URL is a valid recording URL.
   *
   * @param {string} url - URL to validate
   * @returns {boolean} True if valid
   */
  static isValidUrl(url) {
    if (!url || typeof url !== 'string') {
      return false;
    }

    try {
      const parsed = new URL(url);
      // Must be http or https
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return false;
      }
      // Check full URL for audio-related keywords (hostname + pathname)
      const fullUrl = parsed.href.toLowerCase();
      const path = parsed.pathname.toLowerCase();
      return path.includes('recording') ||
             path.endsWith('.mp3') ||
             path.endsWith('.wav') ||
             fullUrl.includes('recording');
    } catch {
      return false;
    }
  }

  /**
   * Get provider from recording URL
   *
   * Attempts to detect the provider from the URL format.
   *
   * @param {string} url - Recording URL
   * @returns {string|null} Provider name or null if unknown
   */
  static detectProvider(url) {
    if (!url || typeof url !== 'string') {
      return null;
    }

    const lowerUrl = url.toLowerCase();

    if (lowerUrl.includes('telnyx')) {
      return 'telnyx';
    }
    if (lowerUrl.includes('signalwire')) {
      return 'signalwire';
    }
    if (lowerUrl.includes('twilio')) {
      return 'signalwire'; // SignalWire uses Twilio-compatible format
    }

    // Default to telnyx for unknown URLs (current default)
    return 'telnyx';
  }
}

// ============================================================================
// Recording URL Manager
// ============================================================================

/**
 * Recording URL Manager
 *
 * Provides utility functions for managing recording URLs in the application.
 * Handles conversion between legacy string URLs and Recording objects.
 */
export const RecordingUrlManager = {
  /**
   * Convert database value to Recording instance
   *
   * Handles both legacy string URLs and new Recording objects.
   *
   * @param {string|Object|null} dbValue - Value from database recording_url or recording_data column
   * @returns {Recording|null} Recording instance or null
   */
  fromDatabase(dbValue) {
    if (!dbValue) {
      return null;
    }

    // If it's a string, try to parse as JSON first, then treat as legacy URL
    if (typeof dbValue === 'string') {
      try {
        // Try parsing as JSON first (new format)
        const parsed = JSON.parse(dbValue);
        if (parsed && typeof parsed === 'object' && parsed.url) {
          return Recording.fromJSON(parsed);
        }
      } catch {
        // Not JSON, treat as legacy URL
        const provider = Recording.detectProvider(dbValue);
        return Recording.fromLegacyUrl(dbValue, provider);
      }
    }

    // If it's already an object, use directly
    if (typeof dbValue === 'object' && dbValue.url) {
      return Recording.fromJSON(dbValue);
    }

    return null;
  },

  /**
   * Convert Recording to database-storable value
   *
   * For backward compatibility, if the recording is a simple Telnyx recording,
   * stores just the URL string. Otherwise stores the full object as JSON.
   *
   * @param {Recording} recording - Recording instance
   * @returns {string} URL or JSON string
   */
  toDatabase(recording) {
    if (!recording) {
      return null;
    }

    // For simple Telnyx recordings, store just URL for backward compatibility
    if (recording.provider === 'telnyx' &&
        !recording.providerData ||
        Object.keys(recording.providerData).length === 0) {
      return recording.url;
    }

    // For complex recordings or other providers, store full object
    return JSON.stringify(recording.toJSON());
  },

  /**
   * Get recording URL for API response
   *
   * Returns the appropriate URL format for API clients.
   *
   * @param {Recording} recording - Recording instance
   * @param {Object} credentials - Provider credentials (optional)
   * @returns {Promise<Object>} Response object with URL and metadata
   */
  async toApiResponse(recording, credentials = {}) {
    if (!recording) {
      return null;
    }

    // Get authenticated URL if credentials provided
    const url = credentials.apiKey || credentials.accessToken ?
      await recording.getAuthenticatedUrl(credentials) :
      recording.url;

    return {
      url,
      provider: recording.provider,
      format: recording.format,
      durationSeconds: recording.durationSeconds,
      sizeBytes: recording.sizeBytes
    };
  }
};

// ============================================================================
// Default Export
// ============================================================================

export default {
  Recording,
  RecordingUrlManager
};
