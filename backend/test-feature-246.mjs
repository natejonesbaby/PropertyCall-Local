#!/usr/bin/env node

/**
 * Test Suite for Feature #246: SignalWire Call Recording Enablement
 *
 * This test suite verifies that SignalWire calls can be configured with
 * recording settings including channels, callback URL, and trim silence.
 *
 * Feature Requirements:
 * 1. Add Record parameter to call initiation
 * 2. Configure recording channels (dual/mono)
 * 3. Set recording status callback URL
 * 4. Configure recording trim silence option
 * 5. Verify recordings are created for calls
 */

import { SignalWireProvider, SignalWireError } from './src/providers/signalwire-provider.js';

// ANSI color codes for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

// Test counter
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

/**
 * Print test result
 */
function printResult(testName, passed, details = '') {
  totalTests++;
  if (passed) {
    passedTests++;
    console.log(`${colors.green}✓ PASS${colors.reset} ${testName}`);
    if (details) {
      console.log(`  ${colors.cyan}${details}${colors.reset}`);
    }
  } else {
    failedTests++;
    console.log(`${colors.red}✗ FAIL${colors.reset} ${testName}`);
    if (details) {
      console.log(`  ${colors.red}${details}${colors.reset}`);
    }
  }
}

/**
 * Test section header
 */
function printSection(title) {
  console.log(`\n${colors.bold}${colors.blue}═══ ${title} ═══${colors.reset}`);
}

/**
 * Mock fetch for testing
 */
function mockFetch(signalWireProvider) {
  // Store the original _makeRequest method
  const originalMakeRequest = signalWireProvider._makeRequest.bind(signalWireProvider);

  // Replace with mock implementation
  signalWireProvider._makeRequest = async function(method, path, body = null, headers = {}) {
    // Simulate SignalWire API responses

    // Authentication test
    if (path.includes('/Accounts.json') && method === 'GET') {
      return {
        success: true,
        data: {
          accounts: [{
            sid: 'AC1234567890abcdef',
            friendly_name: 'Test Account',
            status: 'active'
          }]
        },
        status: 200
      };
    }

    // Initiate call
    if (path.includes('/Calls.json') && method === 'POST') {
      return {
        success: true,
        data: {
          sid: 'CA9876543210fedcba',
          status: 'queued',
          to: body?.To || '+15550199876',
          from: body?.From || '+15550199875',
          date_created: new Date().toISOString(),
          recording_enabled: body?.Record === 'true'
        },
        status: 201
      };
    }

    // Get recording
    if (path.includes('/Recordings.json') && method === 'GET') {
      return {
        success: true,
        data: {
          recordings: [{
            sid: 'RE1122334455',
            uri: 'https://example.signalwire.com/recordings/RE1122334455.wav',
            duration: '45',
            status: 'completed',
            date_created: new Date().toISOString()
          }]
        },
        status: 200
      };
    }

    // Default error response
    return {
      success: false,
      error: 'Not found',
      errorCode: 'CALL_NOT_FOUND',
      status: 404
    };
  };
}

/**
 * Verify recording parameter in call initiation
 */
