/**
 * Audio Adapter Factory
 *
 * Factory for creating audio adapter instances based on the telephony provider.
 *
 * @module providers/audio-adapter-factory
 */

import TelnyxAudioAdapter from './telnyx-audio-adapter.js';
import SignalWireAudioAdapter from './signalwire-audio-adapter.js';

/**
 * Create an audio adapter for the specified provider
 *
 * @param {string} provider - The provider name ('telnyx' or 'signalwire')
 * @param {Object} options - Configuration options for the adapter
 * @returns {AudioAdapter} The created audio adapter instance
 * @throws {Error} If provider is not supported
 */
export function createAudioAdapter(provider, options = {}) {
  switch (provider.toLowerCase()) {
    case 'telnyx':
      return new TelnyxAudioAdapter(options);

    case 'signalwire':
      return new SignalWireAudioAdapter(options);

    default:
      throw new Error(`Unsupported audio adapter provider: ${provider}`);
  }
}

/**
 * Get list of supported audio adapter providers
 *
 * @returns {string[]} Array of supported provider names
 */
export function getSupportedAudioAdapters() {
  return ['telnyx', 'signalwire'];
}

/**
 * Check if a provider is supported for audio adapter
 *
 * @param {string} provider - The provider name to check
 * @returns {boolean} true if provider is supported
 */
export function isAudioAdapterSupported(provider) {
  return getSupportedAudioAdapters().includes(provider.toLowerCase());
}

export default {
  createAudioAdapter,
  getSupportedAudioAdapters,
  isAudioAdapterSupported
};
