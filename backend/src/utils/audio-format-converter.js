/**
 * Audio Format Converter
 *
 * Converts between different audio formats and sample rates for telephony providers
 * and AI voice agents. Handles:
 * - Mu-law (G.711) to Linear16 PCM conversion
 * - Linear16 PCM to Mu-law conversion
 * - Sample rate conversion (8kHz to 16kHz and vice versa)
 *
 * @module utils/audio-format-converter
 */

/**
 * Audio format specifications
 */
export const AudioFormats = {
  MULAW_8KHZ: {
    encoding: 'mulaw',
    sampleRate: 8000,
    channels: 1,
    bytesPerSample: 1,
    codec: 'audio/x-mulaw'
  },
  LINEAR16_8KHZ: {
    encoding: 'linear16',
    sampleRate: 8000,
    channels: 1,
    bytesPerSample: 2,
    codec: 'audio/L16;rate=8000'
  },
  LINEAR16_16KHZ: {
    encoding: 'linear16',
    sampleRate: 16000,
    channels: 1,
    bytesPerSample: 2,
    codec: 'audio/L16;rate=16000'
  }
};

/**
 * Mu-law to Linear16 conversion table
 * Pre-computed for performance optimization
 */
const MULAW_TO_LINEAR = [
  -32124, -31100, -30076, -29052, -28028, -27004, -25980, -24956,
  -23932, -22908, -21884, -20860, -19836, -18812, -17788, -16764,
  -15996, -15484, -14972, -14460, -13948, -13436, -12924, -12412,
  -11900, -11388, -10876, -10364, -9852, -9340, -8828, -8316,
  -7932, -7676, -7420, -7164, -6908, -6652, -6396, -6140,
  -5884, -5628, -5372, -5116, -4860, -4604, -4348, -4092,
  -3900, -3772, -3644, -3516, -3388, -3260, -3132, -3004,
  -2876, -2748, -2620, -2492, -2364, -2236, -2108, -1980,
  -1884, -1820, -1756, -1692, -1628, -1564, -1500, -1436,
  -1372, -1308, -1244, -1180, -1116, -1052, -988, -924,
  -876, -844, -812, -780, -748, -716, -684, -652,
  -620, -588, -556, -524, -492, -460, -428, -396,
  -372, -356, -340, -324, -308, -292, -276, -260,
  -244, -228, -212, -196, -180, -164, -148, -132,
  -120, -112, -104, -96, -88, -80, -72, -64,
  -56, -48, -40, -32, -24, -16, -8, 0,
  32124, 31100, 30076, 29052, 28028, 27004, 25980, 24956,
  23932, 22908, 21884, 20860, 19836, 18812, 17788, 16764,
  15996, 15484, 14972, 14460, 13948, 13436, 12924, 12412,
  11900, 11388, 10876, 10364, 9852, 9340, 8828, 8316,
  7932, 7676, 7420, 7164, 6908, 6652, 6396, 6140,
  5884, 5628, 5372, 5116, 4860, 4604, 4348, 4092,
  3900, 3772, 3644, 3516, 3388, 3260, 3132, 3004,
  2876, 2748, 2620, 2492, 2364, 2236, 2108, 1980,
  1884, 1820, 1756, 1692, 1628, 1564, 1500, 1436,
  1372, 1308, 1244, 1180, 1116, 1052, 988, 924,
  876, 844, 812, 780, 748, 716, 684, 652,
  620, 588, 556, 524, 492, 460, 428, 396,
  372, 356, 340, 324, 308, 292, 276, 260,
  244, 228, 212, 196, 180, 164, 148, 132,
  120, 112, 104, 96, 88, 80, 72, 64,
  56, 48, 40, 32, 24, 16, 8, 0
];

/**
 * Linear16 to Mu-law conversion table
 */
const LINEAR_TO_MULAW = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
  2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
  2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
  2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
  3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3,
  3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3,
  3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3,
  3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3,
  4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4,
  4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4,
  4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4,
  4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4,
  5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
  5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
  5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
  5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
  6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
  6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
  6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
  6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
  7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
  7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
  7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
  7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7
];