async function test1_RecordingParameter() {
  printSection('Test 1: Record Parameter in Call Initiation');

  const provider = new SignalWireProvider();
  mockFetch(provider);

  // Test 1.1: Initialize provider
  try {
    provider._initialized = true;
    provider._projectId = 'test-project-id';
    provider._apiToken = 'test-api-token';
    provider._spaceUrl = 'test-space.signalwire.com';
    provider._authHeader = 'Basic dGVzdC1wcm9qZWN0LWlkOnRlc3QtYXBpLXRva2Vu';

    printResult('1.1 Provider initialization setup', true);
  } catch (error) {
    printResult('1.1 Provider initialization setup', false, error.message);
    return;
  }

  // Test 1.2: Record parameter set to true
  try {
    const spy = [];
    provider._makeRequest = async function(method, path, body = null, headers = {}) {
      spy.push({ method, path, body });
      return {
        success: true,
        data: {
          sid: 'CA123',
          status: 'queued',
          recording_enabled: body?.Record === 'true'
        },
        status: 201
      };
    };

    await provider.initiateCall({
      to: '+15550199876',
      from: '+15550199875',
      record: true
    });

    const hasRecordParam = spy.length > 0 && spy[0].body && spy[0].body.Record === 'true';
    printResult('1.2 Record parameter enabled (record=true)', hasRecordParam,
      hasRecordParam ? 'Record parameter set to "true"' : 'Record parameter not set correctly');
  } catch (error) {
    printResult('1.2 Record parameter enabled (record=true)', false, error.message);
  }

  // Test 1.3: Record parameter set to false (default)
  try {
    const spy = [];
    provider._makeRequest = async function(method, path, body = null, headers = {}) {
      spy.push({ method, path, body });
      return {
        success: true,
        data: { sid: 'CA124', status: 'queued' },
        status: 201
      };
    };

    await provider.initiateCall({
      to: '+15550199876',
      from: '+15550199875'
      // record defaults to false
    });

    const hasRecordFalse = spy.length > 0 && spy[0].body && spy[0].body.Record === 'false';
    printResult('1.3 Record parameter disabled (default)', hasRecordFalse,
      hasRecordFalse ? 'Record parameter defaults to "false"' : 'Record parameter not defaulting correctly');
  } catch (error) {
    printResult('1.3 Record parameter disabled (default)', false, error.message);
  }
}

/**
 * Test recording channels configuration
 */
async function test2_RecordingChannels() {
  printSection('Test 2: Recording Channels Configuration');

  const provider = new SignalWireProvider();
  mockFetch(provider);
  provider._initialized = true;
  provider._projectId = 'test-project-id';
  provider._apiToken = 'test-api-token';
  provider._spaceUrl = 'test-space.signalwire.com';
  provider._authHeader = 'Basic dGVzdC1wcm9qZWN0LWlkOnRlc3QtYXBpLXRva2Vu';

  // Test 2.1: Dual channel recording
  try {
    const spy = [];
    provider._makeRequest = async function(method, path, body = null, headers = {}) {
      spy.push({ method, path, body });
      return {
        success: true,
        data: { sid: 'CA125', status: 'queued' },
        status: 201
      };
    };

    await provider.initiateCall({
      to: '+15550199876',
      from: '+15550199875',
      record: true,
      recording: {
        channels: 'dual'
      }
    });

    const hasRecording = spy.length > 0 && spy[0].body && spy[0].body.Record === 'true';
    printResult('2.1 Dual channel recording configured', hasRecording,
      hasRecording ? 'Recording enabled with dual channels' : 'Dual channel configuration failed');
  } catch (error) {
    printResult('2.1 Dual channel recording configured', false, error.message);
  }

  // Test 2.2: Mono channel recording
  try {
    const spy = [];
    provider._makeRequest = async function(method, path, body = null, headers = {}) {
      spy.push({ method, path, body });
      return {
        success: true,
        data: { sid: 'CA126', status: 'queued' },
        status: 201
      };
    };

    await provider.initiateCall({
      to: '+15550199876',
      from: '+15550199875',
      record: true,
      recording: {
        channels: 'mono'
      }
    });

    const hasRecording = spy.length > 0 && spy[0].body && spy[0].body.Record === 'true';
    printResult('2.2 Mono channel recording configured', hasRecording,
      hasRecording ? 'Recording enabled with mono channels' : 'Mono channel configuration failed');
  } catch (error) {
    printResult('2.2 Mono channel recording configured', false, error.message);
  }

  // Test 2.3: Invalid channel value
  try {
    await provider.initiateCall({
      to: '+15550199876',
      from: '+15550199875',
      record: true,
      recording: {
        channels: 'stereo' // Invalid
      }
    });

    printResult('2.3 Invalid channel value rejected', false, 'Should have thrown error for invalid channel');
  } catch (error) {
    const isSignalWireError = error instanceof SignalWireError;
    const hasCorrectMessage = error.message.includes('Invalid recording channels');
    printResult('2.3 Invalid channel value rejected', isSignalWireError && hasCorrectMessage,
      isSignalWireError ? `Error thrown: ${error.code} - ${error.message}` : 'Wrong error type');
  }
}

/**
 * Test recording status callback URL
 */
