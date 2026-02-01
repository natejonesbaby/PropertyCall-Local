/**
 * Feature #241 Test: Provider capability detection exposes feature flags
 *
 * This test verifies all 5 steps of the feature:
 * 1. Define ProviderCapabilities interface
 * 2. Include flags for AMD, recording, streaming, etc.
 * 3. Implement capabilities for Telnyx provider
 * 4. Implement capabilities for SignalWire provider
 * 5. Use capabilities to conditionally enable features in UI
 */

import {
  getProviderCapabilities,
  getSelectedProviderCapabilities,
  TELNYX_CAPABILITIES,
  SIGNALWIRE_CAPABILITIES,
  createProviderInstance
} from './src/providers/provider-factory.js';

import {
  checkCapability,
  supportsAMDMode,
  supportsRecordingFormat,
  supportsStreamingEncoding,
  supportsSampleRate,
  describeCapabilities,
  validateRequiredCapabilities
} from './src/providers/provider-capabilities.model.js';

// ANSI color codes for console output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`${GREEN}✓ PASS${RESET} - ${name}`);
    testsPassed++;
  } catch (error) {
    console.error(`${RED}✗ FAIL${RESET} - ${name}`);
    console.error(`  ${error.message}`);
    testsFailed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

console.log('='.repeat(60));
console.log('Feature #241: Provider capability detection exposes feature flags');
console.log('='.repeat(60));
console.log();

// ============================================================================
// STEP 1: Define ProviderCapabilities interface
// ============================================================================

console.log('Step 1: Define ProviderCapabilities interface');
console.log('-'.repeat(60));

test('1.1: ProviderCapabilities interface is exported', () => {
  const TelnyxCaps = getProviderCapabilities('telnyx');
  assert(TelnyxCaps !== undefined, 'Capabilities object should exist');
});

test('1.2: Capabilities have required structure', () => {
  const caps = getProviderCapabilities('telnyx');
  assert(typeof caps.provider === 'string', 'Should have provider name');
  assert(typeof caps.version === 'string', 'Should have version');
  assert(typeof caps.supportsAMD === 'boolean', 'Should have supportsAMD flag');
  assert(typeof caps.supportsRecording === 'boolean', 'Should have supportsRecording flag');
  assert(typeof caps.supportsAudioStreaming === 'boolean', 'Should have supportsAudioStreaming flag');
  assert(typeof caps.supportsWebhooks === 'boolean', 'Should have supportsWebhooks flag');
});

// ============================================================================
// STEP 2: Include flags for AMD, recording, streaming, etc.
// ============================================================================

console.log();
console.log('Step 2: Include flags for AMD, recording, streaming, etc.');
console.log('-'.repeat(60));

test('2.1: AMD flags are present', () => {
  const telnyx = getProviderCapabilities('telnyx');
  assert(telnyx.supportsAMD === true, 'Telnyx should support AMD');
  assert(Array.isArray(telnyx.amdModes), 'Should have amdModes array');
  assert(telnyx.amdModes.length > 0, 'Should have at least one AMD mode');
});

test('2.2: Recording flags are present', () => {
  const telnyx = getProviderCapabilities('telnyx');
  assert(telnyx.supportsRecording === true, 'Telnyx should support recording');
  assert(Array.isArray(telnyx.recordingFormats), 'Should have recordingFormats array');
  assert(telnyx.recordingFormats.length > 0, 'Should have at least one recording format');
  assert(typeof telnyx.automaticRecordingStorage === 'boolean', 'Should have automaticRecordingStorage flag');
});

test('2.3: Audio streaming flags are present', () => {
  const telnyx = getProviderCapabilities('telnyx');
  assert(telnyx.supportsAudioStreaming === true, 'Telnyx should support audio streaming');
  assert(Array.isArray(telnyx.streamingEncodings), 'Should have streamingEncodings array');
  assert(Array.isArray(telnyx.streamingSampleRates), 'Should have streamingSampleRates array');
  assert(typeof telnyx.supportsDualDirectionStreaming === 'boolean', 'Should have supportsDualDirectionStreaming flag');
});

test('2.4: Webhook flags are present', () => {
  const telnyx = getProviderCapabilities('telnyx');
  assert(telnyx.supportsWebhooks === true, 'Telnyx should support webhooks');
  assert(Array.isArray(telnyx.webhookEvents), 'Should have webhookEvents array');
  assert(telnyx.webhookEvents.length > 0, 'Should have at least one webhook event');
});

test('2.5: API capability flags are present', () => {
  const telnyx = getProviderCapabilities('telnyx');
  assert(typeof telnyx.supportsCallDetailApi === 'boolean', 'Should have supportsCallDetailApi flag');
  assert(typeof telnyx.supportsCallControlApi === 'boolean', 'Should have supportsCallControlApi flag');
  assert(typeof telnyx.supportsHealthCheck === 'boolean', 'Should have supportsHealthCheck flag');
});

test('2.6: Limit flags are present', () => {
  const telnyx = getProviderCapabilities('telnyx');
  assert(typeof telnyx.maxConcurrentCalls === 'number', 'Should have maxConcurrentCalls number');
  assert(typeof telnyx.maxCallDurationSecs === 'number', 'Should have maxCallDurationSecs number');
});

// ============================================================================
// STEP 3: Implement capabilities for Telnyx provider
// ============================================================================

console.log();
console.log('Step 3: Implement capabilities for Telnyx provider');
console.log('-'.repeat(60));

test('3.1: Telnyx has full AMD support', () => {
  const telnyx = getProviderCapabilities('telnyx');
  assert(telnyx.provider === 'telnyx', 'Provider name should be telnyx');
  assert(telnyx.supportsAMD === true, 'Telnyx should support AMD');
  assert(telnyx.amdModes.includes('detect'), 'Should support detect mode');
  assert(telnyx.amdModes.includes('detect_beep'), 'Should support detect_beep mode');
  assert(telnyx.amdModes.includes('async'), 'Should support async mode');
});

test('3.2: Telnyx supports multiple recording formats', () => {
  const telnyx = getProviderCapabilities('telnyx');
  assert(telnyx.supportsRecording === true, 'Telnyx should support recording');
  assert(telnyx.recordingFormats.includes('mp3'), 'Should support MP3');
  assert(telnyx.recordingFormats.includes('wav'), 'Should support WAV');
  assert(telnyx.automaticRecordingStorage === true, 'Should have automatic recording storage');
});

test('3.3: Telnyx supports multiple audio streaming formats', () => {
  const telnyx = getProviderCapabilities('telnyx');
  assert(telnyx.supportsAudioStreaming === true, 'Telnyx should support audio streaming');
  assert(telnyx.streamingEncodings.includes('g711_ulaw'), 'Should support G.711 ulaw');
  assert(telnyx.streamingEncodings.includes('g711_alaw'), 'Should support G.711 alaw');
  assert(telnyx.streamingEncodings.includes('linear16'), 'Should support Linear16');
});

test('3.4: Telnyx supports multiple sample rates', () => {
  const telnyx = getProviderCapabilities('telnyx');
  assert(telnyx.streamingSampleRates.includes(8000), 'Should support 8kHz');
  assert(telnyx.streamingSampleRates.includes(16000), 'Should support 16kHz');
  assert(telnyx.streamingSampleRates.includes(24000), 'Should support 24kHz');
  assert(telnyx.streamingSampleRates.includes(48000), 'Should support 48kHz');
});

test('3.5: Telnyx supports comprehensive webhooks', () => {
  const telnyx = getProviderCapabilities('telnyx');
  assert(telnyx.webhookEvents.includes('call.initiated'), 'Should have call.initiated');
  assert(telnyx.webhookEvents.includes('call.answered'), 'Should have call.answered');
  assert(telnyx.webhookEvents.includes('call.hangup'), 'Should have call.hangup');
  assert(telnyx.webhookEvents.includes('call.recording.saved'), 'Should have call.recording.saved');
  assert(telnyx.webhookEvents.includes('call.machine.detection.ended'), 'Should have AMD event');
});

test('3.6: Telnyx has unlimited limits', () => {
  const telnyx = getProviderCapabilities('telnyx');
  assertEquals(telnyx.maxConcurrentCalls, 0, 'Should have unlimited concurrent calls (0)');
  assertEquals(telnyx.maxCallDurationSecs, 0, 'Should have unlimited call duration (0)');
});

test('3.7: Telnyx has no limitations', () => {
  const telnyx = getProviderCapabilities('telnyx');
  assert(Array.isArray(telnyx.limitations), 'Should have limitations array');
  assertEquals(telnyx.limitations.length, 0, 'Telnyx should have no limitations');
});

// ============================================================================
// STEP 4: Implement capabilities for SignalWire provider
// ============================================================================

console.log();
console.log('Step 4: Implement capabilities for SignalWire provider');
console.log('-'.repeat(60));

test('4.1: SignalWire has AMD support (limited)', () => {
  const signalwire = getProviderCapabilities('signalwire');
  assert(signalwire.provider === 'signalwire', 'Provider name should be signalwire');
  assert(signalwire.supportsAMD === true, 'SignalWire should support AMD');
  assert(signalwire.amdModes.includes('detect'), 'Should support detect mode');
  assert(signalwire.amdModes.includes('detect_beep'), 'Should support detect_beep mode');
  assert(!signalwire.amdModes.includes('async'), 'Should NOT support async mode');
});

test('4.2: SignalWire supports limited recording formats', () => {
  const signalwire = getProviderCapabilities('signalwire');
  assert(signalwire.supportsRecording === true, 'SignalWire should support recording');
  assert(signalwire.recordingFormats.includes('wav'), 'Should support WAV');
  assert(!signalwire.recordingFormats.includes('mp3'), 'Should NOT support MP3');
  assert(signalwire.automaticRecordingStorage === true, 'Should have automatic recording storage');
});

test('4.3: SignalWire supports audio streaming', () => {
  const signalwire = getProviderCapabilities('signalwire');
  assert(signalwire.supportsAudioStreaming === true, 'SignalWire should support audio streaming');
  assert(signalwire.streamingEncodings.includes('g711_ulaw'), 'Should support G.711 ulaw');
  assert(signalwire.streamingEncodings.includes('linear16'), 'Should support Linear16');
});

test('4.4: SignalWire supports limited sample rates', () => {
  const signalwire = getProviderCapabilities('signalwire');
  assert(signalwire.streamingSampleRates.includes(8000), 'Should support 8kHz');
  assert(signalwire.streamingSampleRates.includes(16000), 'Should support 16kHz');
  assert(!signalwire.streamingSampleRates.includes(24000), 'Should NOT support 24kHz');
  assert(!signalwire.streamingSampleRates.includes(48000), 'Should NOT support 48kHz');
});

test('4.5: SignalWire has call duration limit', () => {
  const signalwire = getProviderCapabilities('signalwire');
  assertEquals(signalwire.maxConcurrentCalls, 0, 'Should have unlimited concurrent calls (0)');
  assertEquals(signalwire.maxCallDurationSecs, 14400, 'Should have 4 hour limit (14400s)');
});

test('4.6: SignalWire has documented limitations', () => {
  const signalwire = getProviderCapabilities('signalwire');
  assert(Array.isArray(signalwire.limitations), 'Should have limitations array');
  assert(signalwire.limitations.length > 0, 'SignalWire should have limitations');
  assert(signalwire.limitations.some(l => l.includes('async AMD')), 'Should mention async AMD limitation');
  assert(signalwire.limitations.some(l => l.includes('4 hours')), 'Should mention duration limit');
  assert(signalwire.limitations.some(l => l.includes('WAV')), 'Should mention recording format limitation');
});

// ============================================================================
// STEP 5: Use capabilities to conditionally enable features in UI
// ============================================================================

console.log();
console.log('Step 5: Use capabilities to conditionally enable features');
console.log('-'.repeat(60));

test('5.1: checkCapability returns correct result for AMD', () => {
  const telnyx = getProviderCapabilities('telnyx');
  const result = checkCapability(telnyx, 'supportsAMD');
  assert(result.supported === true, 'Telnyx should support AMD');
  assertEquals(result.capability, 'supportsAMD');
  assert(result.reason === undefined, 'Should not have reason when supported');
});

test('5.2: checkCapability returns reason for unsupported feature', () => {
  const signalwire = getProviderCapabilities('signalwire');
  const result = checkCapability(signalwire, 'supportsAsync');
  assert(result.supported === false, 'SignalWire should not support async AMD');
  assertEquals(result.capability, 'supportsAsync');
  assert(result.reason !== undefined, 'Should have reason explaining why not supported');
});

test('5.3: supportsAMDMode checks specific AMD mode', () => {
  const telnyx = getProviderCapabilities('telnyx');
  assert(supportsAMDMode(telnyx, 'detect') === true, 'Telnyx should support detect mode');
  assert(supportsAMDMode(telnyx, 'async') === true, 'Telnyx should support async mode');

  const signalwire = getProviderCapabilities('signalwire');
  assert(supportsAMDMode(signalwire, 'detect') === true, 'SignalWire should support detect mode');
  assert(supportsAMDMode(signalwire, 'async') === false, 'SignalWire should NOT support async mode');
});

test('5.4: supportsRecordingFormat checks specific format', () => {
  const telnyx = getProviderCapabilities('telnyx');
  assert(supportsRecordingFormat(telnyx, 'mp3') === true, 'Telnyx should support MP3');
  assert(supportsRecordingFormat(telnyx, 'wav') === true, 'Telnyx should support WAV');

  const signalwire = getProviderCapabilities('signalwire');
  assert(supportsRecordingFormat(signalwire, 'wav') === true, 'SignalWire should support WAV');
  assert(supportsRecordingFormat(signalwire, 'mp3') === false, 'SignalWire should NOT support MP3');
});

test('5.5: supportsStreamingEncoding checks specific encoding', () => {
  const telnyx = getProviderCapabilities('telnyx');
  assert(supportsStreamingEncoding(telnyx, 'g711_ulaw') === true, 'Telnyx should support G.711 ulaw');
  assert(supportsStreamingEncoding(telnyx, 'linear16') === true, 'Telnyx should support Linear16');
  assert(supportsStreamingEncoding(telnyx, 'opus') === false, 'Telnyx should NOT support Opus');
});

test('5.6: supportsSampleRate checks specific sample rate', () => {
  const telnyx = getProviderCapabilities('telnyx');
  assert(supportsSampleRate(telnyx, 8000) === true, 'Telnyx should support 8kHz');
  assert(supportsSampleRate(telnyx, 48000) === true, 'Telnyx should support 48kHz');

  const signalwire = getProviderCapabilities('signalwire');
  assert(supportsSampleRate(signalwire, 8000) === true, 'SignalWire should support 8kHz');
  assert(supportsSampleRate(signalwire, 48000) === false, 'SignalWire should NOT support 48kHz');
});

test('5.7: describeCapabilities returns human-readable summary', () => {
  const telnyx = getProviderCapabilities('telnyx');
  const description = describeCapabilities(telnyx);
  assert(typeof description === 'string', 'Description should be a string');
  assert(description.includes('telnyx'), 'Should include provider name');
  assert(description.includes('AMD'), 'Should mention AMD');
  assert(description.includes('Recording'), 'Should mention Recording');
  assert(description.includes('Streaming'), 'Should mention Streaming');
});

test('5.8: validateRequiredCapabilities checks requirements', () => {
  const telnyx = getProviderCapabilities('telnyx');
  const result1 = validateRequiredCapabilities(telnyx, {
    supportsAMD: true,
    supportsAudioStreaming: true
  });
  assert(result1.valid === true, 'Telnyx should meet all requirements');
  assertEquals(result1.missing.length, 0, 'Should have no missing capabilities');

  const signalwire = getProviderCapabilities('signalwire');
  const result2 = validateRequiredCapabilities(signalwire, {
    supportsAMD: true,
    supportsRecording: true
  });
  assert(result2.valid === true, 'SignalWire should meet requirements');
  assertEquals(result2.missing.length, 0, 'Should have no missing capabilities');

  const result3 = validateRequiredCapabilities(signalwire, {
    supportsAMD: true,
    supportsOpus: true  // Not supported
  });
  assert(result3.valid === false, 'Should fail when requirements not met');
  assert(result3.missing.length > 0, 'Should have missing capabilities');
});

test('5.9: getProviderCapabilities works for both providers', () => {
  const telnyx = getProviderCapabilities('telnyx');
  assert(telnyx.provider === 'telnyx', 'Should get Telnyx capabilities');

  const signalwire = getProviderCapabilities('signalwire');
  assert(signalwire.provider === 'signalwire', 'Should get SignalWire capabilities');
});

test('5.10: Provider instances have getCapabilities method', () => {
  const telnyxProvider = createProviderInstance('telnyx');
  assert(typeof telnyxProvider.getCapabilities === 'function', 'Telnyx provider should have getCapabilities method');
  const telnyxCaps = telnyxProvider.getCapabilities();
  assert(telnyxCaps.supportsAMD === true, 'Telnyx capabilities should indicate AMD support');

  const signalwireProvider = createProviderInstance('signalwire');
  assert(typeof signalwireProvider.getCapabilities === 'function', 'SignalWire provider should have getCapabilities method');
  const signalwireCaps = signalwireProvider.getCapabilities();
  assert(signalwireCaps.supportsAMD === true, 'SignalWire capabilities should indicate AMD support');
});

// ============================================================================
// Additional utility tests
// ============================================================================

console.log();
console.log('Additional utility tests');
console.log('-'.repeat(60));

test('Utility: getProviderCapabilities throws for unknown provider', () => {
  let threw = false;
  try {
    getProviderCapabilities('unknown_provider');
  } catch (error) {
    threw = true;
    assert(error.message.includes('Unknown provider'), 'Should indicate unknown provider error');
  }
  assert(threw, 'Should have thrown error for unknown provider');
});

test('Utility: Capability check returns details for array capabilities', () => {
  const telnyx = getProviderCapabilities('telnyx');
  const result = checkCapability(telnyx, 'amdModes');
  assert(result.supported === true, 'Should be supported');
  assert(Array.isArray(result.details), 'Should return array of modes');
  assert(result.details.length > 0, 'Should have at least one mode');
});

test('Utility: describeCapabilities works for SignalWire', () => {
  const signalwire = getProviderCapabilities('signalwire');
  const description = describeCapabilities(signalwire);
  assert(description.includes('signalwire'), 'Should include provider name');
  assert(description.includes('Limitations'), 'Should mention limitations');
});

// ============================================================================
// Summary
// ============================================================================

console.log();
console.log('='.repeat(60));
console.log('Test Summary');
console.log('='.repeat(60));
console.log(`Total Tests: ${testsPassed + testsFailed}`);
console.log(`${GREEN}Passed: ${testsPassed}${RESET}`);
console.log(`${RED}Failed: ${testsFailed}${RESET}`);
console.log();

if (testsFailed === 0) {
  console.log(`${GREEN}✓ All tests passed!${RESET}`);
  console.log();
  console.log('Feature #241 is complete:');
  console.log('  1. ✓ ProviderCapabilities interface defined');
  console.log('  2. ✓ Flags included for AMD, recording, streaming, etc.');
  console.log('  3. ✓ Capabilities implemented for Telnyx provider');
  console.log('  4. ✓ Capabilities implemented for SignalWire provider');
  console.log('  5. ✓ Capabilities used to conditionally enable features');
} else {
  console.log(`${RED}✗ Some tests failed${RESET}`);
  process.exit(1);
}