/**
 * Convert Mu-law audio buffer to Linear16 PCM
 * @param {Buffer} mulawBuffer - Input buffer containing mu-law encoded audio
 * @returns {Buffer} Linear16 PCM buffer (16-bit signed samples)
 */
export function mulawToLinear16(mulawBuffer) {
  const linear16Buffer = Buffer.alloc(mulawBuffer.length * 2);

  for (let i = 0; i < mulawBuffer.length; i++) {
    // Flip bits for standard mu-law
    const mulawByte = mulawBuffer[i] ^ 0xff;
    const sample = MULAW_TO_LINEAR[mulawByte];
    linear16Buffer.writeInt16LE(sample, i * 2);
  }

  return linear16Buffer;
}

/**
 * Convert Linear16 PCM to Mu-law
 * @param {Buffer} linear16Buffer - Input buffer containing Linear16 PCM audio
 * @returns {Buffer} Mu-law encoded buffer
 */
export function linear16ToMulaw(linear16Buffer) {
  const mulawBuffer = Buffer.alloc(linear16Buffer.length / 2);

  for (let i = 0; i < mulawBuffer.length; i++) {
    const sample = linear16Buffer.readInt16LE(i * 2);

    // Convert to 14-bit signed integer
    let sign = (sample >> 8) & 0x80;
    let absSample = sign !== 0 ? -sample : sample;
    if (absSample > 32635) absSample = 32635;

    // Find exponent
    let exponent = 7;
    for (let i = 0; i < 7; i++) {
      if (!(absSample & 0x4000)) {
        exponent--;
        absSample <<= 1;
      } else {
        break;
      }
    }

    // Extract mantissa
    const mantissa = (absSample >> (exponent + 3)) & 0x0f;

    // Combine sign, exponent, and mantissa
    const mulawByte = ~(sign | ((exponent << 4) & 0x70) | mantissa);

    mulawBuffer[i] = mulawByte;
  }

  return mulawBuffer;
}

/**
 * Upsample audio from 8kHz to 16kHz using linear interpolation
 * This doubles the number of samples by interpolating between adjacent samples
 * @param {Buffer} inputBuffer - Input buffer at 8kHz (Linear16)
 * @returns {Buffer} Output buffer at 16kHz (Linear16)
 */
export function upsample8kHzTo16kHz(inputBuffer) {
  // Handle empty buffer
  if (inputBuffer.length === 0) {
    return Buffer.alloc(0);
  }

  // Input is Linear16 (2 bytes per sample)
  const numSamples = inputBuffer.length / 2;

  // Handle single sample case
  if (numSamples === 1) {
    const sample = inputBuffer.readInt16LE(0);
    const outputBuffer = Buffer.alloc(4); // 2 samples
    outputBuffer.writeInt16LE(sample, 0);
    outputBuffer.writeInt16LE(sample, 2);
    return outputBuffer;
  }

  const outputBuffer = Buffer.alloc(numSamples * 4); // Double the samples, 2 bytes each

  for (let i = 0; i < numSamples - 1; i++) {
    const sample1 = inputBuffer.readInt16LE(i * 2);
    const sample2 = inputBuffer.readInt16LE((i + 1) * 2);

    // Write first sample
    outputBuffer.writeInt16LE(sample1, i * 4);

    // Interpolate and write second sample (average of adjacent samples)
    const interpolated = Math.round((sample1 + sample2) / 2);
    outputBuffer.writeInt16LE(interpolated, i * 4 + 2);
  }

  // Handle last sample - just duplicate it
  const lastSample = inputBuffer.readInt16LE((numSamples - 1) * 2);
  outputBuffer.writeInt16LE(lastSample, (numSamples - 1) * 4);
  outputBuffer.writeInt16LE(lastSample, (numSamples - 1) * 4 + 2);

  return outputBuffer;
}

/**
 * Downsample audio from 16kHz to 8kHz using decimation
 * This halves the number of samples by taking every other sample
 * @param {Buffer} inputBuffer - Input buffer at 16kHz (Linear16)
 * @returns {Buffer} Output buffer at 8kHz (Linear16)
 */
