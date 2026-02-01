/**
 * Test Suite for Feature #260
 * "Telnyx-specific errors mapped to common types"
 *
 * This test verifies that:
 * 1. Telnyx error mapper function exists
 * 2. Authentication errors are mapped correctly
 * 3. Rate limit errors are mapped correctly
 * 4. Call failure errors are mapped correctly
 * 5. Network errors are mapped correctly
 * 6. All error types are mapped to common TelephonyError types
 */

import {
  TelephonyError,
  AuthenticationError,
  RateLimitError,
  CallFailedError,
  NetworkError,
  ValidationError,
  ConfigurationError,
  ResourceNotFoundError,
  PermissionDeniedError,
  ServiceUnavailableError,
  TimeoutError,
  mapTelnyxError
} from './backend/src/providers/telephony-errors.js';

console.log('='.repeat(70));
console.log('FEATURE #260: Telnyx Error Mapping Tests');
console.log('='.repeat(70));

let passedTests = 0;
let failedTests = 0;

/**
 * Helper function to assert a condition
 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

/**
 * Helper function to assert error type
 */
function assertErrorType(error, ExpectedErrorClass, message) {
  if (!(error instanceof ExpectedErrorClass)) {
    throw new Error(
      message ||
      `Expected error to be instance of ${ExpectedErrorClass.name}, got ${error.constructor.name}`
    );
  }
}

// ============================================================================
// Test 1: Telnyx error mapper function exists
// ============================================================================
console.log('\nTest 1: Telnyx error mapper function exists');
try {
  assert(typeof mapTelnyxError === 'function', 'mapTelnyxError function should be exported');
  console.log('   Found mapTelnyxError function in telephony-errors.js');
  console.log('✅ PASS: Test 1');
  passedTests++;
} catch (error) {
  console.log(`❌ FAIL: Test 1 - ${error.message}`);
  failedTests++;
}

// ============================================================================
// Test 2: Authentication errors are mapped correctly
// ============================================================================
console.log('\nTest 2: Authentication errors (401) map to AuthenticationError');
try {
  // Test 401 Unauthorized
  const error401 = mapTelnyxError({
    status: 401,
    message: 'Unauthorized'
  });
  assertErrorType(error401, AuthenticationError, '401 should map to AuthenticationError');
  assert(error401.code === 'AUTHENTICATION_ERROR', 'Error code should be AUTHENTICATION_ERROR');
  assert(error401.metadata.provider === 'telnyx', 'Metadata should include provider name');
  console.log('   ✅ 401 → AuthenticationError');

  // Test invalid_api_key error code
  const errorInvalidKey = mapTelnyxError({
    code: 'invalid_api_key',
    message: 'Invalid API key'
  });
  assertErrorType(errorInvalidKey, AuthenticationError, 'invalid_api_key should map to AuthenticationError');
  assert(errorInvalidKey.code === 'AUTHENTICATION_ERROR', 'Error code should be AUTHENTICATION_ERROR');
  console.log('   ✅ invalid_api_key → AuthenticationError');

  // Test api_key_missing error code
  const errorMissingKey = mapTelnyxError({
    code: 'api_key_missing',
    message: 'API key missing'
  });
  assertErrorType(errorMissingKey, AuthenticationError, 'api_key_missing should map to AuthenticationError');
  console.log('   ✅ api_key_missing → AuthenticationError');

  console.log('✅ PASS: Test 2');
  passedTests++;
} catch (error) {
  console.log(`❌ FAIL: Test 2 - ${error.message}`);
  failedTests++;
}

// ============================================================================
// Test 3: Rate limit errors are mapped correctly
// ============================================================================
console.log('\nTest 3: Rate limit errors (429) map to RateLimitError');
try {
  // Test 429 Rate Limit
  const error429 = mapTelnyxError({
    status: 429,
    message: 'Too many requests',
    details: {
      limit: 100,
      remaining: 0,
      reset_at: '2024-01-24T12:00:00Z'
    }
  });
  assertErrorType(error429, RateLimitError, '429 should map to RateLimitError');
  assert(error429.code === 'RATE_LIMIT_ERROR', 'Error code should be RATE_LIMIT_ERROR');
  assert(error429.metadata.limit === 100, 'Should include rate limit metadata');
  assert(error429.metadata.remaining === 0, 'Should include remaining count');
  console.log('   ✅ 429 → RateLimitError with metadata');

  // Test rate_limit_exceeded error code
  const errorRateLimit = mapTelnyxError({
    code: 'rate_limit_exceeded',
    message: 'Rate limit exceeded'
  });
  assertErrorType(errorRateLimit, RateLimitError, 'rate_limit_exceeded should map to RateLimitError');
  console.log('   ✅ rate_limit_exceeded → RateLimitError');

  // Test too_many_requests error code
  const errorTooMany = mapTelnyxError({
    code: 'too_many_requests',
    message: 'Too many requests'
  });
  assertErrorType(errorTooMany, RateLimitError, 'too_many_requests should map to RateLimitError');
  console.log('   ✅ too_many_requests → RateLimitError');

  console.log('✅ PASS: Test 3');
  passedTests++;
} catch (error) {
  console.log(`❌ FAIL: Test 3 - ${error.message}`);
  failedTests++;
}

