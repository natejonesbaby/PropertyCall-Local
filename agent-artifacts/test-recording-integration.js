/**
 * Integration test: Verify Recording model works with existing codebase
 *
 * This test ensures that:
 * 1. The Recording model can be imported successfully
 * 2. It doesn't break existing recording URL handling
 * 3. Backward compatibility is maintained
 */

import assert from 'node:assert';
import { Recording, RecordingUrlManager } from './backend/src/providers/recording.model.js';

console.log('🔗 Testing Recording model integration with existing code\n');

// Test 1: Import works
console.log('Test 1: Recording model imports successfully');
try {
  console.log('  Recording:', typeof Recording);
  console.log('  RecordingUrlManager:', typeof RecordingUrlManager);
  console.log('  ✅ Imports work\n');
} catch (error) {
  console.error('  ❌ Import failed:', error);
  process.exit(1);
}

// Test 2: Backward compatibility with existing recording URLs
console.log('Test 2: Backward compatibility with legacy recording URLs');
const legacyTelnyxUrl = 'https://cdn.telnyx.com/recordings/abc123.mp3';
const recording = Recording.fromLegacyUrl(legacyTelnyxUrl, 'telnyx');

console.log('  Legacy URL:', legacyTelnyxUrl);
console.log('  Recording.url:', recording.url);
console.log('  Recording.provider:', recording.provider);
console.log('  Recording.format:', recording.format);
assert.strictEqual(recording.url, legacyTelnyxUrl);
assert.strictEqual(recording.provider, 'telnyx');
assert.strictEqual(recording.format, 'mp3');
console.log('  ✅ Legacy URL conversion works\n');

// Test 3: RecordingUrlManager handles database values
console.log('Test 3: RecordingUrlManager database compatibility');

// Simulate database read (legacy string URL)
const dbValueString = 'https://cdn.telnyx.com/recordings/call456.mp3';
const fromDb1 = RecordingUrlManager.fromDatabase(dbValueString);
assert.ok(fromDb1 instanceof Recording);
assert.strictEqual(fromDb1.url, dbValueString);
console.log('  ✅ String URL from database converted');

// Simulate database read (new JSON Recording)
const dbValueJson = JSON.stringify({
  url: 'https://space.signalwire.com/rec/RE789.mp3',
  provider: 'signalwire',
  format: 'mp3',
  durationSeconds: 120
});
const fromDb2 = RecordingUrlManager.fromDatabase(dbValueJson);
assert.ok(fromDb2 instanceof Recording);
assert.strictEqual(fromDb2.provider, 'signalwire');
assert.strictEqual(fromDb2.durationSeconds, 120);
console.log('  ✅ JSON Recording from database converted');

// Simulate database write (simple Telnyx recording -> URL string)
const simpleRecording = new Recording({
  url: 'https://cdn.telnyx.com/recordings/simple.mp3',
  provider: 'telnyx'
});
const toDb1 = RecordingUrlManager.toDatabase(simpleRecording);
assert.strictEqual(toDb1, 'https://cdn.telnyx.com/recordings/simple.mp3');
assert.strictEqual(typeof toDb1, 'string');
console.log('  ✅ Simple Telnyx recording to database (as URL string)');

// Simulate database write (complex recording -> JSON)
const complexRecording = new Recording({
  url: 'https://space.signalwire.com/rec/complex.mp3',
  provider: 'signalwire',
  durationSeconds: 90,
  providerData: { sid: 'RE123' }
});
const toDb2 = RecordingUrlManager.toDatabase(complexRecording);
assert.ok(typeof toDb2 === 'string');
const parsed = JSON.parse(toDb2);
assert.strictEqual(parsed.provider, 'signalwire');
console.log('  ✅ Complex recording to database (as JSON)\n');

// Test 4: Webhook data parsing
console.log('Test 4: Webhook data parsing');

// Telnyx webhook (current implementation)
const telnyxWebhook = {
  event_type: 'call.recording.saved',
  call_control_id: 'tel-123',
  recording_urls: { mp3: 'https://cdn.telnyx.com/recordings/tel-123.mp3' },
  recording_duration: 45
};
const telnyxRec = Recording.fromTelnyxWebhook(telnyxWebhook);
assert.ok(telnyxRec);
assert.strictEqual(telnyxRec.url, 'https://cdn.telnyx.com/recordings/tel-123.mp3');
assert.strictEqual(telnyxRec.callId, 'tel-123');
assert.strictEqual(telnyxRec.durationSeconds, 45);
console.log('  ✅ Telnyx webhook parsed correctly');

// SignalWire data (future implementation)
const signalWireData = {
  recordingUrl: 'https://space.signalwire.com/recording/RE456.mp3',
  callSid: 'CA789',
  duration: 60
};
const swRec = Recording.fromSignalWireData(signalWireData);
assert.ok(swRec);
assert.strictEqual(swRec.url, 'https://space.signalwire.com/recording/RE456.mp3');
assert.strictEqual(swRec.callId, 'CA789');
assert.strictEqual(swRec.durationSeconds, 60);
console.log('  ✅ SignalWire data parsed correctly\n');

// Test 5: Provider integration
console.log('Test 5: Provider factory integration');
import { createProviderInstance } from './backend/src/providers/provider-factory.js';

const telnyxProvider = createProviderInstance('telnyx');
const recordingFromProvider = await telnyxProvider.getRecording({
  recordingUrl: 'https://cdn.telnyx.com/recordings/provider-test.mp3'
});
assert.ok(recordingFromProvider instanceof Recording);
assert.strictEqual(recordingFromProvider.provider, 'telnyx');
console.log('  ✅ Telnyx provider getRecording works');

const signalwireProvider = createProviderInstance('signalwire');
const swRecordingFromProvider = await signalwireProvider.getRecording({
  recordingUrl: 'https://space.signalwire.com/recording/sw-test.wav'
});
assert.ok(swRecordingFromProvider instanceof Recording);
assert.strictEqual(swRecordingFromProvider.provider, 'signalwire');
assert.strictEqual(swRecordingFromProvider.format, 'wav');
console.log('  ✅ SignalWire provider getRecording works\n');

console.log('='.repeat(60));
console.log('✅ All integration tests PASSED!');
console.log('='.repeat(60));
console.log('\nThe Recording model is fully integrated and backward compatible.');
console.log('Existing code will continue to work without modification.\n');
