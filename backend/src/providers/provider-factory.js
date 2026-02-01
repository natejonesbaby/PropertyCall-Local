/**
 * Provider Factory
 *
 * Factory function for instantiating the correct telephony provider
 * based on user settings. This abstracts provider selection so the
 * application can support multiple telephony providers (Telnyx, SignalWire)
 * without changing the core calling logic.
 *
 * @module providers/provider-factory
 */

import db from '../db/index.js';

/**
 * Telnyx Provider Capabilities
 *
 * Telnyx is a full-featured telephony provider with robust support for
 * all features required by Property Call.
 */
export const TELNYX_CAPABILITIES = {
  provider: 'telnyx',
  version: '1.0.0',
  supportsAMD: true,
  amdModes: ['detect', 'detect_beep', 'async'],
  supportsRecording: true,
  recordingFormats: ['mp3', 'wav'],
  automaticRecordingStorage: true,
  supportsAudioStreaming: true,
  streamingEncodings: ['g711_ulaw', 'g711_alaw', 'linear16'],
  streamingSampleRates: [8000, 16000, 24000, 48000],
  supportsDualDirectionStreaming: true,
  supportsWebhooks: true,
  webhookEvents: [
    'call.initiated',
    'call.ringing',
    'call.answered',
    'call.hangup',
    'call.recording.saved',
    'call.machine.detection.ended',
    'call.playback.ended'
  ],
  supportsCallDetailApi: true,
  supportsCallControlApi: true,
  supportsHealthCheck: true,
  maxConcurrentCalls: 0, // Unlimited
  maxCallDurationSecs: 0, // No limit
  customCapabilities: {
    supportsPhoneNumberPooling: true,
    supportsCallForwarding: true,
    supportsSip: true
  },
  limitations: []
};

/**
 * SignalWire Provider Capabilities
 *
 * SignalWire is a compatible alternative to Telnyx with similar features.
 * Some limitations exist compared to Telnyx.
 */
export const SIGNALWIRE_CAPABILITIES = {
  provider: 'signalwire',
  version: '1.0.0',
  supportsAMD: true,
  amdModes: ['detect', 'detect_beep'],
  supportsRecording: true,
  recordingFormats: ['wav'],
  automaticRecordingStorage: true,
  supportsAudioStreaming: true,
  streamingEncodings: ['g711_ulaw', 'g711_alaw', 'linear16'],
  streamingSampleRates: [8000, 16000],
  supportsDualDirectionStreaming: true,
  supportsWebhooks: true,
  webhookEvents: [
    'call.initiated',
    'call.ringing',
    'call.answered',
    'call.hangup',
    'call.recording'
  ],
  supportsCallDetailApi: true,
  supportsCallControlApi: true,
  supportsHealthCheck: true,
  maxConcurrentCalls: 0, // Unlimited
  maxCallDurationSecs: 14400, // 4 hours
  customCapabilities: {
    supportsPhoneNumberPooling: true,
    supportsCallForwarding: true,
    supportsSip: true
  },
  limitations: [
    'async AMD mode not supported',
    'Maximum call duration: 4 hours',
    'Recording only available in WAV format'
  ]
};

/**
 * Supported telephony providers
 */
export const SUPPORTED_PROVIDERS = ['telnyx', 'signalwire'];

/**
 * Default telephony provider if none is configured
 */
export const DEFAULT_PROVIDER = 'telnyx';

/**
 * Error class for provider-related errors
 */
export class ProviderError extends Error {
  constructor(message, code = 'PROVIDER_ERROR') {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
  }
}

/**
 * Error codes for provider errors
 */
export const ProviderErrorCode = {
  UNKNOWN_PROVIDER: 'UNKNOWN_PROVIDER',
  PROVIDER_NOT_CONFIGURED: 'PROVIDER_NOT_CONFIGURED',
  PROVIDER_INIT_FAILED: 'PROVIDER_INIT_FAILED',
  NO_API_KEY: 'NO_API_KEY'
};

/**
 * Get the currently selected telephony provider name from settings
 *
 * @param {number} userId - The user ID to get settings for
 * @returns {string} The provider name ('telnyx' or 'signalwire')
 */