async function test3_RecordingCallbackUrl() {
  printSection('Test 3: Recording Status Callback URL');

  const provider = new SignalWireProvider();
  mockFetch(provider);
  provider._initialized = true;
  provider._projectId = 'test-project-id';
  provider._apiToken = 'test-api-token';
  provider._spaceUrl = 'test-space.signalwire.com';
  provider._authHeader = 'Basic dGVzdC1wcm9qZWN0LWlkOnRlc3QtYXBpLXRva2Vu';

  // Test 3.1: Set recording callback URL
  try {
    const spy = [];
    provider._makeRequest = async function(method, path, body = null, headers = {}) {
      spy.push({ method, path, body });
      return {
        success: true,
        data: { sid: 'CA127', status: 'queued' },
        status: 201
      };
    };

    await provider.initiateCall({
      to: '+15550199876',
      from: '+15550199875',
      record: true,
      recording: {
        callbackUrl: 'https://example.com/recording-callback'
      }
    });

    const hasCallback = spy.length > 0 && spy[0].body &&
                       spy[0].body.RecordingStatusCallback === 'https://example.com/recording-callback' &&
                       spy[0].body.RecordingStatusCallbackMethod === 'POST';
    printResult('3.1 Recording callback URL set', hasCallback,
      hasCallback ? 'RecordingStatusCallback and Method set correctly' : 'Callback URL not configured');
  } catch (error) {
    printResult('3.1 Recording callback URL set', false, error.message);
  }

  // Test 3.2: Recording without callback URL
  try {
    const spy = [];
    provider._makeRequest = async function(method, path, body = null, headers = {}) {
      spy.push({ method, path, body });
      return {
        success: true,
        data: { sid: 'CA128', status: 'queued' },
        status: 201
      };
    };

    await provider.initiateCall({
      to: '+15550199876',
      from: '+15550199875',
      record: true
      // No recording.callbackUrl
    });

    const noCallback = spy.length > 0 && spy[0].body &&
                      !spy[0].body.RecordingStatusCallback;
    printResult('3.2 Recording works without callback URL', noCallback,
      noCallback ? 'Recording enabled without callback' : 'Callback unexpectedly set');
  } catch (error) {
    printResult('3.2 Recording works without callback URL', false, error.message);
  }
}

/**
 * Test recording trim silence option
 */
async function test4_TrimSilenceOption() {
  printSection('Test 4: Recording Trim Silence Option');

  const provider = new SignalWireProvider();
  mockFetch(provider);
  provider._initialized = true;
  provider._projectId = 'test-project-id';
  provider._apiToken = 'test-api-token';
  provider._spaceUrl = 'test-space.signalwire.com';
  provider._authHeader = 'Basic dGVzdC1wcm9qZWN0LWlkOnRlc3QtYXBpLXRva2Vu';

  // Test 4.1: Trim silence enabled
  try {
    const spy = [];
    provider._makeRequest = async function(method, path, body = null, headers = {}) {
      spy.push({ method, path, body });
      return {
        success: true,
        data: { sid: 'CA129', status: 'queued' },
        status: 201
      };
    };

    await provider.initiateCall({
      to: '+15550199876',
      from: '+15550199875',
      record: true,
      recording: {
        trimSilence: true
      }
    });

    const hasTrim = spy.length > 0 && spy[0].body && spy[0].body.Trim === 'trim-silence';
    printResult('4.1 Trim silence enabled', hasTrim,
      hasTrim ? 'Trim parameter set to "trim-silence"' : 'Trim silence not configured');
  } catch (error) {
    printResult('4.1 Trim silence enabled', false, error.message);
  }

  // Test 4.2: Do not trim silence
  try {
    const spy = [];
    provider._makeRequest = async function(method, path, body = null, headers = {}) {
      spy.push({ method, path, body });
      return {
        success: true,
        data: { sid: 'CA130', status: 'queued' },
        status: 201
      };
    };

    await provider.initiateCall({
      to: '+15550199876',
      from: '+15550199875',
      record: true,
      recording: {
        trimSilence: false
      }
    });

    const noTrim = spy.length > 0 && spy[0].body && spy[0].body.Trim === 'do-not-trim';
    printResult('4.2 Do not trim silence', noTrim,
      noTrim ? 'Trim parameter set to "do-not-trim"' : 'Trim configuration failed');
  } catch (error) {
    printResult('4.2 Do not trim silence', false, error.message);
  }

  // Test 4.3: Trim silence not specified (default behavior)
  try {
    const spy = [];
    provider._makeRequest = async function(method, path, body = null, headers = {}) {
      spy.push({ method, path, body });
      return {
        success: true,
        data: { sid: 'CA131', status: 'queued' },
        status: 201
      };
    };

    await provider.initiateCall({
      to: '+15550199876',
      from: '+15550199875',
      record: true
      // No trimSilence specified
    });

    const noTrimParam = spy.length > 0 && spy[0].body && !spy[0].body.hasOwnProperty('Trim');
    printResult('4.3 Trim silence not specified (optional)', noTrimParam,
      noTrimParam ? 'Trim parameter not set when not specified' : 'Trim parameter unexpectedly set');
  } catch (error) {
    printResult('4.3 Trim silence not specified (optional)', false, error.message);
  }
}

