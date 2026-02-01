/**
 * Test Suite for Feature #237: Unified Call Status Model
 *
 * This test verifies that the CallStatus enum and mapping functions
 * correctly standardize provider-specific status values.
 *
 * Feature Requirements:
 * 1. Define CallStatus enum (queued, initiated, ringing, in_progress, completed, failed, busy, no_answer)
 * 2. Create Telnyx status mapping function
 * 3. Create SignalWire status mapping function
 * 4. Test that all provider statuses map to unified statuses
 * 5. Verify unmapped statuses throw appropriate errors
 */

import callStatusModule from './backend/src/providers/call-status.model.js';

const {
  CallStatus,
  StatusMappingError,
  StatusMappingErrorCode,
  mapTelnyxStatus,
  mapSignalWireStatus,
  mapProviderStatus,
  isTerminalStatus,
  isActiveStatus,
  isRingingStatus,
  isFailedStatus,
  getKnownTelnyxStatuses,
  getKnownSignalWireStatuses,
  getAllCallStatuses,
  describeCallStatus,
  TELNYX_STATUS_MAP,
  SIGNALWIRE_STATUS_MAP
} = callStatusModule;

// Test results tracker
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (error) {
    console.log(`❌ FAIL: ${name}`);
    console.log(`   Error: ${error.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message = '') {
  if (actual !== expected) {
    throw new Error(`${message}Expected "${expected}", got "${actual}"`);
  }
}

function assertThrows(fn, expectedErrorCode, message = '') {
  try {
    fn();
    throw new Error(`${message}Expected function to throw, but it did not`);
  } catch (error) {
    if (!(error instanceof StatusMappingError)) {
      throw new Error(`${message}Expected StatusMappingError, got ${error.constructor.name}: ${error.message}`);
    }
    if (error.code !== expectedErrorCode) {
      throw new Error(`${message}Expected error code "${expectedErrorCode}", got "${error.code}"`);
    }
  }
}

function assertIncludes(array, item, message = '') {
  if (!array.includes(item)) {
    throw new Error(`${message}Expected array to include "${item}"`);
  }
}

console.log('='.repeat(70));
console.log('Feature #237: Unified Call Status Model - Test Suite');
console.log('='.repeat(70));
console.log();

// ============================================================================
// Test 1: CallStatus Enum Values
// ============================================================================
console.log('--- Test 1: CallStatus Enum Values ---');

test('CallStatus.QUEUED equals "queued"', () => {
  assertEqual(CallStatus.QUEUED, 'queued');
});

test('CallStatus.INITIATED equals "initiated"', () => {
  assertEqual(CallStatus.INITIATED, 'initiated');
});

test('CallStatus.RINGING equals "ringing"', () => {
  assertEqual(CallStatus.RINGING, 'ringing');
});

test('CallStatus.IN_PROGRESS equals "in_progress"', () => {
  assertEqual(CallStatus.IN_PROGRESS, 'in_progress');
});

test('CallStatus.COMPLETED equals "completed"', () => {
  assertEqual(CallStatus.COMPLETED, 'completed');
});

test('CallStatus.FAILED equals "failed"', () => {
  assertEqual(CallStatus.FAILED, 'failed');
});

test('CallStatus.BUSY equals "busy"', () => {
  assertEqual(CallStatus.BUSY, 'busy');
});

test('CallStatus.NO_ANSWER equals "no_answer"', () => {
  assertEqual(CallStatus.NO_ANSWER, 'no_answer');
});

test('getAllCallStatuses returns all 10 statuses', () => {
  const statuses = getAllCallStatuses();
  assertEqual(statuses.length, 10, 'Should have 10 statuses. ');
  assertIncludes(statuses, CallStatus.QUEUED, 'Missing QUEUED. ');
  assertIncludes(statuses, CallStatus.INITIATED, 'Missing INITIATED. ');
  assertIncludes(statuses, CallStatus.RINGING, 'Missing RINGING. ');
  assertIncludes(statuses, CallStatus.IN_PROGRESS, 'Missing IN_PROGRESS. ');
  assertIncludes(statuses, CallStatus.COMPLETED, 'Missing COMPLETED. ');
  assertIncludes(statuses, CallStatus.FAILED, 'Missing FAILED. ');
  assertIncludes(statuses, CallStatus.BUSY, 'Missing BUSY. ');
  assertIncludes(statuses, CallStatus.NO_ANSWER, 'Missing NO_ANSWER. ');
  assertIncludes(statuses, CallStatus.VOICEMAIL, 'Missing VOICEMAIL. ');
  assertIncludes(statuses, CallStatus.CANCELLED, 'Missing CANCELLED. ');
});

console.log();

// ============================================================================
// Test 2: Telnyx Status Mapping
// ============================================================================
console.log('--- Test 2: Telnyx Status Mapping ---');

test('Telnyx "call.initiated" maps to INITIATED', () => {
  assertEqual(mapTelnyxStatus('call.initiated'), CallStatus.INITIATED);
});

test('Telnyx "call.ringing" maps to RINGING', () => {
  assertEqual(mapTelnyxStatus('call.ringing'), CallStatus.RINGING);
});

test('Telnyx "call.answered" maps to IN_PROGRESS', () => {
  assertEqual(mapTelnyxStatus('call.answered'), CallStatus.IN_PROGRESS);
});

test('Telnyx "call.hangup" maps to COMPLETED', () => {
  assertEqual(mapTelnyxStatus('call.hangup'), CallStatus.COMPLETED);
});

test('Telnyx "call.failed" maps to FAILED', () => {
  assertEqual(mapTelnyxStatus('call.failed'), CallStatus.FAILED);
});

test('Telnyx "user_busy" maps to BUSY', () => {
  assertEqual(mapTelnyxStatus('user_busy'), CallStatus.BUSY);
});

test('Telnyx "no_answer" maps to NO_ANSWER', () => {
  assertEqual(mapTelnyxStatus('no_answer'), CallStatus.NO_ANSWER);
});

test('Telnyx "originator_cancel" maps to CANCELLED', () => {
  assertEqual(mapTelnyxStatus('originator_cancel'), CallStatus.CANCELLED);
});

test('Telnyx "machine_detected" maps to VOICEMAIL', () => {
  assertEqual(mapTelnyxStatus('machine_detected'), CallStatus.VOICEMAIL);
});

test('Telnyx status mapping is case-insensitive', () => {
  assertEqual(mapTelnyxStatus('CALL.ANSWERED'), CallStatus.IN_PROGRESS);
  assertEqual(mapTelnyxStatus('Call.Hangup'), CallStatus.COMPLETED);
});

test('All known Telnyx statuses have mappings', () => {
  const knownStatuses = getKnownTelnyxStatuses();
  for (const status of knownStatuses) {
    const mapped = mapTelnyxStatus(status);
    // Just verify it returns a valid CallStatus (doesn't throw)
    assertIncludes(getAllCallStatuses(), mapped, `${status} should map to valid status. `);
  }
});

console.log();

// ============================================================================
// Test 3: SignalWire Status Mapping
// ============================================================================
console.log('--- Test 3: SignalWire Status Mapping ---');

test('SignalWire "queued" maps to QUEUED', () => {
  assertEqual(mapSignalWireStatus('queued'), CallStatus.QUEUED);
});

test('SignalWire "initiated" maps to INITIATED', () => {
  assertEqual(mapSignalWireStatus('initiated'), CallStatus.INITIATED);
});

test('SignalWire "ringing" maps to RINGING', () => {
  assertEqual(mapSignalWireStatus('ringing'), CallStatus.RINGING);
});

test('SignalWire "in-progress" maps to IN_PROGRESS', () => {
  assertEqual(mapSignalWireStatus('in-progress'), CallStatus.IN_PROGRESS);
});

test('SignalWire "in_progress" (underscore variant) maps to IN_PROGRESS', () => {
  assertEqual(mapSignalWireStatus('in_progress'), CallStatus.IN_PROGRESS);
});

test('SignalWire "completed" maps to COMPLETED', () => {
  assertEqual(mapSignalWireStatus('completed'), CallStatus.COMPLETED);
});

test('SignalWire "failed" maps to FAILED', () => {
  assertEqual(mapSignalWireStatus('failed'), CallStatus.FAILED);
});

test('SignalWire "busy" maps to BUSY', () => {
  assertEqual(mapSignalWireStatus('busy'), CallStatus.BUSY);
});

test('SignalWire "no-answer" maps to NO_ANSWER', () => {
  assertEqual(mapSignalWireStatus('no-answer'), CallStatus.NO_ANSWER);
});

test('SignalWire "canceled" maps to CANCELLED', () => {
  assertEqual(mapSignalWireStatus('canceled'), CallStatus.CANCELLED);
});

test('SignalWire status mapping is case-insensitive', () => {
  assertEqual(mapSignalWireStatus('IN-PROGRESS'), CallStatus.IN_PROGRESS);
  assertEqual(mapSignalWireStatus('Completed'), CallStatus.COMPLETED);
});

test('All known SignalWire statuses have mappings', () => {
  const knownStatuses = getKnownSignalWireStatuses();
  for (const status of knownStatuses) {
    const mapped = mapSignalWireStatus(status);
    assertIncludes(getAllCallStatuses(), mapped, `${status} should map to valid status. `);
  }
});

console.log();

// ============================================================================
// Test 4: Generic Provider Status Mapping
// ============================================================================
console.log('--- Test 4: Generic Provider Status Mapping ---');

test('mapProviderStatus with "telnyx" uses Telnyx mapping', () => {
  assertEqual(mapProviderStatus('telnyx', 'call.answered'), CallStatus.IN_PROGRESS);
});

test('mapProviderStatus with "signalwire" uses SignalWire mapping', () => {
  assertEqual(mapProviderStatus('signalwire', 'in-progress'), CallStatus.IN_PROGRESS);
});

test('mapProviderStatus is case-insensitive for provider name', () => {
  assertEqual(mapProviderStatus('TELNYX', 'call.answered'), CallStatus.IN_PROGRESS);
  assertEqual(mapProviderStatus('SignalWire', 'in-progress'), CallStatus.IN_PROGRESS);
});

console.log();

// ============================================================================
// Test 5: Error Handling for Unmapped Statuses
// ============================================================================
console.log('--- Test 5: Error Handling for Unmapped Statuses ---');

test('Unknown Telnyx status throws UNKNOWN_STATUS when throwOnUnknown=true', () => {
  assertThrows(
    () => mapTelnyxStatus('totally_made_up_status', { throwOnUnknown: true }),
    StatusMappingErrorCode.UNKNOWN_STATUS
  );
});

test('Unknown SignalWire status throws UNKNOWN_STATUS when throwOnUnknown=true', () => {
  assertThrows(
    () => mapSignalWireStatus('totally_made_up_status', { throwOnUnknown: true }),
    StatusMappingErrorCode.UNKNOWN_STATUS
  );
});

test('Null Telnyx status throws MISSING_STATUS when throwOnUnknown=true', () => {
  assertThrows(
    () => mapTelnyxStatus(null, { throwOnUnknown: true }),
    StatusMappingErrorCode.MISSING_STATUS
  );
});

test('Undefined SignalWire status throws MISSING_STATUS when throwOnUnknown=true', () => {
  assertThrows(
    () => mapSignalWireStatus(undefined, { throwOnUnknown: true }),
    StatusMappingErrorCode.MISSING_STATUS
  );
});

test('Unknown provider throws UNKNOWN_PROVIDER when throwOnUnknown=true', () => {
  assertThrows(
    () => mapProviderStatus('twilio', 'in-progress', { throwOnUnknown: true }),
    StatusMappingErrorCode.UNKNOWN_PROVIDER
  );
});

test('StatusMappingError contains provider name', () => {
  try {
    mapTelnyxStatus('unknown_status', { throwOnUnknown: true });
  } catch (error) {
    assertEqual(error.provider, 'telnyx');
  }
});

test('StatusMappingError contains raw status value', () => {
  try {
    mapTelnyxStatus('my_custom_status', { throwOnUnknown: true });
  } catch (error) {
    assertEqual(error.rawStatus, 'my_custom_status');
  }
});

test('Unknown status returns default when throwOnUnknown=false', () => {
  const status = mapTelnyxStatus('totally_made_up_status', { throwOnUnknown: false });
  assertEqual(status, CallStatus.INITIATED); // Default
});

test('Custom default status is used for unknown statuses', () => {
  const status = mapSignalWireStatus('totally_made_up_status', {
    throwOnUnknown: false,
    defaultStatus: CallStatus.FAILED
  });
  assertEqual(status, CallStatus.FAILED);
});

console.log();

// ============================================================================
// Test 6: Status Utility Functions
// ============================================================================
console.log('--- Test 6: Status Utility Functions ---');

test('isTerminalStatus returns true for COMPLETED', () => {
  assertEqual(isTerminalStatus(CallStatus.COMPLETED), true);
});

test('isTerminalStatus returns true for FAILED', () => {
  assertEqual(isTerminalStatus(CallStatus.FAILED), true);
});

test('isTerminalStatus returns true for BUSY', () => {
  assertEqual(isTerminalStatus(CallStatus.BUSY), true);
});

test('isTerminalStatus returns true for NO_ANSWER', () => {
  assertEqual(isTerminalStatus(CallStatus.NO_ANSWER), true);
});

test('isTerminalStatus returns false for IN_PROGRESS', () => {
  assertEqual(isTerminalStatus(CallStatus.IN_PROGRESS), false);
});

test('isActiveStatus returns true for IN_PROGRESS', () => {
  assertEqual(isActiveStatus(CallStatus.IN_PROGRESS), true);
});

test('isActiveStatus returns false for RINGING', () => {
  assertEqual(isActiveStatus(CallStatus.RINGING), false);
});

test('isRingingStatus returns true for INITIATED', () => {
  assertEqual(isRingingStatus(CallStatus.INITIATED), true);
});

test('isRingingStatus returns true for RINGING', () => {
  assertEqual(isRingingStatus(CallStatus.RINGING), true);
});

test('isFailedStatus returns true for failed outcomes', () => {
  assertEqual(isFailedStatus(CallStatus.FAILED), true);
  assertEqual(isFailedStatus(CallStatus.BUSY), true);
  assertEqual(isFailedStatus(CallStatus.NO_ANSWER), true);
  assertEqual(isFailedStatus(CallStatus.CANCELLED), true);
});

test('describeCallStatus returns human-readable descriptions', () => {
  assertEqual(describeCallStatus(CallStatus.QUEUED).length > 0, true);
  assertEqual(describeCallStatus(CallStatus.IN_PROGRESS), 'Connected');
  assertEqual(describeCallStatus(CallStatus.BUSY), 'Line was busy');
});

console.log();

// ============================================================================
// Test 7: Status Map Coverage
// ============================================================================
console.log('--- Test 7: Status Map Coverage ---');

test('TELNYX_STATUS_MAP has at least 20 mappings', () => {
  const count = Object.keys(TELNYX_STATUS_MAP).length;
  if (count < 20) {
    throw new Error(`Expected at least 20 Telnyx mappings, got ${count}`);
  }
});

test('SIGNALWIRE_STATUS_MAP has at least 10 mappings', () => {
  const count = Object.keys(SIGNALWIRE_STATUS_MAP).length;
  if (count < 10) {
    throw new Error(`Expected at least 10 SignalWire mappings, got ${count}`);
  }
});

test('All Telnyx mappings point to valid CallStatus values', () => {
  const validStatuses = getAllCallStatuses();
  for (const [key, value] of Object.entries(TELNYX_STATUS_MAP)) {
    assertIncludes(validStatuses, value, `${key} maps to invalid status: ${value}. `);
  }
});

test('All SignalWire mappings point to valid CallStatus values', () => {
  const validStatuses = getAllCallStatuses();
  for (const [key, value] of Object.entries(SIGNALWIRE_STATUS_MAP)) {
    assertIncludes(validStatuses, value, `${key} maps to invalid status: ${value}. `);
  }
});

console.log();

// ============================================================================
// Summary
// ============================================================================
console.log('='.repeat(70));
console.log(`Test Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(70));

if (failed > 0) {
  console.log('\n❌ SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('\n✅ ALL TESTS PASSED');
  console.log('\nFeature #237 verification complete:');
  console.log('1. ✅ CallStatus enum defined with all required values');
  console.log('2. ✅ Telnyx status mapping function created');
  console.log('3. ✅ SignalWire status mapping function created');
  console.log('4. ✅ All provider statuses map to unified statuses');
  console.log('5. ✅ Unmapped statuses throw appropriate errors');
  process.exit(0);
}