export function getSelectedProviderName(userId) {
  try {
    const row = db.prepare(`
      SELECT value FROM settings WHERE user_id = ? AND key = 'telephony_provider'
    `).get(userId);

    if (row && row.value) {
      const provider = row.value.toLowerCase().trim();
      if (SUPPORTED_PROVIDERS.includes(provider)) {
        return provider;
      }
      console.warn(`[ProviderFactory] Unknown provider "${provider}" in settings, using default: ${DEFAULT_PROVIDER}`);
    }

    return DEFAULT_PROVIDER;
  } catch (error) {
    console.error('[ProviderFactory] Error reading provider setting:', error);
    return DEFAULT_PROVIDER;
  }
}

/**
 * Set the selected telephony provider in settings
 *
 * @param {number} userId - The user ID to save settings for
 * @param {string} providerName - The provider name ('telnyx' or 'signalwire')
 * @throws {ProviderError} If the provider name is not supported
 */
export function setSelectedProvider(userId, providerName) {
  const normalizedName = providerName.toLowerCase().trim();

  if (!SUPPORTED_PROVIDERS.includes(normalizedName)) {
    throw new ProviderError(
      `Unknown provider: "${providerName}". Supported providers: ${SUPPORTED_PROVIDERS.join(', ')}`,
      ProviderErrorCode.UNKNOWN_PROVIDER
    );
  }

  db.prepare(`
    INSERT INTO settings (user_id, key, value, updated_at)
    VALUES (?, 'telephony_provider', ?, datetime('now'))
    ON CONFLICT(user_id, key) DO UPDATE SET
      value = excluded.value,
      updated_at = datetime('now')
  `).run(userId, normalizedName);

  console.log(`[ProviderFactory] Provider set to "${normalizedName}" for user ${userId}`);
}

/**
 * Actual TelnyxProvider implementation
 *
 * Implemented in Feature #256
 * This replaces the stub with full REST API client functionality
 * Refactored from existing Telnyx integration code
 */

/**
 * Actual SignalWireProvider implementation
 *
 * Implemented in Feature #242
 * This replaces the stub with full REST API client functionality
 */

/**
 * Provider class mapping
 * Maps provider names to their implementation classes
 * Note: Both providers are imported dynamically to avoid circular references
 */
const providerClasses = {
  telnyx: null, // Will be loaded dynamically
  signalwire: null // Will be loaded dynamically
};

/**
 * Create a new provider instance based on the provider name
 *
 * @param {string} providerName - The provider name ('telnyx' or 'signalwire')
 * @returns {Object} A new provider instance (uninitialized)
 * @throws {ProviderError} If the provider name is not supported
 */
export async function createProviderInstance(providerName) {
  const normalizedName = providerName.toLowerCase().trim();

  // Load providers dynamically to avoid circular references
  if (normalizedName === 'telnyx' && !providerClasses.telnyx) {
    const { TelnyxProvider } = await import('./telnyx-provider.js');
    providerClasses.telnyx = TelnyxProvider;
  }

  if (normalizedName === 'signalwire' && !providerClasses.signalwire) {
    const { SignalWireProvider } = await import('./signalwire-provider.js');
    providerClasses.signalwire = SignalWireProvider;
  }

  const ProviderClass = providerClasses[normalizedName];
  if (!ProviderClass) {
    throw new ProviderError(
      `Unknown provider: "${providerName}". Supported providers: ${SUPPORTED_PROVIDERS.join(', ')}`,
      ProviderErrorCode.UNKNOWN_PROVIDER
    );
  }

  return new ProviderClass();
}

/**
 * Get the telephony provider instance for a user
 *
 * This is the main factory function. It:
 * 1. Reads the selected provider from user settings
 * 2. Creates an instance of the appropriate provider class
 * 3. Optionally initializes the provider with API credentials
 *
 * @param {number} userId - The user ID to get the provider for
 * @param {Object} options - Factory options
 * @param {boolean} [options.initialize=false] - Whether to initialize the provider with API credentials
 * @param {string} [options.apiKey] - Optional API key override (otherwise reads from db)
 * @param {Object} [options.providerOptions] - Additional options to pass to provider.initialize()
 * @returns {Promise<Object>} The provider instance
 * @throws {ProviderError} If provider creation or initialization fails
 */
