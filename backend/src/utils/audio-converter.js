/**
 * Audio Format Converter
 *
 * Converts between different audio formats for telephony and AI processing.
 * Primary use case: Converting G.711 μ-law (8kHz) from Telnyx/SignalWire
 * to Linear16 PCM (16kHz) for Deepgram Voice Agent.
 *
 * @module utils/audio-converter
 */

/**
 * Audio format constants
 */
export const AudioFormats = {
  MULAW_8K: {
    encoding: 'mulaw',
    sampleRate: 8000,
    bitsPerSample: 8,
    description: 'G.711 μ-law at 8kHz (telephony standard)'
  },
  LINEAR16_16K: {
    encoding: 'linear16',
    sampleRate: 16000,
    bitsPerSample: 16,
    description: 'Linear16 PCM at 16kHz (Deepgram optimal format)'
  }
};

/**
 * μ-law decoding table (for fast conversion)
 * Generated from the G.711 μ-law specification
 */
const MULAW_DECODE_TABLE = [
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
 * Convert μ-law encoded audio to Linear16 PCM
 *
 * @param {Buffer} mulawBuffer - μ-law encoded audio (8-bit samples)
 * @returns {Buffer} Linear16 PCM audio (16-bit signed little-endian samples)
 */
export function mulawToLinear16(mulawBuffer) {
  if (!Buffer.isBuffer(mulawBuffer)) {
    throw new Error('Input must be a Buffer');
  }

  const linear16Buffer = Buffer.alloc(mulawBuffer.length * 2);

  for (let i = 0; i < mulawBuffer.length; i++) {
    // μ-law sample is 8-bit unsigned
    const mulawSample = mulawBuffer[i];

    // Decode to 16-bit signed PCM
    const pcmSample = MULAW_DECODE_TABLE[mulawSample];

    // Write as little-endian 16-bit signed integer
    linear16Buffer.writeInt16LE(pcmSample, i * 2);
  }

  return linear16Buffer;
}

/**
 * Convert Linear16 PCM to μ-law encoded audio
 *
 * @param {Buffer} linear16Buffer - Linear16 PCM audio (16-bit signed little-endian samples)
 * @returns {Buffer} μ-law encoded audio (8-bit samples)
 */
export function linear16ToMulaw(linear16Buffer) {
  if (!Buffer.isBuffer(linear16Buffer)) {
    throw new Error('Input must be a Buffer');
  }

  if (linear16Buffer.length % 2 !== 0) {
    throw new Error('Linear16 buffer length must be even');
  }

  const mulawBuffer = Buffer.alloc(linear16Buffer.length / 2);

  for (let i = 0; i < mulawBuffer.length; i++) {
    // Read 16-bit signed little-endian sample
    const pcmSample = linear16Buffer.readInt16LE(i * 2);

    // Convert to μ-law
    mulawBuffer[i] = pcmToMulaw(pcmSample);
  }

  return mulawBuffer;
}

/**
 * Convert a single PCM sample to μ-law
 *
 * @param {number} pcm - 16-bit signed PCM sample (-32768 to 32767)
 * @returns {number} μ-law encoded byte (0-255)
 */
function pcmToMulaw(pcm) {
  // This is a simplified μ-law encoder
  // For production use, consider using a more accurate implementation

  const sign = (pcm >> 8) & 0x80;
  if (sign !== 0) {
    pcm = -pcm;
  }
  if (pcm > 32635) {
    pcm = 32635;
  }

  // Add bias to ensure accurate decoding
  pcm += 0x84;

  let exponent = 7;
  let expMask;

  for (expMask = 0x4000; !(pcm & expMask) && exponent > 0; exponent--, expMask >>= 1) {}

  const mantissa = (pcm >> (exponent + 3)) & 0x0F;
  const mulawByte = ~((sign | (exponent << 4)) | mantissa);

  return mulawByte & 0xFF;
}

/**
 * Resample audio from one sample rate to another using linear interpolation
 *
 * @param {Buffer} audioBuffer - Input audio buffer (16-bit PCM)
 * @param {number} fromSampleRate - Source sample rate (e.g., 8000)
 * @param {number} toSampleRate - Target sample rate (e.g., 16000)
 * @returns {Buffer} Resampled audio buffer (16-bit PCM)
 */
export function resampleLinear16(audioBuffer, fromSampleRate, toSampleRate) {
  if (!Buffer.isBuffer(audioBuffer)) {
    throw new Error('Input must be a Buffer');
  }

  if (fromSampleRate === toSampleRate) {
    return audioBuffer;
  }

  // Calculate number of samples in output
  const inputSamples = audioBuffer.length / 2; // 16-bit = 2 bytes per sample
  const outputSamples = Math.floor(inputSamples * toSampleRate / fromSampleRate);
  const outputBuffer = Buffer.alloc(outputSamples * 2);

  const ratio = fromSampleRate / toSampleRate;

  for (let i = 0; i < outputSamples; i++) {
    // Calculate position in input buffer
    const position = i * ratio;
    const index = Math.floor(position);
    const fraction = position - index;

    // Get surrounding samples
    let sample1 = 0;
    let sample2 = 0;

    if (index < inputSamples) {
      sample1 = audioBuffer.readInt16LE(index * 2);
    }

    if (index + 1 < inputSamples) {
      sample2 = audioBuffer.readInt16LE((index + 1) * 2);
    }

    // Linear interpolation
    const interpolatedSample = sample1 + (sample2 - sample1) * fraction;

    // Clamp to 16-bit range
    const clampedSample = Math.max(-32768, Math.min(32767, Math.round(interpolatedSample)));

    // Write to output buffer
    outputBuffer.writeInt16LE(clampedSample, i * 2);
  }

  return outputBuffer;
}

/**
 * Convert telephony audio (mulaw @ 8kHz) to Deepgram format (Linear16 @ 16kHz)
 *
 * This is a convenience function that combines:
 * 1. μ-law to Linear16 conversion
 * 2. Sample rate conversion from 8kHz to 16kHz
 *
 * @param {Buffer} telephonyAudio - μ-law encoded audio at 8kHz
 * @returns {Buffer} Linear16 PCM audio at 16kHz
 */
export function telephonyToDeepgram(telephonyAudio) {
  if (!Buffer.isBuffer(telephonyAudio)) {
    throw new Error('Input must be a Buffer');
  }

  // Step 1: Convert μ-law to Linear16
  const linear16_8k = mulawToLinear16(telephonyAudio);

  // Step 2: Resample from 8kHz to 16kHz
  const linear16_16k = resampleLinear16(linear16_8k, 8000, 16000);

  return linear16_16k;
}

/**
 * Convert Deepgram audio (Linear16 @ 16kHz) to telephony format (mulaw @ 8kHz)
 *
 * This is a convenience function that combines:
 * 1. Sample rate conversion from 16kHz to 8kHz
 * 2. Linear16 to μ-law conversion
 *
 * @param {Buffer} deepgramAudio - Linear16 PCM audio at 16kHz
 * @returns {Buffer} μ-law encoded audio at 8kHz
 */
export function deepgramToTelephony(deepgramAudio) {
  if (!Buffer.isBuffer(deepgramAudio)) {
    throw new Error('Input must be a Buffer');
  }

  // Step 1: Resample from 16kHz to 8kHz
  const linear16_8k = resampleLinear16(deepgramAudio, 16000, 8000);

  // Step 2: Convert Linear16 to μ-law
  const mulaw_8k = linear16ToMulaw(linear16_8k);

  return mulaw_8k;
}

/**
 * Validate audio buffer format
 *
 * @param {Buffer} audioBuffer - Audio buffer to validate
 * @param {string} expectedEncoding - Expected encoding ('mulaw' or 'linear16')
 * @returns {Object} Validation result with isValid and error message
 */
export function validateAudioFormat(audioBuffer, expectedEncoding) {
  if (!Buffer.isBuffer(audioBuffer)) {
    return { isValid: false, error: 'Input must be a Buffer' };
  }

  if (audioBuffer.length === 0) {
    return { isValid: false, error: 'Audio buffer is empty' };
  }

  if (expectedEncoding === 'linear16') {
    if (audioBuffer.length % 2 !== 0) {
      return { isValid: false, error: 'Linear16 buffer must have even length' };
    }
  }

  return { isValid: true, error: null };
}

/**
 * Get audio format information
 *
 * @param {Buffer} audioBuffer - Audio buffer
 * @param {string} encoding - Audio encoding ('mulaw' or 'linear16')
 * @param {number} sampleRate - Sample rate in Hz
 * @returns {Object} Audio format information
 */
export function getAudioFormatInfo(audioBuffer, encoding, sampleRate) {
  const bytesPerSample = encoding === 'linear16' ? 2 : 1;
  const samples = audioBuffer.length / bytesPerSample;
  const durationMs = (samples / sampleRate) * 1000;

  return {
    encoding,
    sampleRate,
    bytesPerSample,
    samples,
    durationMs,
    durationSeconds: durationMs / 1000,
    sizeBytes: audioBuffer.length
  };
}
