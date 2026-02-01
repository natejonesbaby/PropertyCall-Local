/**
 * Test Suite for Unified AMD Result Handling (Feature #239)
 *
 * This test suite verifies:
 * 1. AMDResult enum includes all required values (human, machine, fax, unknown)
 * 2. Telnyx AMD mapper normalizes detection results correctly
 * 3. SignalWire AMD mapper normalizes detection results correctly
 * 4. Confidence scores are included and normalized properly
 * 5. Both providers return consistent AMD result structure
 *
 * Run with: node test-amd-mappers.js
 */

import { mapTelnyxAmdResult, mapSignalWireAmdResult, AMDResult } from './backend/src/providers/call-event.model.js';

// Test counters
let passed = 0;
let failed = 0;

// Helper function to run a test
function test(name, fn) {
  try {
    fn();
    console.log(`✓ PASS: ${name}`);
    passed++;
  } catch (error) {
    console.error(`✗ FAIL: ${name}`);
    console.error(`  Error: ${error.message}`);
    failed++;
  }
}

// Helper function for assertions
function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\n  Expected: ${expected}\n  Actual: ${actual}`);
  }
}

function assertExists(value, message) {
  if (value === undefined || value === null) {
    throw new Error(`${message}\n  Expected value to exist, but got: ${value}`);
  }
}

function assertDefined(value, message) {
  if (value === undefined) {
    throw new Error(`${message}\n  Expected value to be defined`);
  }
}

// ============================================================================
// Feature Requirement 1: AMDResult enum has all required values
// ============================================================================

console.log('\n=== Testing AMDResult Enum Values ===\n');

test('1.1: AMDResult.HUMAN is defined', () => {
  assertEqual(AMDResult.HUMAN, 'human', 'AMDResult.HUMAN should be "human"');
});

test('1.2: AMDResult.MACHINE is defined', () => {
  assertEqual(AMDResult.MACHINE, 'machine', 'AMDResult.MACHINE should be "machine"');
});

test('1.3: AMDResult.FAX is defined', () => {
  assertEqual(AMDResult.FAX, 'fax', 'AMDResult.FAX should be "fax"');
});

test('1.4: AMDResult.UNKNOWN is defined', () => {
  assertEqual(AMDResult.UNKNOWN, 'unknown', 'AMDResult.UNKNOWN should be "unknown"');
});

// ============================================================================
// Feature Requirement 2: Telnyx AMD result mapper
// ============================================================================

console.log('\n=== Testing Telnyx AMD Mapper ===\n');

test('2.1: Telnyx "human" maps to AMDResult.HUMAN', () => {
  const result = mapTelnyxAmdResult('human');
  assertExists(result, 'Result should exist');
  assertEqual(result.result, AMDResult.HUMAN, 'Should map to HUMAN');
});

test('2.2: Telnyx "machine" maps to AMDResult.MACHINE', () => {
  const result = mapTelnyxAmdResult('machine');
  assertExists(result, 'Result should exist');
  assertEqual(result.result, AMDResult.MACHINE, 'Should map to MACHINE');
});

test('2.3: Telnyx "voicemail" maps to AMDResult.MACHINE', () => {
  const result = mapTelnyxAmdResult('voicemail');
  assertExists(result, 'Result should exist');
  assertEqual(result.result, AMDResult.MACHINE, 'Should map voicemail to MACHINE');
});

test('2.4: Telnyx "fax" maps to AMDResult.FAX', () => {
  const result = mapTelnyxAmdResult('fax');
  assertExists(result, 'Result should exist');
  assertEqual(result.result, AMDResult.FAX, 'Should map to FAX');
});

test('2.5: Telnyx "unknown" maps to AMDResult.UNKNOWN', () => {
  const result = mapTelnyxAmdResult('unknown');
  assertExists(result, 'Result should exist');
  assertEqual(result.result, AMDResult.UNKNOWN, 'Should map to UNKNOWN');
});

test('2.6: Telnyx undefined returns undefined', () => {
  const result = mapTelnyxAmdResult(undefined);
  assertEqual(result, undefined, 'Should return undefined for undefined input');
});

test('2.7: Telnyx unknown result maps to UNKNOWN with warning', () => {
  const result = mapTelnyxAmdResult('invalid_result');
  assertExists(result, 'Result should exist');
  assertEqual(result.result, AMDResult.UNKNOWN, 'Should map unknown result to UNKNOWN');
  assertEqual(result.rawResult, 'invalid_result', 'Should preserve raw result');
});

// ============================================================================
// Feature Requirement 3: SignalWire AMD result mapper
// ============================================================================

console.log('\n=== Testing SignalWire AMD Mapper ===\n');

test('3.1: SignalWire "human" maps to AMDResult.HUMAN', () => {
  const result = mapSignalWireAmdResult('human');
  assertExists(result, 'Result should exist');
  assertEqual(result.result, AMDResult.HUMAN, 'Should map to HUMAN');
});

test('3.2: SignalWire "person" maps to AMDResult.HUMAN', () => {
  const result = mapSignalWireAmdResult('person');
  assertExists(result, 'Result should exist');
  assertEqual(result.result, AMDResult.HUMAN, 'Should map person to HUMAN');
});

test('3.3: SignalWire "machine" maps to AMDResult.MACHINE', () => {
  const result = mapSignalWireAmdResult('machine');
  assertExists(result, 'Result should exist');
  assertEqual(result.result, AMDResult.MACHINE, 'Should map to MACHINE');
});

test('3.4: SignalWire "voicemail" maps to AMDResult.MACHINE', () => {
  const result = mapSignalWireAmdResult('voicemail');
  assertExists(result, 'Result should exist');
  assertEqual(result.result, AMDResult.MACHINE, 'Should map voicemail to MACHINE');
});

test('3.5: SignalWire "fax" maps to AMDResult.FAX', () => {
  const result = mapSignalWireAmdResult('fax');
  assertExists(result, 'Result should exist');
  assertEqual(result.result, AMDResult.FAX, 'Should map to FAX');
});

test('3.6: SignalWire "fax machine" maps to AMDResult.FAX', () => {
  const result = mapSignalWireAmdResult('fax machine');
  assertExists(result, 'Result should exist');
  assertEqual(result.result, AMDResult.FAX, 'Should map "fax machine" to FAX');
});

test('3.7: SignalWire "unknown" maps to AMDResult.UNKNOWN', () => {
  const result = mapSignalWireAmdResult('unknown');
  assertExists(result, 'Result should exist');
  assertEqual(result.result, AMDResult.UNKNOWN, 'Should map to UNKNOWN');
});

test('3.8: SignalWire undefined returns undefined', () => {
  const result = mapSignalWireAmdResult(undefined);
  assertEqual(result, undefined, 'Should return undefined for undefined input');
});

test('3.9: SignalWire unknown result maps to UNKNOWN with warning', () => {
  const result = mapSignalWireAmdResult('invalid_result');
  assertExists(result, 'Result should exist');
  assertEqual(result.result, AMDResult.UNKNOWN, 'Should map unknown result to UNKNOWN');
  assertEqual(result.rawResult, 'invalid_result', 'Should preserve raw result');
});

// ============================================================================
// Feature Requirement 4: Include confidence score in unified result
// ============================================================================

console.log('\n=== Testing Confidence Score Handling ===\n');

test('4.1: Telnyx confidence 0-1 scale is preserved', () => {
  const result = mapTelnyxAmdResult('human', 0.95);
  assertExists(result, 'Result should exist');
  assertDefined(result.confidence, 'Confidence should be defined');
  assertEqual(result.confidence, 0.95, 'Confidence should be 0.95');
});

test('4.2: Telnyx confidence 0-100 scale is normalized to 0-1', () => {
  const result = mapTelnyxAmdResult('human', 85);
  assertExists(result, 'Result should exist');
  assertDefined(result.confidence, 'Confidence should be defined');
  assertEqual(result.confidence, 0.85, 'Confidence should be normalized to 0.85');
});

test('4.3: Telnyx confidence > 1 is clamped to 1.0', () => {
  const result = mapTelnyxAmdResult('human', 150);
  assertExists(result, 'Result should exist');
  assertEqual(result.confidence, 1.0, 'Confidence should be clamped to 1.0');
});

test('4.4: Telnyx confidence < 0 is clamped to 0.0', () => {
  const result = mapTelnyxAmdResult('human', -0.5);
  assertExists(result, 'Result should exist');
  assertEqual(result.confidence, 0.0, 'Confidence should be clamped to 0.0');
});

test('4.5: SignalWire confidence 0-100 scale is normalized to 0-1', () => {
  const result = mapSignalWireAmdResult('human', 92);
  assertExists(result, 'Result should exist');
  assertDefined(result.confidence, 'Confidence should be defined');
  assertEqual(result.confidence, 0.92, 'Confidence should be normalized to 0.92');
});

test('4.6: SignalWire confidence 0-1 scale is preserved', () => {
  const result = mapSignalWireAmdResult('human', 0.88);
  assertExists(result, 'Result should exist');
  assertDefined(result.confidence, 'Confidence should be defined');
  assertEqual(result.confidence, 0.88, 'Confidence should be 0.88');
});

test('4.7: Undefined confidence is handled', () => {
  const result = mapTelnyxAmdResult('human');
  assertExists(result, 'Result should exist');
  // Confidence should be undefined if not provided
  assertEqual(result.confidence, undefined, 'Confidence should be undefined');
});

// ============================================================================
// Feature Requirement 5: Both providers return consistent AMD results
// ============================================================================

console.log('\n=== Testing Consistency Across Providers ===\n');

test('5.1: Both providers return same structure for HUMAN', () => {
  const telnyxResult = mapTelnyxAmdResult('human', 0.9);
  const signalWireResult = mapSignalWireAmdResult('human', 90);

  // Check structure
  assertExists(telnyxResult, 'Telnyx result should exist');
  assertExists(signalWireResult, 'SignalWire result should exist');

  // Both should have 'result' field
  assertDefined(telnyxResult.result, 'Telnyx result should have result field');
  assertDefined(signalWireResult.result, 'SignalWire result should have result field');

  // Both should have 'confidence' field
  assertDefined(telnyxResult.confidence, 'Telnyx result should have confidence');
  assertDefined(signalWireResult.confidence, 'SignalWire result should have confidence');

  // Both should have 'rawResult' field
  assertDefined(telnyxResult.rawResult, 'Telnyx result should have rawResult');
  assertDefined(signalWireResult.rawResult, 'SignalWire result should have rawResult');

  // Both should have 'metadata' field
  assertDefined(telnyxResult.metadata, 'Telnyx result should have metadata');
  assertDefined(signalWireResult.metadata, 'SignalWire result should have metadata');

  // Results should match
  assertEqual(telnyxResult.result, signalWireResult.result, 'Results should match');
  assertEqual(telnyxResult.confidence, signalWireResult.confidence, 'Confidences should match after normalization');
});

test('5.2: Both providers normalize confidence to same scale', () => {
  const telnyxResult = mapTelnyxAmdResult('machine', 0.75);
  const signalWireResult = mapSignalWireAmdResult('machine', 75);

  assertEqual(telnyxResult.confidence, signalWireResult.confidence,
    'Confidences should match after normalization');
});

test('5.3: Both providers handle MACHINE consistently', () => {
  const telnyxResult = mapTelnyxAmdResult('machine');
  const signalWireResult = mapSignalWireAmdResult('machine');

  assertEqual(telnyxResult.result, AMDResult.MACHINE, 'Telnyx should map to MACHINE');
  assertEqual(signalWireResult.result, AMDResult.MACHINE, 'SignalWire should map to MACHINE');
});

test('5.4: Both providers handle FAX consistently', () => {
  const telnyxResult = mapTelnyxAmdResult('fax');
  const signalWireResult = mapSignalWireAmdResult('fax');

  assertEqual(telnyxResult.result, AMDResult.FAX, 'Telnyx should map to FAX');
  assertEqual(signalWireResult.result, AMDResult.FAX, 'SignalWire should map to FAX');
});

test('5.5: Both providers handle UNKNOWN consistently', () => {
  const telnyxResult = mapTelnyxAmdResult('unknown');
  const signalWireResult = mapSignalWireAmdResult('unknown');

  assertEqual(telnyxResult.result, AMDResult.UNKNOWN, 'Telnyx should map to UNKNOWN');
  assertEqual(signalWireResult.result, AMDResult.UNKNOWN, 'SignalWire should map to UNKNOWN');
});

test('5.6: Both providers include metadata', () => {
  const telnyxResult = mapTelnyxAmdResult('human', 0.9);
  const signalWireResult = mapSignalWireAmdResult('human', 90);

  assertExists(telnyxResult.metadata, 'Telnyx result should have metadata');
  assertExists(signalWireResult.metadata, 'SignalWire result should have metadata');

  assertEqual(telnyxResult.metadata.automated, true, 'Telnyx metadata should have automated: true');
  assertEqual(signalWireResult.metadata.automated, true, 'SignalWire metadata should have automated: true');

  assertEqual(telnyxResult.metadata.method, 'telnyx_amd', 'Telnyx method should be telnyx_amd');
  assertEqual(signalWireResult.metadata.method, 'signalwire_amd', 'SignalWire method should be signalwire_amd');
});

// ============================================================================
// Summary
// ============================================================================

console.log('\n' + '='.repeat(60));
console.log(`Tests passed: ${passed}`);
console.log(`Tests failed: ${failed}`);
console.log(`Total tests: ${passed + failed}`);
console.log('='.repeat(60));

if (failed > 0) {
  console.log('\n❌ Some tests failed!');
  process.exit(1);
} else {
  console.log('\n✅ All tests passed!');
  process.exit(0);
}