export function downsample16kHzTo8kHz(inputBuffer) {
  // Handle empty buffer
  if (inputBuffer.length === 0) {
    return Buffer.alloc(0);
  }

  // Input is Linear16 (2 bytes per sample)
  const numSamples = inputBuffer.length / 2;
  const outputSamples = Math.floor(numSamples / 2);
  const outputBuffer = Buffer.alloc(outputSamples * 2); // Half the samples, 2 bytes each

  for (let i = 0; i < outputSamples; i++) {
    // Take every other sample
    const sample = inputBuffer.readInt16LE(i * 4);
    outputBuffer.writeInt16LE(sample, i * 2);
  }

  return outputBuffer;
}

/**
 * Convert provider audio (mulaw 8kHz) to Deepgram format (Linear16 16kHz)
 * This is a complete conversion: format + sample rate
 * @param {Buffer} providerAudio - Audio from provider (mulaw, 8kHz)
 * @returns {Buffer} Audio in Deepgram format (Linear16, 16kHz)
 */
export function convertProviderAudioToDeepgram(providerAudio) {
  // Step 1: Convert mu-law to Linear16 (still 8kHz)
  const linear16_8kHz = mulawToLinear16(providerAudio);

  // Step 2: Upsample from 8kHz to 16kHz
  const linear16_16kHz = upsample8kHzTo16kHz(linear16_8kHz);

  return linear16_16kHz;
}

/**
 * Convert Deepgram audio (Linear16 16kHz) to provider format (mulaw 8kHz)
 * This is a complete conversion: format + sample rate
 * @param {Buffer} deepgramAudio - Audio from Deepgram (Linear16, 16kHz)
 * @returns {Buffer} Audio in provider format (mulaw, 8kHz)
 */
export function convertDeepgramAudioToProvider(deepgramAudio) {
  // Step 1: Downsample from 16kHz to 8kHz (still Linear16)
  const linear16_8kHz = downsample16kHzTo8kHz(deepgramAudio);

  // Step 2: Convert Linear16 to mu-law
  const mulaw_8kHz = linear16ToMulaw(linear16_8kHz);

  return mulaw_8kHz;
}

/**
 * Detect audio format from buffer metadata
 * @param {Object} metadata - Audio metadata
 * @returns {Object} Detected audio format specification
 */
export function detectAudioFormat(metadata = {}) {
  // Default to provider format (mulaw 8kHz)
  return {
    encoding: metadata.encoding || 'mulaw',
    sampleRate: metadata.sampleRate || 8000,
    channels: metadata.channels || 1
  };
}

/**
 * Validate if audio buffer matches expected format
 * @param {Buffer} audioBuffer - Audio buffer to validate
 * @param {Object} expectedFormat - Expected format specification
 * @returns {boolean} True if format is valid
 */
export function validateAudioFormat(audioBuffer, expectedFormat) {
  const bytesPerSample = expectedFormat.encoding === 'linear16' ? 2 : 1;
  const expectedSamples = audioBuffer.length / bytesPerSample;

  // Check if buffer size is reasonable for the format
  return expectedSamples > 0 && Number.isInteger(expectedSamples);
}

/**
 * Get audio format information for debugging
 * @param {Buffer} audioBuffer - Audio buffer
 * @param {Object} format - Format specification
 * @returns {Object} Format information
 */
export function getAudioFormatInfo(audioBuffer, format) {
  const bytesPerSample = format.encoding === 'linear16' ? 2 : 1;
  const numSamples = audioBuffer.length / bytesPerSample;
  const duration = numSamples / format.sampleRate;

  return {
    bufferSize: audioBuffer.length,
    encoding: format.encoding,
    sampleRate: format.sampleRate,
    channels: format.channels || 1,
    bytesPerSample,
    numSamples,
    durationMs: duration * 1000,
    codec: format.encoding === 'mulaw' ? 'audio/x-mulaw' : `audio/L16;rate=${format.sampleRate}`
  };
}

export default {
  mulawToLinear16,
  linear16ToMulaw,
  upsample8kHzTo16kHz,
  downsample16kHzTo8kHz,
  convertProviderAudioToDeepgram,
  convertDeepgramAudioToProvider,
  detectAudioFormat,
  validateAudioFormat,
  getAudioFormatInfo,
  AudioFormats
};