// ============================================================================
// Test 4: Call failure errors are mapped correctly
// ============================================================================
console.log('\nTest 4: Call failure errors map to CallFailedError');
try {
  // Test call_failed error code
  const errorCallFailed = mapTelnyxError({
    code: 'call_failed',
    message: 'Call failed',
    call_control_id: 'abc123'
  });
  assertErrorType(errorCallFailed, CallFailedError, 'call_failed should map to CallFailedError');
  assert(errorCallFailed.code === 'CALL_FAILED_ERROR', 'Error code should be CALL_FAILED_ERROR');
  assert(errorCallFailed.metadata.callId === 'abc123', 'Should include call ID in metadata');
  console.log('   ✅ call_failed → CallFailedError');

  // Test busy error code
  const errorBusy = mapTelnyxError({
    code: 'busy',
    message: 'Line busy'
  });
  assertErrorType(errorBusy, CallFailedError, 'busy should map to CallFailedError');
  console.log('   ✅ busy → CallFailedError');

  // Test no_answer error code
  const errorNoAnswer = mapTelnyxError({
    code: 'no_answer',
    message: 'No answer'
  });
  assertErrorType(errorNoAnswer, CallFailedError, 'no_answer should map to CallFailedError');
  console.log('   ✅ no_answer → CallFailedError');

  // Test destination_unreachable error code
  const errorUnreachable = mapTelnyxError({
    code: 'destination_unreachable',
    message: 'Destination unreachable'
  });
  assertErrorType(errorUnreachable, CallFailedError, 'destination_unreachable should map to CallFailedError');
  console.log('   ✅ destination_unreachable → CallFailedError');

  console.log('✅ PASS: Test 4');
  passedTests++;
} catch (error) {
  console.log(`❌ FAIL: Test 4 - ${error.message}`);
  failedTests++;
}

// ============================================================================
// Test 5: Network errors are mapped correctly
// ============================================================================
console.log('\nTest 5: Network errors map to NetworkError or TimeoutError');
try {
  // Test connection_error error code
  const errorConnection = mapTelnyxError({
    code: 'connection_error',
    message: 'Connection failed'
  });
  assertErrorType(errorConnection, NetworkError, 'connection_error should map to NetworkError');
  assert(errorConnection.code === 'NETWORK_ERROR', 'Error code should be NETWORK_ERROR');
  console.log('   ✅ connection_error → NetworkError');

  // Test network_error error code
  const errorNetwork = mapTelnyxError({
    code: 'network_error',
    message: 'Network error'
  });
  assertErrorType(errorNetwork, NetworkError, 'network_error should map to NetworkError');
  console.log('   ✅ network_error → NetworkError');

  // Test dns_resolution_failed error code
  const errorDNS = mapTelnyxError({
    code: 'dns_resolution_failed',
    message: 'DNS resolution failed'
  });
  assertErrorType(errorDNS, NetworkError, 'dns_resolution_failed should map to NetworkError');
  console.log('   ✅ dns_resolution_failed → NetworkError');

  // Test connection_timeout error code
  const errorTimeout = mapTelnyxError({
    code: 'connection_timeout',
    message: 'Connection timeout'
  });
  assertErrorType(errorTimeout, TimeoutError, 'connection_timeout should map to TimeoutError');
  assert(errorTimeout.code === 'TIMEOUT_ERROR', 'Error code should be TIMEOUT_ERROR');
  console.log('   ✅ connection_timeout → TimeoutError');

  console.log('✅ PASS: Test 5');
  passedTests++;
} catch (error) {
  console.log(`❌ FAIL: Test 5 - ${error.message}`);
  failedTests++;
}

