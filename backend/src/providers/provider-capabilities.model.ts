/**
 * Provider Capabilities Model
 *
 * Defines the capabilities interface for telephony providers.
 * Each provider can declare which features it supports, allowing the
 * application to adapt behavior based on the selected provider.
 *
 * @module providers/provider-capabilities.model
 */

/**
 * ProviderCapabilities Interface
 *
 * Defines which features a telephony provider supports.
 * This allows the application to conditionally enable/disable features
 * based on the current provider's capabilities.
 */
export interface ProviderCapabilities {
  /**
   * Provider name identifier
   */
  provider: string;

  /**
   * Provider version
   */
  version: string;

  /**
   * Whether the provider supports Answering Machine Detection (AMD)
   */
  supportsAMD: boolean;

  /**
   * AMD detection modes supported
   * If supportsAMD is false, this should be an empty array
   */
  amdModes: ('detect' | 'detect_beep' | 'async')[];

  /**
   * Whether the provider supports call recording
   */
  supportsRecording: boolean;

  /**
   * Recording formats supported (e.g., 'mp3', 'wav', 'raw')
   */
  recordingFormats: string[];

  /**
   * Whether recordings are automatically stored by the provider
   * If false, recordings must be manually captured via audio streaming
   */
  automaticRecordingStorage: boolean;

  /**
   * Whether the provider supports real-time audio streaming
   * Required for AI voice agent integration
   */
  supportsAudioStreaming: boolean;

  /**
   * Audio encoding formats supported for streaming
   */
  streamingEncodings: ('g711_ulaw' | 'g711_alaw' | 'linear16' | 'opus')[];

  /**
   * Sample rates supported for audio streaming (in Hz)
   */
  streamingSampleRates: (8000 | 16000 | 24000 | 48000)[];

  /**
   * Whether the provider supports dual-direction streaming (send and receive)
   * If false, only one direction may be supported
   */
  supportsDualDirectionStreaming: boolean;

  /**
   * Whether the provider supports webhook events for call status updates
   */
  supportsWebhooks: boolean;

  /**
   * Webhook event types supported
   */
  webhookEvents: string[];

  /**
   * Whether the provider supports retrieving call details via API
   */
  supportsCallDetailApi: boolean;

  /**
   * Whether the provider supports ending/hanging up calls via API
   */
  supportsCallControlApi: boolean;

  /**
   * Whether the provider supports health check/status endpoint
   */
  supportsHealthCheck: boolean;

  /**
   * Maximum concurrent calls supported (0 = unlimited)
   */
  maxConcurrentCalls: number;

  /**
   * Maximum call duration in seconds (0 = no limit)
   */
  maxCallDurationSecs: number;

  /**
   * Custom capabilities specific to this provider
   * Allows for provider-specific features not in the standard set
   */
  customCapabilities?: Record<string, boolean | string | number>;

  /**
   * Any limitations or caveats for this provider
   * Useful for displaying warnings to users
   */
  limitations?: string[];
}

/**
 * Capability check result
 *
 * Returned when checking if a specific capability is supported
 */
export interface CapabilityCheckResult {
  /**
   * Whether the capability is supported
   */
  supported: boolean;

  /**
   * The capability name that was checked
   */
  capability: string;

  /**
   * Additional details about the capability
   * For example, if checking streaming formats, this would list the supported formats
   */
  details?: unknown;

  /**
   * Reason why the capability is not supported (if applicable)
   */
  reason?: string;
}

/**
 * Check if a provider supports a specific capability
 *
 * @param capabilities - The provider's capabilities object
 * @param capability - The capability name to check (camelCase)
 * @returns Result indicating if the capability is supported
 */
export function checkCapability(
  capabilities: ProviderCapabilities,
  capability: string
): CapabilityCheckResult {
  const value = (capabilities as unknown as Record<string, unknown>)[capability];

  // Boolean capabilities (supports*)
  if (capability.startsWith('supports')) {
    const supported = Boolean(value);
    return {
      supported,
      capability,
      reason: supported ? undefined : `Provider does not support ${capability}`
    };
  }

  // Array capabilities (formats, modes, etc.)
  if (capability.endsWith('Modes') || capability.endsWith('Formats') ||
      capability.endsWith('Encodings') || capability.endsWith('SampleRates') ||
      capability.endsWith('Events')) {
    const arr = value as unknown[];
    const supported = Array.isArray(arr) && arr.length > 0;
    return {
      supported,
      capability,
      details: arr,
      reason: supported ? undefined : `Provider has no ${capability}`
    };
  }

  // Numeric capabilities (max*)
  if (capability.startsWith('max')) {
    const num = value as number;
    const supported = typeof num === 'number' && num > 0;
    return {
      supported,
      capability,
      details: num,
      reason: supported ? undefined : `Provider ${capability} is ${num}`
    };
  }

  // Unknown capability
  return {
    supported: false,
    capability,
    reason: `Unknown capability: ${capability}`
  };
}