export async function getProvider(userId, options = {}) {
  const { initialize = false, apiKey: apiKeyOverride, providerOptions = {} } = options;

  // Get the selected provider name from settings
  const providerName = getSelectedProviderName(userId);
  console.log(`[ProviderFactory] Getting provider for user ${userId}: ${providerName}`);

  // Create a new provider instance
  const provider = await createProviderInstance(providerName);

  // Initialize the provider if requested
  if (initialize) {
    let apiKey = apiKeyOverride;

    // If no API key override, try to get from database
    if (!apiKey) {
      const row = db.prepare(`
        SELECT api_key_encrypted FROM api_keys WHERE user_id = ? AND service = ?
      `).get(userId, providerName);

      if (row && row.api_key_encrypted) {
        // Note: API keys are stored encrypted, but the provider factory
        // shouldn't handle decryption - that should be done by the caller
        // or by a dedicated crypto service. For now, we'll pass the encrypted key
        // and expect the caller to handle decryption before calling getProvider.
        apiKey = row.api_key_encrypted;
      }
    }

    if (!apiKey) {
      throw new ProviderError(
        `No API key configured for provider: ${providerName}`,
        ProviderErrorCode.NO_API_KEY
      );
    }

    try {
      await provider.initialize(apiKey, providerOptions);
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error;
      }
      throw new ProviderError(
        `Failed to initialize ${providerName} provider: ${error.message}`,
        ProviderErrorCode.PROVIDER_INIT_FAILED
      );
    }
  }

  return provider;
}

/**
 * Get provider information without creating an instance
 *
 * @param {string} providerName - The provider name
 * @returns {Promise<Object>} Provider metadata
 * @throws {ProviderError} If the provider name is not supported
 */
export async function getProviderInfo(providerName) {
  const normalizedName = providerName.toLowerCase().trim();

  if (!SUPPORTED_PROVIDERS.includes(normalizedName)) {
    throw new ProviderError(
      `Unknown provider: "${providerName}". Supported providers: ${SUPPORTED_PROVIDERS.join(', ')}`,
      ProviderErrorCode.UNKNOWN_PROVIDER
    );
  }

  const tempInstance = await createProviderInstance(normalizedName);

  return {
    name: tempInstance.name,
    version: tempInstance.version,
    supported: true
  };
}

/**
 * List all supported providers with their metadata
 *
 * @returns {Promise<Array<Object>>} Array of provider info objects
 */
export async function listSupportedProviders() {
  const results = [];

  for (const name of SUPPORTED_PROVIDERS) {
    try {
      const info = await getProviderInfo(name);
      results.push(info);
    } catch {
      results.push({ name, supported: false, error: 'Failed to get provider info' });
    }
  }

  return results;
}

/**
 * Get capabilities for a specific provider by name
 *
 * Returns the capabilities object without creating a provider instance.
 * Useful for checking provider capabilities before instantiation.
 *
 * @param {string} providerName - The provider name ('telnyx' or 'signalwire')
 * @returns {Object} Provider capabilities object
 * @throws {ProviderError} If the provider name is not supported
 */
export function getProviderCapabilities(providerName) {
  const normalizedName = providerName.toLowerCase().trim();

  switch (normalizedName) {
    case 'telnyx':
      return TELNYX_CAPABILITIES;
    case 'signalwire':
      return SIGNALWIRE_CAPABILITIES;
    default:
      throw new ProviderError(
        `Unknown provider: "${providerName}". Supported providers: ${SUPPORTED_PROVIDERS.join(', ')}`,
        ProviderErrorCode.UNKNOWN_PROVIDER
      );
  }
}

/**
 * Get capabilities for the current user's selected provider
 *
 * Reads the provider from user settings and returns its capabilities.
 *
 * @param {number} userId - The user ID to get provider capabilities for
 * @returns {Object} Provider capabilities object
 */
export function getSelectedProviderCapabilities(userId) {
  const providerName = getSelectedProviderName(userId);
  return getProviderCapabilities(providerName);
}

// Default export is the main factory function
export default getProvider;