// ============================================================================
// Test 6: Validation errors are mapped correctly
// ============================================================================
console.log('\nTest 6: Validation errors (400, 422) map to ValidationError');
try {
  // Test 400 Bad Request
  const error400 = mapTelnyxError({
    status: 400,
    message: 'Bad request'
  });
  assertErrorType(error400, ValidationError, '400 should map to ValidationError');
  assert(error400.code === 'VALIDATION_ERROR', 'Error code should be VALIDATION_ERROR');
  console.log('   ✅ 400 → ValidationError');

  // Test 422 Unprocessable Entity
  const error422 = mapTelnyxError({
    status: 422,
    message: 'Validation failed'
  });
  assertErrorType(error422, ValidationError, '422 should map to ValidationError');
  console.log('   ✅ 422 → ValidationError');

  // Test invalid_phone_number error code
  const errorInvalidPhone = mapTelnyxError({
    code: 'invalid_phone_number',
    message: 'Invalid phone number'
  });
  assertErrorType(errorInvalidPhone, ValidationError, 'invalid_phone_number should map to ValidationError');
  console.log('   ✅ invalid_phone_number → ValidationError');

  // Test invalid_request error code
  const errorInvalidRequest = mapTelnyxError({
    code: 'invalid_request',
    message: 'Invalid request'
  });
  assertErrorType(errorInvalidRequest, ValidationError, 'invalid_request should map to ValidationError');
  console.log('   ✅ invalid_request → ValidationError');

  console.log('✅ PASS: Test 6');
  passedTests++;
} catch (error) {
  console.log(`❌ FAIL: Test 6 - ${error.message}`);
  failedTests++;
}

// ============================================================================
// Test 7: Resource not found errors are mapped correctly
// ============================================================================
console.log('\nTest 7: Resource not found errors (404) map to ResourceNotFoundError');
try {
  // Test 404 Not Found
  const error404 = mapTelnyxError({
    status: 404,
    message: 'Not found'
  });
  assertErrorType(error404, ResourceNotFoundError, '404 should map to ResourceNotFoundError');
  assert(error404.code === 'RESOURCE_NOT_FOUND_ERROR', 'Error code should be RESOURCE_NOT_FOUND_ERROR');
  console.log('   ✅ 404 → ResourceNotFoundError');

  // Test call_not_found error code
  const errorCallNotFound = mapTelnyxError({
    code: 'call_not_found',
    message: 'Call not found'
  });
  assertErrorType(errorCallNotFound, ResourceNotFoundError, 'call_not_found should map to ResourceNotFoundError');
  console.log('   ✅ call_not_found → ResourceNotFoundError');

  // Test recording_not_found error code
  const errorRecordingNotFound = mapTelnyxError({
    code: 'recording_not_found',
    message: 'Recording not found'
  });
  assertErrorType(errorRecordingNotFound, ResourceNotFoundError, 'recording_not_found should map to ResourceNotFoundError');
  console.log('   ✅ recording_not_found → ResourceNotFoundError');

  console.log('✅ PASS: Test 7');
  passedTests++;
} catch (error) {
  console.log(`❌ FAIL: Test 7 - ${error.message}`);
  failedTests++;
}

// ============================================================================
// Test 8: Permission errors are mapped correctly
// ============================================================================
console.log('\nTest 8: Permission errors (403) map to PermissionDeniedError');
try {
  // Test 403 Forbidden
  const error403 = mapTelnyxError({
    status: 403,
    message: 'Forbidden'
  });
  assertErrorType(error403, PermissionDeniedError, '403 should map to PermissionDeniedError');
  assert(error403.code === 'PERMISSION_DENIED_ERROR', 'Error code should be PERMISSION_DENIED_ERROR');
  console.log('   ✅ 403 → PermissionDeniedError');

  // Test forbidden error code
  const errorForbidden = mapTelnyxError({
    code: 'forbidden',
    message: 'Access forbidden'
  });
  assertErrorType(errorForbidden, PermissionDeniedError, 'forbidden should map to PermissionDeniedError');
  console.log('   ✅ forbidden → PermissionDeniedError');

  console.log('✅ PASS: Test 8');
  passedTests++;
} catch (error) {
  console.log(`❌ FAIL: Test 8 - ${error.message}`);
  failedTests++;
}

// ============================================================================
// Test 9: Service unavailable errors are mapped correctly
// ============================================================================
console.log('\nTest 9: Service unavailable errors (500, 502, 503) map to ServiceUnavailableError');
try {
  // Test 500 Internal Server Error
  const error500 = mapTelnyxError({
    status: 500,
    message: 'Internal server error'
  });
  assertErrorType(error500, ServiceUnavailableError, '500 should map to ServiceUnavailableError');
  assert(error500.code === 'SERVICE_UNAVAILABLE_ERROR', 'Error code should be SERVICE_UNAVAILABLE_ERROR');
  console.log('   ✅ 500 → ServiceUnavailableError');

  // Test 502 Bad Gateway
  const error502 = mapTelnyxError({
    status: 502,
    message: 'Bad gateway'
  });
  assertErrorType(error502, ServiceUnavailableError, '502 should map to ServiceUnavailableError');
  console.log('   ✅ 502 → ServiceUnavailableError');

  // Test 503 Service Unavailable
  const error503 = mapTelnyxError({
    status: 503,
    message: 'Service unavailable'
  });
  assertErrorType(error503, ServiceUnavailableError, '503 should map to ServiceUnavailableError');
  console.log('   ✅ 503 → ServiceUnavailableError');

  console.log('✅ PASS: Test 9');
  passedTests++;
} catch (error) {
  console.log(`❌ FAIL: Test 9 - ${error.message}`);
  failedTests++;
}

