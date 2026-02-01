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
 * Check if a provider supports a specific capability
 *
 * @param capabilities - The provider's capabilities object
 * @param capability - The capability name to check (camelCase)
 * @returns Result indicating if the capability is supported
 */
export function checkCapability(capabilities, capability) {
  const value = capabilities[capability];

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
    const arr = value;
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
    const num = value;
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
export function supportsAMDMode(capabilities, mode) {
  return capabilities.supportsAMD && capabilities.amdModes.includes(mode);
}

/**
 * Check if a provider supports a specific recording format
 *
 * @param capabilities - The provider's capabilities object
 * @param format - The recording format to check
 * @returns Whether the format is supported
 */
export function supportsRecordingFormat(capabilities, format) {
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
export function supportsStreamingEncoding(capabilities, encoding) {
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
export function supportsSampleRate(capabilities, sampleRate) {
  return capabilities.supportsAudioStreaming &&
         capabilities.streamingSampleRates.includes(sampleRate);
}

/**
 * Get a human-readable summary of provider capabilities
 *
 * @param capabilities - The provider's capabilities object
 * @returns A formatted string describing the capabilities
 */
export function describeCapabilities(capabilities) {
  const parts = [];

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
export function validateRequiredCapabilities(capabilities, required) {
  const missing = [];

  for (const [key, requiredValue] of Object.entries(required)) {
    const actualValue = capabilities[key];

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
