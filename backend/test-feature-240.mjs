/**
 * Feature #240: Provider-specific errors map to common error types
 *
 * Test suite to verify the unified telephony error handling system.
 *
 * Feature Requirements:
 * 1. Define TelephonyError base class
 * 2. Create specific error types (AuthenticationError, RateLimitError, CallFailedError, NetworkError)
 * 3. Implement Telnyx error mapper
 * 4. Implement SignalWire error mapper
 * 5. Verify all provider errors map to common types
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
  mapTelnyxError,
  mapSignalWireError,
  mapProviderError,
  isTelephonyError,
  isRetryableError,
  getUserFriendlyMessage
} from './src/providers/telephony-errors.js';

// ANSI color codes for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m'
};

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`${colors.green}✓${colors.reset} ${name}`);
    testsPassed++;
  } catch (error) {
    console.log(`${colors.red}✗${colors.reset} ${name}`);
    console.log(`  ${colors.red}Error: ${error.message}${colors.reset}`);
    testsFailed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertInstanceOf(value, constructor, message) {
  if (!(value instanceof constructor)) {
    throw new Error(message || `Expected ${value} to be instance of ${constructor.name}`);
  }
}

console.log(`${colors.blue}═══════════════════════════════════════════════════════════════${colors.reset}`);
console.log(`${colors.blue}Feature #240: Provider-specific errors map to common error types${colors.reset}`);
console.log(`${colors.blue}═══════════════════════════════════════════════════════════════${colors.reset}\n`);

// ============================================================================
// STEP 1: Define TelephonyError base class
// ============================================================================

console.log(`${colors.yellow}Step 1: TelephonyError base class${colors.reset}`);

test('1.1 TelephonyError class is defined', () => {
  assert(typeof TelephonyError === 'function', 'TelephonyError should be a class');
});

test('1.2 TelephonyError has required properties', () => {
  const error = new TelephonyError('Test error', 'TEST_CODE', { key: 'value' });
  assert(error.message === 'Test error', 'Should have message property');
  assert(error.code === 'TEST_CODE', 'Should have code property');
  assert(error.name === 'TelephonyError', 'Should have name property');
  assert(error.timestamp !== undefined, 'Should have timestamp property');
  assert(typeof error.metadata === 'object', 'Should have metadata property');
});

test('1.3 TelephonyError extends Error', () => {
  const error = new TelephonyError('Test');
  assert(error instanceof Error, 'Should be instance of Error');
  assertInstanceOf(error, TelephonyError, 'Should be instance of TelephonyError');
});

test('1.4 TelephonyError has toJSON method', () => {
  const error = new TelephonyError('Test error', 'TEST_CODE', { key: 'value' });
  const json = error.toJSON();
  assert(typeof json === 'object', 'toJSON should return object');
  assert(json.message === 'Test error', 'JSON should include message');
  assert(json.code === 'TEST_CODE', 'JSON should include code');
  assert(json.metadata.key === 'value', 'JSON should include metadata');
});

test('1.5 TelephonyError has isCode method', () => {
  const error = new TelephonyError('Test', 'SPECIFIC_CODE');
  assert(error.isCode('SPECIFIC_CODE') === true, 'isCode should return true for matching code');
  assert(error.isCode('OTHER_CODE') === false, 'isCode should return false for non-matching code');
});

// ============================================================================
// STEP 2: Create specific error types
// ============================================================================

console.log(`\n${colors.yellow}Step 2: Specific error types${colors.reset}`);

test('2.1 AuthenticationError is defined', () => {
  const error = new AuthenticationError('Auth failed');
  assertInstanceOf(error, TelephonyError, 'Should extend TelephonyError');
  assertInstanceOf(error, AuthenticationError, 'Should be AuthenticationError');
  assert(error.code === 'AUTHENTICATION_ERROR', 'Should have correct error code');
});

test('2.2 RateLimitError is defined', () => {
  const error = new RateLimitError('Rate limit exceeded', { limit: 100, remaining: 0 });
  assertInstanceOf(error, TelephonyError, 'Should extend TelephonyError');
  assertInstanceOf(error, RateLimitError, 'Should be RateLimitError');
  assert(error.code === 'RATE_LIMIT_ERROR', 'Should have correct error code');
  assert(error.metadata.limit === 100, 'Should include limit metadata');
});

test('2.3 CallFailedError is defined', () => {
  const error = new CallFailedError('Call failed', { callId: '12345' });
  assertInstanceOf(error, TelephonyError, 'Should extend TelephonyError');
  assertInstanceOf(error, CallFailedError, 'Should be CallFailedError');
  assert(error.code === 'CALL_FAILED_ERROR', 'Should have correct error code');
  assert(error.metadata.callId === '12345', 'Should include callId metadata');
});

test('2.4 NetworkError is defined', () => {
  const error = new NetworkError('Network error', { host: 'api.example.com' });
  assertInstanceOf(error, TelephonyError, 'Should extend TelephonyError');
  assertInstanceOf(error, NetworkError, 'Should be NetworkError');
  assert(error.code === 'NETWORK_ERROR', 'Should have correct error code');
});

test('2.5 Additional error types are defined', () => {
  const validationError = new ValidationError('Validation failed');
  assertInstanceOf(validationError, ValidationError, 'ValidationError should exist');

  const configError = new ConfigurationError('Config error');
  assertInstanceOf(configError, ConfigurationError, 'ConfigurationError should exist');

  const notFoundError = new ResourceNotFoundError('Not found');
  assertInstanceOf(notFoundError, ResourceNotFoundError, 'ResourceNotFoundError should exist');

  const permissionError = new PermissionDeniedError('Permission denied');
  assertInstanceOf(permissionError, PermissionDeniedError, 'PermissionDeniedError should exist');

  const serviceError = new ServiceUnavailableError('Service unavailable');
  assertInstanceOf(serviceError, ServiceUnavailableError, 'ServiceUnavailableError should exist');

  const timeoutError = new TimeoutError('Timeout', { duration: 30000 });
  assertInstanceOf(timeoutError, TimeoutError, 'TimeoutError should exist');
  assert(timeoutError.code === 'TIMEOUT_ERROR', 'TimeoutError should have correct code');
});

// ============================================================================
// STEP 3: Implement Telnyx error mapper
// ============================================================================

console.log(`\n${colors.yellow}Step 3: Telnyx error mapper${colors.reset}`);

test('3.1 mapTelnyxError function exists', () => {
  assert(typeof mapTelnyxError === 'function', 'mapTelnyxError should be a function');
});

test('3.2 Telnyx 401 maps to AuthenticationError', () => {
  const telnyxError = { status: 401, message: 'Unauthorized' };
  const mapped = mapTelnyxError(telnyxError);
  assertInstanceOf(mapped, AuthenticationError, '401 should map to AuthenticationError');
  assert(mapped.metadata.provider === 'telnyx', 'Should include provider name');
});

test('3.3 Telnyx 429 maps to RateLimitError', () => {
  const telnyxError = {
    status: 429,
    message: 'Rate limit exceeded',
    details: { limit: 100, remaining: 0, reset_at: '2024-01-01T00:00:00Z' }
  };
  const mapped = mapTelnyxError(telnyxError);
  assertInstanceOf(mapped, RateLimitError, '429 should map to RateLimitError');
  assert(mapped.metadata.limit === 100, 'Should include rate limit metadata');
});

test('3.4 Telnyx call_failed maps to CallFailedError', () => {
  const telnyxError = { code: 'call_failed', message: 'Call failed' };
  const mapped = mapTelnyxError(telnyxError, { callId: 'abc123' });
  assertInstanceOf(mapped, CallFailedError, 'call_failed should map to CallFailedError');
  assert(mapped.metadata.providerCode === 'call_failed', 'Should include provider code');
});

test('3.5 Telnyx network_error maps to NetworkError', () => {
  const telnyxError = { code: 'network_error', message: 'Network error' };
  const mapped = mapTelnyxError(telnyxError);
  assertInstanceOf(mapped, NetworkError, 'network_error should map to NetworkError');
});

test('3.6 Telnyx invalid_phone_number maps to ValidationError', () => {
  const telnyxError = { code: 'invalid_phone_number', message: 'Invalid phone number' };
  const mapped = mapTelnyxError(telnyxError);
  assertInstanceOf(mapped, ValidationError, 'invalid_phone_number should map to ValidationError');
});

test('3.7 Telnyx not_found maps to ResourceNotFoundError', () => {
  const telnyxError = { code: 'call_not_found', message: 'Call not found' };
  const mapped = mapTelnyxError(telnyxError);
  assertInstanceOf(mapped, ResourceNotFoundError, 'not_found should map to ResourceNotFoundError');
});

test('3.8 Telnyx 403 maps to PermissionDeniedError', () => {
  const telnyxError = { status: 403, message: 'Forbidden' };
  const mapped = mapTelnyxError(telnyxError);
  assertInstanceOf(mapped, PermissionDeniedError, '403 should map to PermissionDeniedError');
});

test('3.9 Telnyx 500 maps to ServiceUnavailableError', () => {
  const telnyxError = { status: 500, message: 'Internal server error' };
  const mapped = mapTelnyxError(telnyxError);
  assertInstanceOf(mapped, ServiceUnavailableError, '500 should map to ServiceUnavailableError');
});

test('3.10 Telnyx connection_timeout maps to TimeoutError', () => {
  const telnyxError = { code: 'connection_timeout', message: 'Connection timeout' };
  const mapped = mapTelnyxError(telnyxError);
  assertInstanceOf(mapped, TimeoutError, 'connection_timeout should map to TimeoutError');
});

test('3.11 Telnyx error includes original error', () => {
  const telnyxError = { status: 401, message: 'Unauthorized', request_id: 'req-123' };
  const mapped = mapTelnyxError(telnyxError);
  assert(mapped.originalError !== null, 'Should include original error');
  assert(mapped.originalError.message === 'Unauthorized', 'Original error should have correct message');
});

test('3.12 Telnyx unknown error maps to TelephonyError', () => {
  const telnyxError = { code: 'unknown_error', message: 'Unknown error' };
  const mapped = mapTelnyxError(telnyxError);
  assertInstanceOf(mapped, TelephonyError, 'Unknown error should map to TelephonyError');
  assert(!(mapped instanceof AuthenticationError), 'Should not be specific error type');
});

// ============================================================================
// STEP 4: Implement SignalWire error mapper
// ============================================================================

console.log(`\n${colors.yellow}Step 4: SignalWire error mapper${colors.reset}`);

test('4.1 mapSignalWireError function exists', () => {
  assert(typeof mapSignalWireError === 'function', 'mapSignalWireError should be a function');
});

test('4.2 SignalWire 20003 maps to AuthenticationError', () => {
  const signalwireError = { code: '20003', message: 'Authentication Error - Invalid username' };
  const mapped = mapSignalWireError(signalwireError);
  assertInstanceOf(mapped, AuthenticationError, '20003 should map to AuthenticationError');
  assert(mapped.metadata.provider === 'signalwire', 'Should include provider name');
});

test('4.3 SignalWire 429 maps to RateLimitError', () => {
  const signalwireError = { status: 429, message: 'Rate limit exceeded' };
  const mapped = mapSignalWireError(signalwireError);
  assertInstanceOf(mapped, RateLimitError, '429 should map to RateLimitError');
});

test('4.4 SignalWire call_failed maps to CallFailedError', () => {
  const signalwireError = { code: 'call_failed', message: 'Call failed' };
  const mapped = mapSignalWireError(signalwireError, { callId: 'xyz789' });
  assertInstanceOf(mapped, CallFailedError, 'call_failed should map to CallFailedError');
});

test('4.5 SignalWire network_error maps to NetworkError', () => {
  const signalwireError = { code: 'network_error', message: 'Network error' };
  const mapped = mapSignalWireError(signalwireError);
  assertInstanceOf(mapped, NetworkError, 'network_error should map to NetworkError');
});

test('4.6 SignalWire 21614 maps to ValidationError', () => {
  const signalwireError = { code: '21614', message: 'To number is not valid' };
  const mapped = mapSignalWireError(signalwireError);
  assertInstanceOf(mapped, ValidationError, '21614 should map to ValidationError');
});

test('4.7 SignalWire not_found maps to ResourceNotFoundError', () => {
  const signalwireError = { code: 'call_not_found', message: 'Call not found' };
  const mapped = mapSignalWireError(signalwireError);
  assertInstanceOf(mapped, ResourceNotFoundError, 'not_found should map to ResourceNotFoundError');
});

test('4.8 SignalWire 403 maps to PermissionDeniedError', () => {
  const signalwireError = { status: 403, message: 'Forbidden' };
  const mapped = mapSignalWireError(signalwireError);
  assertInstanceOf(mapped, PermissionDeniedError, '403 should map to PermissionDeniedError');
});

test('4.9 SignalWire 500 maps to ServiceUnavailableError', () => {
  const signalwireError = { status: 500, message: 'Internal server error' };
  const mapped = mapSignalWireError(signalwireError);
  assertInstanceOf(mapped, ServiceUnavailableError, '500 should map to ServiceUnavailableError');
});

test('4.10 SignalWire request_timeout maps to TimeoutError', () => {
  const signalwireError = { code: 'request_timeout', message: 'Request timeout' };
  const mapped = mapSignalWireError(signalwireError);
  assertInstanceOf(mapped, TimeoutError, 'request_timeout should map to TimeoutError');
});

test('4.11 SignalWire error includes call_sid in metadata', () => {
  const signalwireError = { code: 'call_failed', call_sid: 'CA123456789' };
  const mapped = mapSignalWireError(signalwireError);
  assert(mapped.metadata.callId === 'CA123456789', 'Should include call_sid as callId');
});

test('4.12 SignalWire error includes account_sid in metadata', () => {
  const signalwireError = { code: 'call_failed', account_sid: 'AC987654321' };
  const mapped = mapSignalWireError(signalwireError);
  assert(mapped.metadata.providerAccountSid === 'AC987654321', 'Should include account_sid');
});

test('4.13 SignalWire unknown error maps to TelephonyError', () => {
  const signalwireError = { code: 'unknown_code', message: 'Unknown error' };
  const mapped = mapSignalWireError(signalwireError);
  assertInstanceOf(mapped, TelephonyError, 'Unknown error should map to TelephonyError');
  assert(!(mapped instanceof AuthenticationError), 'Should not be specific error type');
});

// ============================================================================
// STEP 5: Verify all provider errors map to common types
// ============================================================================

console.log(`\n${colors.yellow}Step 5: Unified error mapping${colors.reset}`);

test('5.1 mapProviderError routes to Telnyx mapper', () => {
  const telnyxError = { status: 401, message: 'Unauthorized' };
  const mapped = mapProviderError(telnyxError, 'telnyx');
  assertInstanceOf(mapped, AuthenticationError, 'Should route to Telnyx mapper');
  assert(mapped.metadata.provider === 'telnyx', 'Should preserve provider name');
});

test('5.2 mapProviderError routes to SignalWire mapper', () => {
  const signalwireError = { code: '20003', message: 'Auth error' };
  const mapped = mapProviderError(signalwireError, 'signalwire');
  assertInstanceOf(mapped, AuthenticationError, 'Should route to SignalWire mapper');
  assert(mapped.metadata.provider === 'signalwire', 'Should preserve provider name');
});

test('5.3 mapProviderError handles unknown provider', () => {
  const error = { message: 'Unknown provider error' };
  const mapped = mapProviderError(error, 'unknown_provider');
  assertInstanceOf(mapped, TelephonyError, 'Should return TelephonyError for unknown provider');
  assert(mapped.code === 'PROVIDER_ERROR', 'Should use PROVIDER_ERROR code');
});

test('5.4 mapProviderError handles null error', () => {
  const mapped = mapProviderError(null, 'telnyx');
  assertInstanceOf(mapped, TelephonyError, 'Should return TelephonyError for null error');
  assert(mapped.code === 'UNKNOWN_ERROR', 'Should use UNKNOWN_ERROR code');
});

test('5.5 isTelephonyError correctly identifies errors', () => {
  const telephonyError = new AuthenticationError('Auth failed');
  assert(isTelephonyError(telephonyError) === true, 'Should identify TelephonyError');

  const regularError = new Error('Regular error');
  assert(isTelephonyError(regularError) === false, 'Should not identify regular Error');
});

test('5.6 isRetryableError identifies retryable errors', () => {
  const rateLimitError = new RateLimitError('Rate limited');
  assert(isRetryableError(rateLimitError) === true, 'RateLimitError should be retryable');

  const networkError = new NetworkError('Network failed');
  assert(isRetryableError(networkError) === true, 'NetworkError should be retryable');

  const timeoutError = new TimeoutError('Timeout');
  assert(isRetryableError(timeoutError) === true, 'TimeoutError should be retryable');

  const serviceError = new ServiceUnavailableError('Service down');
  assert(isRetryableError(serviceError) === true, 'ServiceUnavailableError should be retryable');
});

test('5.7 isRetryableError rejects non-retryable errors', () => {
  const authError = new AuthenticationError('Auth failed');
  assert(isRetryableError(authError) === false, 'AuthenticationError should not be retryable');

  const validationError = new ValidationError('Invalid input');
  assert(isRetryableError(validationError) === false, 'ValidationError should not be retryable');

  const callFailedError = new CallFailedError('Call failed');
  assert(isRetryableError(callFailedError) === false, 'CallFailedError should not be retryable');
});

test('5.8 getUserFriendlyMessage returns user-friendly text', () => {
  const authError = new AuthenticationError('Invalid API key');
  const message = getUserFriendlyMessage(authError);
  assert(typeof message === 'string', 'Should return string');
  assert(message.includes('credentials') || message.includes('API'), 'Should mention credentials/API');
});

test('5.9 getUserFriendlyMessage handles all error codes', () => {
  const errors = [
    new AuthenticationError('Auth failed'),
    new RateLimitError('Rate limited'),
    new CallFailedError('Call failed'),
    new NetworkError('Network error'),
    new ValidationError('Invalid input'),
    new ConfigurationError('Config error'),
    new ResourceNotFoundError('Not found'),
    new PermissionDeniedError('Permission denied'),
    new ServiceUnavailableError('Service unavailable'),
    new TimeoutError('Timeout')
  ];

  errors.forEach(error => {
    const message = getUserFriendlyMessage(error);
    assert(typeof message === 'string', `Should return message for ${error.code}`);
    assert(message.length > 0, `Message should not be empty for ${error.code}`);
  });
});

test('5.10 getUserFriendlyMessage handles regular errors', () => {
  const regularError = new Error('Some error');
  const message = getUserFriendlyMessage(regularError);
  assert(typeof message === 'string', 'Should return string for regular error');
  assert(message.includes('unexpected') || message.includes('try again'), 'Should be generic message');
});

test('5.11 Error metadata includes context', () => {
  const telnyxError = { status: 401, message: 'Unauthorized' };
  const context = { callId: 'call-123', userId: 'user-456' };
  const mapped = mapTelnyxError(telnyxError, context);
  assert(mapped.metadata.callId === 'call-123', 'Should include callId from context');
  assert(mapped.metadata.userId === 'user-456', 'Should include userId from context');
});

test('5.12 Error can be serialized and logged', () => {
  const error = new RateLimitError('Rate limited', { limit: 100, remaining: 0 });
  const json = error.toJSON();
  assert(json.name === 'RateLimitError', 'JSON should include error name');
  assert(json.code === 'RATE_LIMIT_ERROR', 'JSON should include error code');
  assert(json.timestamp !== undefined, 'JSON should include timestamp');
  assert(json.metadata.limit === 100, 'JSON should include metadata');
});

// ============================================================================
// Summary
// ============================================================================

console.log(`\n${colors.blue}═══════════════════════════════════════════════════════════════${colors.reset}`);
console.log(`${colors.blue}Test Results${colors.reset}`);
console.log(`${colors.blue}═══════════════════════════════════════════════════════════════${colors.reset}`);
console.log(`${colors.green}Tests Passed: ${testsPassed}${colors.reset}`);
console.log(`${colors.red}Tests Failed: ${testsFailed}${colors.reset}`);
console.log(`${colors.blue}Total Tests: ${testsPassed + testsFailed}${colors.reset}`);
console.log(`${colors.blue}═══════════════════════════════════════════════════════════════${colors.reset}`);

if (testsFailed > 0) {
  process.exit(1);
} else {
  console.log(`\n${colors.green}✓ All tests passed! Feature #240 is complete.${colors.reset}\n`);
  process.exit(0);
}