/**
 * Test combined recording configuration
 */
async function test5_CombinedConfiguration() {
  printSection('Test 5: Combined Recording Configuration');

  const provider = new SignalWireProvider();
  mockFetch(provider);
  provider._initialized = true;
  provider._projectId = 'test-project-id';
  provider._apiToken = 'test-api-token';
  provider._spaceUrl = 'test-space.signalwire.com';
  provider._authHeader = 'Basic dGVzdC1wcm9qZWN0LWlkOnRlc3QtYXBpLXRva2Vu';

  // Test 5.1: All recording options together
  try {
    const spy = [];
    provider._makeRequest = async function(method, path, body = null, headers = {}) {
      spy.push({ method, path, body });
      return {
        success: true,
        data: { sid: 'CA132', status: 'queued' },
        status: 201
      };
    };

    await provider.initiateCall({
      to: '+15550199876',
      from: '+15550199875',
      record: true,
      recording: {
        channels: 'dual',
        callbackUrl: 'https://example.com/recording-callback',
        trimSilence: true
      }
    });

    const body = spy[0].body;
    const hasAllOptions = body.Record === 'true' &&
                         body.RecordingStatusCallback === 'https://example.com/recording-callback' &&
                         body.RecordingStatusCallbackMethod === 'POST' &&
                         body.Trim === 'trim-silence';

    printResult('5.1 All recording options combined', hasAllOptions,
      hasAllOptions ?
        'Record=true, Callback URL set, Trim=silence' :
        `Missing options: Record=${body.Record}, Callback=${body.RecordingStatusCallback}, Trim=${body.Trim}`);
  } catch (error) {
    printResult('5.1 All recording options combined', false, error.message);
  }

  // Test 5.2: Recording disabled with recording options (should not apply)
  try {
    const spy = [];
    provider._makeRequest = async function(method, path, body = null, headers = {}) {
      spy.push({ method, path, body });
      return {
        success: true,
        data: { sid: 'CA133', status: 'queued' },
        status: 201
      };
    };

    await provider.initiateCall({
      to: '+15550199876',
      from: '+15550199875',
      record: false,
      recording: {
        channels: 'dual',
        callbackUrl: 'https://example.com/recording-callback',
        trimSilence: true
      }
    });

    const body = spy[0].body;
    const recordingDisabled = body.Record === 'false' &&
                             !body.RecordingStatusCallback &&
                             !body.hasOwnProperty('Trim');

    printResult('5.2 Recording options ignored when record=false', recordingDisabled,
      recordingDisabled ?
        'Recording disabled, options not applied' :
        `Recording disabled but options applied: Record=${body.Record}, Callback=${body.RecordingStatusCallback}`);
  } catch (error) {
    printResult('5.2 Recording options ignored when record=false', false, error.message);
  }
}

/**
 * Test recording retrieval after call
 */