// ============================================================================
// Test 10: Unknown errors map to base TelephonyError
// ============================================================================
console.log('\nTest 10: Unknown errors map to base TelephonyError');
try {
  // Test unknown error code
  const errorUnknown = mapTelnyxError({
    code: 'unknown_error_code',
    message: 'Unknown error'
  });
  assertErrorType(errorUnknown, TelephonyError, 'unknown error should map to TelephonyError');
  assert(errorUnknown.code === 'TELEPHONY_ERROR', 'Error code should be TELEPHONY_ERROR');
  assert(errorUnknown.metadata.provider === 'telnyx', 'Metadata should include provider name');
  assert(errorUnknown.metadata.providerCode === 'unknown_error_code', 'Should include original error code');
  console.log('   ✅ unknown_error_code → TelephonyError');

  // Test error with no code or status
  const errorNoInfo = mapTelnyxError({
    message: 'Some error'
  });
  assertErrorType(errorNoInfo, TelephonyError, 'error with no code should map to TelephonyError');
  console.log('   ✅ error with no code → TelephonyError');

  console.log('✅ PASS: Test 10');
  passedTests++;
} catch (error) {
  console.log(`❌ FAIL: Test 10 - ${error.message}`);
  failedTests++;
}

// ============================================================================
// Test 11: Context and metadata are preserved
// ============================================================================
console.log('\nTest 11: Context and metadata are preserved in mapped errors');
try {
  // Test that context is preserved
  const errorWithContext = mapTelnyxError(
    {
      status: 401,
      message: 'Unauthorized',
      request_id: 'req_123'
    },
    {
      operation: 'initiateCall',
      callId: 'call_abc',
      phoneNumber: '+1234567890'
    }
  );

  assertErrorType(errorWithContext, AuthenticationError);
  assert(errorWithContext.metadata.operation === 'initiateCall', 'Should preserve operation from context');
  assert(errorWithContext.metadata.callId === 'call_abc', 'Should preserve callId from context');
  assert(errorWithContext.metadata.phoneNumber === '+1234567890', 'Should preserve phoneNumber from context');
  assert(errorWithContext.metadata.providerRequestId === 'req_123', 'Should include request_id from provider error');
  assert(errorWithContext.metadata.providerStatus === 401, 'Should include status from provider error');
  console.log('   ✅ Context and metadata preserved correctly');

  console.log('✅ PASS: Test 11');
  passedTests++;
} catch (error) {
  console.log(`❌ FAIL: Test 11 - ${error.message}`);
  failedTests++;
}

// ============================================================================
// Test 12: Error metadata includes provider information
// ============================================================================
console.log('\nTest 12: Mapped errors include provider information');
try {
  const mappedError = mapTelnyxError({
    status: 401,
    message: 'Unauthorized'
  });

  assert(mappedError !== null, 'Mapped error should exist');
  assert(mappedError.message !== null, 'Mapped error should have message');
  assert(mappedError.metadata !== null, 'Mapped error should have metadata');
  assert(mappedError.metadata.provider === 'telnyx', 'Should include provider in metadata');
  assert(mappedError.metadata.providerStatus === 401, 'Should include status from provider error');
  assert(mappedError.timestamp !== null, 'Should include timestamp');
  console.log('   ✅ Mapped errors include metadata for debugging');

  console.log('✅ PASS: Test 12');
  passedTests++;
} catch (error) {
  console.log(`❌ FAIL: Test 12 - ${error.message}`);
  failedTests++;
}

// ============================================================================
// Print Summary
// ============================================================================
console.log('\n' + '='.repeat(70));
console.log('TEST SUMMARY');
console.log('='.repeat(70));
console.log(`Total Tests: ${passedTests + failedTests}`);
console.log(`Passed: ${passedTests}`);
console.log(`Failed: ${failedTests}`);
console.log(`Success Rate: ${((passedTests / (passedTests + failedTests)) * 100).toFixed(1)}%`);
console.log('='.repeat(70));

if (failedTests === 0) {
  console.log('\n✅ All tests passed! Feature #260 is complete.\n');
  process.exit(0);
} else {
  console.log(`\n❌ ${failedTests} test(s) failed. Please review the implementation.\n`);
  process.exit(1);
}