/**
 * Check if a provider supports a specific AMD mode
 *
 * @param capabilities - The provider's capabilities object
 * @param mode - The AMD mode to check
 * @returns Whether the mode is supported
 */
export function supportsAMDMode(
  capabilities: ProviderCapabilities,
  mode: 'detect' | 'detect_beep' | 'async'
): boolean {
  return capabilities.supportsAMD && capabilities.amdModes.includes(mode);
}

/**
 * Check if a provider supports a specific recording format
 *
 * @param capabilities - The provider's capabilities object
 * @param format - The recording format to check
 * @returns Whether the format is supported
 */
export function supportsRecordingFormat(
  capabilities: ProviderCapabilities,
  format: string
): boolean {
  return capabilities.supportsRecording &&
         capabilities.recordingFormats.includes(format.toLowerCase());
}

/**
 * Check if a provider supports a specific streaming encoding
 *
 * @param capabilities - The provider's capabilities object
 * @param encoding - The encoding to check
 * @returns Whether the encoding is supported
 */
export function supportsStreamingEncoding(
  capabilities: ProviderCapabilities,
  encoding: 'g711_ulaw' | 'g711_alaw' | 'linear16' | 'opus'
): boolean {
  return capabilities.supportsAudioStreaming &&
         capabilities.streamingEncodings.includes(encoding);
}

/**
 * Check if a provider supports a specific sample rate
 *
 * @param capabilities - The provider's capabilities object
 * @param sampleRate - The sample rate to check
 * @returns Whether the sample rate is supported
 */
export function supportsSampleRate(
  capabilities: ProviderCapabilities,
  sampleRate: 8000 | 16000 | 24000 | 48000
): boolean {
  return capabilities.supportsAudioStreaming &&
         capabilities.streamingSampleRates.includes(sampleRate);
}

/**
 * Get a human-readable summary of provider capabilities
 *
 * @param capabilities - The provider's capabilities object
 * @returns A formatted string describing the capabilities
 */
export function describeCapabilities(capabilities: ProviderCapabilities): string {
  const parts: string[] = [];

  parts.push(`${capabilities.provider} v${capabilities.version}`);

  if (capabilities.supportsAMD) {
    parts.push(`AMD (${capabilities.amdModes.join(', ')})`);
  }

  if (capabilities.supportsRecording) {
    const auto = capabilities.automaticRecordingStorage ? 'auto' : 'manual';
    parts.push(`Recording (${auto}, ${capabilities.recordingFormats.join(', ')})`);
  }

  if (capabilities.supportsAudioStreaming) {
    const encodings = capabilities.streamingEncodings.join(', ');
    const rates = capabilities.streamingSampleRates.map(r => `${r}Hz`).join(', ');
    parts.push(`Streaming (${encodings}, ${rates})`);
  }

  if (capabilities.supportsWebhooks) {
    parts.push(`Webhooks (${capabilities.webhookEvents.length} events)`);
  }

  if (capabilities.maxConcurrentCalls > 0) {
    parts.push(`Max ${capabilities.maxConcurrentCalls} concurrent calls`);
  }

  if (capabilities.maxCallDurationSecs > 0) {
    parts.push(`Max ${capabilities.maxCallDurationSecs}s call duration`);
  }

  if (capabilities.limitations && capabilities.limitations.length > 0) {
    parts.push(`Limitations: ${capabilities.limitations.join('; ')}`);
  }

  return parts.join(' | ');
}

/**
 * Validate that required capabilities are present
 *
 * Useful for checking if a provider meets minimum requirements for a feature
 *
 * @param capabilities - The provider's capabilities object
 * @param required - Object with boolean requirements (e.g., { supportsAMD: true })
 * @returns Object with validation result and missing capabilities
 */
export function validateRequiredCapabilities(
  capabilities: ProviderCapabilities,
  required: Partial<Record<keyof ProviderCapabilities, boolean>>
): { valid: boolean; missing: string[] } {
  const missing: string[] = [];

  for (const [key, requiredValue] of Object.entries(required)) {
    const actualValue = (capabilities as unknown as Record<string, unknown>)[key];

    // For boolean requirements, check that the value is true
    if (requiredValue === true) {
      if (actualValue !== true) {
        missing.push(key);
      }
    }
  }

  return {
    valid: missing.length === 0,
    missing
  };
}