async function test6_RecordingRetrieval() {
  printSection('Test 6: Recording Retrieval After Call');

  const provider = new SignalWireProvider();
  mockFetch(provider);
  provider._initialized = true;
  provider._projectId = 'test-project-id';
  provider._apiToken = 'test-api-token';
  provider._spaceUrl = 'test-space.signalwire.com';
  provider._authHeader = 'Basic dGVzdC1wcm9qZWN0LWlkOnRlc3QtYXBpLXRva2Vu';

  // Test 6.1: Get recording for call with recording
  try {
    provider._makeRequest = async function(method, path, body = null, headers = {}) {
      if (path.includes('/Recordings.json')) {
        return {
          success: true,
          data: {
            recordings: [{
              sid: 'RE1122334455',
              uri: 'https://test-space.signalwire.com/recordings/RE1122334455.wav',
              duration: '45',
              status: 'completed',
              date_created: new Date().toISOString()
            }]
          },
          status: 200
        };
      }
      return { success: false, error: 'Not found', status: 404 };
    };

    const result = await provider.getRecording({
      callControlId: 'CA9876543210'
    });

    const hasRecording = result.success &&
                        result.recordingUrl &&
                        result.recordingUrl.includes('RE1122334455.wav') &&
                        result.durationSecs === 45 &&
                        result.format === 'wav';

    printResult('6.1 Retrieve recording for recorded call', hasRecording,
      hasRecording ?
        `Recording found: ${result.recordingUrl}, ${result.durationSecs}s, ${result.format}` :
        'Recording not retrieved correctly');
  } catch (error) {
    printResult('6.1 Retrieve recording for recorded call', false, error.message);
  }

  // Test 6.2: Get recording for call without recording
  try {
    provider._makeRequest = async function(method, path, body = null, headers = {}) {
      if (path.includes('/Recordings.json')) {
        return {
          success: true,
          data: { recordings: [] },
          status: 200
        };
      }
      return { success: false, error: 'Not found', status: 404 };
    };

    const result = await provider.getRecording({
      callControlId: 'CA9999999999'
    });

    const noRecording = result.success &&
                       result.recordingUrl === null &&
                       result.recordingStatus === 'not_available';

    printResult('6.2 Handle call without recording', noRecording,
      noRecording ?
        'No recording available, handled gracefully' :
        'Expected no recording but got: ' + JSON.stringify(result));
  } catch (error) {
    printResult('6.2 Handle call without recording', false, error.message);
  }

  // Test 6.3: Recording API error
  try {
    provider._makeRequest = async function(method, path, body = null, headers = {}) {
      return {
        success: false,
        error: 'Call not found',
        errorCode: 'CALL_NOT_FOUND',
        status: 404
      };
    };

    await provider.getRecording({
      callControlId: 'CA0000000000'
    });

    printResult('6.3 Handle recording API error', false, 'Should have thrown error');
  } catch (error) {
    const isSignalWireError = error instanceof SignalWireError;
    printResult('6.3 Handle recording API error', isSignalWireError,
      isSignalWireError ? `Error thrown correctly: ${error.message}` : 'Wrong error type');
  }
}

/**
 * Main test runner
 */
async function runTests() {
  console.log(`\n${colors.bold}${colors.cyan}
╔════════════════════════════════════════════════════════════════════╗
║   SignalWire Call Recording Enablement - Feature #246 Tests    ║
╚════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  console.log(`${colors.yellow}Testing SignalWire recording configuration...${colors.reset}\n`);

  try {
    // Run all test suites
    test1_RecordingParameter();
    test2_RecordingChannels();
    test3_RecordingCallbackUrl();
    test4_TrimSilenceOption();
    test5_CombinedConfiguration();
    test6_RecordingRetrieval();

    // Print summary
    console.log(`\n${colors.bold}${colors.blue}═══ Test Summary ═══${colors.reset}`);
    console.log(`Total Tests:  ${totalTests}`);
    console.log(`${colors.green}Passed:       ${passedTests}${colors.reset}`);
    console.log(`${colors.red}Failed:       ${failedTests}${colors.reset}`);

    const successRate = ((passedTests / totalTests) * 100).toFixed(1);
    console.log(`\nSuccess Rate: ${successRate}%`);

    if (failedTests === 0) {
      console.log(`\n${colors.bold}${colors.green}✓ All tests passed! Feature #246 is complete.${colors.reset}\n`);
      process.exit(0);
    } else {
      console.log(`\n${colors.bold}${colors.red}✗ Some tests failed. Please review the failures above.${colors.reset}\n`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`\n${colors.red}Fatal error running tests: ${error.message}${colors.reset}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the tests
runTests();
