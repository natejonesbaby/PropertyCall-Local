/**
 * Feature #249: SignalWire error handling and retry logic (Simplified)
 *
 * Verification Steps:
 * 1. Catch and classify SignalWire API errors
 * 2. Implement retry for 5xx errors
 * 3. Implement retry for rate limit errors with backoff
 * 4. Map errors to common TelephonyError types
 * 5. Log errors with context for debugging
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { SignalWireProvider, SignalWireError, SignalWireErrorCode } from './src/providers/signalwire-provider.js';

// Mock fetch for testing
let mockHandlers = {};
let requestLog = [];

global.fetch = async (url, options) => {
  // Log the request
  requestLog.push({ url, options, timestamp: Date.now() });

  const urlObj = new URL(url);
  const path = urlObj.pathname;

  // Find matching mock handler
  for (const pattern of Object.keys(mockHandlers)) {
    if (path.includes(pattern)) {
      const handler = mockHandlers[pattern];
      const result = typeof handler === 'function' ? await handler(url, options) : handler;
      return result;
    }
  }

  // Default 404 response
  return {
    ok: false,
    status: 404,
    json: async () => ({ error: 'Not found' }),
    text: async () => 'Not found',
    headers: {
      get: (name) => name === 'content-type' ? 'application/json' : null
    }
  };
};

/**
 * Set up mock handlers
 */
function setupMocks(handlers) {
  mockHandlers = { ...handlers };
  requestLog = [];
}

/**
 * Create mock response
 */
function createMockResponse(status, data, contentType = 'application/json', extraHeaders = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => typeof data === 'string' ? data : JSON.stringify(data),
    headers: {
      get: (name) => {
        if (name === 'content-type') return contentType;
        if (name === 'retry-after') return extraHeaders['retry-after'] || null;
        return null;
      }
    }
  };
}

describe('Feature #249: SignalWire Error Handling and Retry Logic', () => {

  let provider;

  beforeEach(() => {
    provider = new SignalWireProvider();
    mockHandlers = {};
    requestLog = [];
  });

  afterEach(() => {
    mockHandlers = {};
    requestLog = [];
  });

  // ==========================================================================
  // Helper function to initialize provider with mocked auth
  // ==========================================================================

  async function initProvider() {
    setupMocks({
      'Accounts.json': createMockResponse(200, {
        accounts: [{ sid: 'test-account' }]
      })
    });

    await provider.initialize('test-key', {
      projectId: 'test-project',
      apiToken: 'test-token',
      spaceUrl: 'test.signalwire.com'
    });
  }

  // ==========================================================================
  // TEST 1: Catch and classify SignalWire API errors
  // ==========================================================================

  describe('Test 1: Catch and classify SignalWire API errors', () => {

    it('1.1: Should catch 401 authentication errors', async () => {
      setupMocks({
        'Accounts.json': createMockResponse(401, {
          status: '401',
          message: 'Authentication failed - invalid credentials'
        })
      });

      await assert.rejects(
        async () => {
          await provider.initialize('test-key', {
            projectId: 'test-project',
            apiToken: 'invalid-token',
            spaceUrl: 'test.signalwire.com'
          });
        },
        (error) => {
          assert.ok(error instanceof SignalWireError);
          assert.strictEqual(error.code, SignalWireErrorCode.INVALID_CREDENTIALS);
          assert.ok(error.message.includes('Authentication'));
          return true;
        }
      );
    });

    it('1.2: Should catch 403 forbidden errors', async () => {
      await initProvider();

      setupMocks({
        'Accounts.json': createMockResponse(200, { accounts: [{ sid: 'test-account' }] }),
        'Calls.json': createMockResponse(403, {
          status: '403',
          message: 'Forbidden - insufficient permissions'
        })
      });

      await assert.rejects(
        async () => {
          await provider.initiateCall({
            to: '+1234567890',
            from: '+0987654321'
          });
        },
        (error) => {
          assert.ok(error instanceof SignalWireError);
          assert.strictEqual(error.code, SignalWireErrorCode.AUTHENTICATION_FAILED);
          assert.ok(error.message.includes('Access denied'));
          return true;
        }
      );
    });

    it('1.3: Should catch 404 not found errors', async () => {
      await initProvider();

      setupMocks({
        'Accounts.json': createMockResponse(200, { accounts: [{ sid: 'test-account' }] }),
        'Calls': createMockResponse(404, {
          status: '404',
          message: 'Call not found'
        })
      });

      await assert.rejects(
        async () => {
          await provider.getCallStatus({ callControlId: 'non-existent-call' });
        },
        (error) => {
          assert.ok(error instanceof SignalWireError);
          assert.strictEqual(error.code, SignalWireErrorCode.CALL_NOT_FOUND);
          return true;
        }
      );
    });

    it('1.4: Should catch 400 validation errors', async () => {
      await initProvider();

      setupMocks({
        'Accounts.json': createMockResponse(200, { accounts: [{ sid: 'test-account' }] }),
        'Calls.json': createMockResponse(400, {
          status: '400',
          message: 'Invalid phone number format',
          code: '21614'
        })
      });

      await assert.rejects(
        async () => {
          await provider.initiateCall({
            to: 'invalid-phone',
            from: '+0987654321'
          });
        },
        (error) => {
          assert.ok(error instanceof SignalWireError);
          assert.ok(error.message.includes('Invalid phone number') || error.message.includes('Invalid request'));
          return true;
        }
      );
    });

    it('1.5: Should catch network errors', async () => {
      await initProvider();

      setupMocks({
        'Accounts.json': createMockResponse(200, { accounts: [{ sid: 'test-account' }] }),
        'Calls.json': () => { throw new Error('ECONNREFUSED'); }
      });

      await assert.rejects(
        async () => {
          await provider.initiateCall({
            to: '+1234567890',
            from: '+0987654321'
          });
        },
        (error) => {
          assert.ok(error instanceof SignalWireError);
          assert.strictEqual(error.code, SignalWireErrorCode.API_REQUEST_FAILED);
          return true;
        }
      );
    });

    it('1.6: Should catch timeout errors', async () => {
      setupMocks({
        'Accounts.json': createMockResponse(200, { accounts: [{ sid: 'test-account' }] }),
        'Calls.json': () => new Promise(resolve => {
          setTimeout(() => resolve(createMockResponse(200, { sid: 'test-call' })), 200);
        })
      });

      await provider.initialize('test-key', {
        projectId: 'test-project',
        apiToken: 'test-token',
        spaceUrl: 'test.signalwire.com',
        timeout: 100
      });

      setupMocks({
        'Accounts.json': createMockResponse(200, { accounts: [{ sid: 'test-account' }] }),
        'Calls.json': () => new Promise(resolve => {
          setTimeout(() => resolve(createMockResponse(200, { sid: 'test-call' })), 200);
        })
      });

      await assert.rejects(
        async () => {
          await provider.initiateCall({
            to: '+1234567890',
            from: '+0987654321'
          });
        },
        (error) => {
          assert.ok(error instanceof SignalWireError);
          assert.ok(error.message.includes('timeout'));
          return true;
        }
      );
    });
  });

  // ==========================================================================
  // TEST 2: Implement retry for 5xx errors
  // ==========================================================================

  describe('Test 2: Implement retry for 5xx errors', () => {

    it('2.1: Should retry once on 500 error', async () => {
      await initProvider();

      let requestCount = 0;
      setupMocks({
        'Accounts.json': createMockResponse(200, { accounts: [{ sid: 'test-account' }] }),
        'Calls.json': () => {
          requestCount++;
          if (requestCount === 1) {
            return createMockResponse(500, { status: '500', message: 'Internal server error' });
          }
          return createMockResponse(200, {
            sid: 'CA123456789',
            status: 'queued'
          });
        }
      });

      const startTime = Date.now();
      const result = await provider.initiateCall({
        to: '+1234567890',
        from: '+0987654321'
      });
      const elapsed = Date.now() - startTime;

      assert.strictEqual(result.success, true);
      assert.strictEqual(requestCount, 2, 'Should retry once after 500 error');
      assert.ok(elapsed >= 1000, `Should wait at least 1s before retry, took ${elapsed}ms`);
    });

    it('2.2: Should retry once on 502 error', async () => {
      await initProvider();

      let requestCount = 0;
      setupMocks({
        'Accounts.json': createMockResponse(200, { accounts: [{ sid: 'test-account' }] }),
        'Calls.json': () => {
          requestCount++;
          if (requestCount === 1) {
            return createMockResponse(502, { status: '502', message: 'Bad gateway' });
          }
          return createMockResponse(200, { sid: 'CA123456789', status: 'queued' });
        }
      });

      const result = await provider.initiateCall({
        to: '+1234567890',
        from: '+0987654321'
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(requestCount, 2, 'Should retry once after 502 error');
    });

    it('2.3: Should retry once on 503 error', async () => {
      await initProvider();

      let requestCount = 0;
      setupMocks({
        'Accounts.json': createMockResponse(200, { accounts: [{ sid: 'test-account' }] }),
        'Calls.json': () => {
          requestCount++;
          if (requestCount === 1) {
            return createMockResponse(503, { status: '503', message: 'Service unavailable' });
          }
          return createMockResponse(200, { sid: 'CA123456789', status: 'queued' });
        }
      });

      const result = await provider.initiateCall({
        to: '+1234567890',
        from: '+0987654321'
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(requestCount, 2, 'Should retry once after 503 error');
    });

    it('2.4: Should fail after max retries for persistent 500 errors', async () => {
      await initProvider();

      setupMocks({
        'Accounts.json': createMockResponse(200, { accounts: [{ sid: 'test-account' }] }),
        'Calls.json': () => createMockResponse(500, { status: '500', message: 'Internal server error' })
      });

      await assert.rejects(
        async () => {
          await provider.initiateCall({
            to: '+1234567890',
            from: '+0987654321'
          });
        },
        (error) => {
          assert.ok(error instanceof SignalWireError);
          assert.ok(error.message.includes('500') || error.message.includes('Internal server error'));
          return true;
        }
      );

      // Should have made 3 requests (1 initial + 2 retries)
      const callRequests = requestLog.filter(req => req.url.includes('Calls'));
      assert.ok(callRequests.length >= 3, `Should attempt at least 3 times, got ${callRequests.length}`);
    });

    it('2.5: Should use exponential backoff between retries', async () => {
      await initProvider();

      let requestCount = 0;
      setupMocks({
        'Accounts.json': createMockResponse(200, { accounts: [{ sid: 'test-account' }] }),
        'Calls.json': () => {
          requestCount++;
          if (requestCount < 3) {
            return createMockResponse(503, { status: '503', message: 'Service unavailable' });
          }
          return createMockResponse(200, { sid: 'CA123456789', status: 'queued' });
        }
      });

      const result = await provider.initiateCall({
        to: '+1234567890',
        from: '+0987654321'
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(requestCount, 3, 'Should make 3 requests');

      // Check exponential backoff
      const callRequests = requestLog.filter(req => req.url.includes('Calls'));
      const delay1 = callRequests[1].timestamp - callRequests[0].timestamp;
      const delay2 = callRequests[2].timestamp - callRequests[1].timestamp;

      assert.ok(delay2 >= delay1, `Second delay (${delay2}ms) should be >= first delay (${delay1}ms)`);
      assert.ok(delay1 >= 1000, `First delay should be at least 1s, was ${delay1}ms`);
    });
  });

  // ==========================================================================
  // TEST 3: Implement retry for rate limit errors with backoff
  // ==========================================================================

  describe('Test 3: Implement retry for rate limit errors with backoff', () => {

    it('3.1: Should retry once on 429 rate limit error', async () => {
      await initProvider();

      let requestCount = 0;
      setupMocks({
        'Accounts.json': createMockResponse(200, { accounts: [{ sid: 'test-account' }] }),
        'Calls.json': () => {
          requestCount++;
          if (requestCount === 1) {
            return createMockResponse(429, { status: '429', message: 'Rate limit exceeded' });
          }
          return createMockResponse(200, { sid: 'CA123456789', status: 'queued' });
        }
      });

      const startTime = Date.now();
      const result = await provider.initiateCall({
        to: '+1234567890',
        from: '+0987654321'
      });
      const elapsed = Date.now() - startTime;

      assert.strictEqual(result.success, true);
      assert.strictEqual(requestCount, 2, 'Should retry once after 429 error');
      assert.ok(elapsed >= 2000, `Should wait at least 2s before retry, took ${elapsed}ms`);
    });

    it('3.2: Should respect Retry-After header when provided', async () => {
      await initProvider();

      let requestCount = 0;
      setupMocks({
        'Accounts.json': createMockResponse(200, { accounts: [{ sid: 'test-account' }] }),
        'Calls.json': () => {
          requestCount++;
          if (requestCount === 1) {
            return createMockResponse(429, { status: '429', message: 'Rate limit exceeded' }, 'application/json', { 'retry-after': '3' });
          }
          return createMockResponse(200, { sid: 'CA123456789', status: 'queued' });
        }
      });

      const startTime = Date.now();
      const result = await provider.initiateCall({
        to: '+1234567890',
        from: '+0987654321'
      });
      const elapsed = Date.now() - startTime;

      assert.strictEqual(result.success, true);
      assert.strictEqual(requestCount, 2, 'Should retry once after 429 error');
      assert.ok(elapsed >= 3000, `Should wait at least 3s (Retry-After header), took ${elapsed}ms`);
    });

    it('3.3: Should fail after max retries for persistent rate limit errors', async () => {
      await initProvider();

      setupMocks({
        'Accounts.json': createMockResponse(200, { accounts: [{ sid: 'test-account' }] }),
        'Calls.json': () => createMockResponse(429, { status: '429', message: 'Rate limit exceeded' })
      });

      await assert.rejects(
        async () => {
          await provider.initiateCall({
            to: '+1234567890',
            from: '+0987654321'
          });
        },
        (error) => {
          assert.ok(error instanceof SignalWireError);
          assert.strictEqual(error.code, SignalWireErrorCode.RATE_LIMIT_EXCEEDED);
          return true;
        }
      );

      // Should have made 3 requests (1 initial + 2 retries)
      const callRequests = requestLog.filter(req => req.url.includes('Calls'));
      assert.ok(callRequests.length >= 3, `Should attempt at least 3 times, got ${callRequests.length}`);
    });

    it('3.4: Should use exponential backoff for rate limit retries', async () => {
      await initProvider();

      let requestCount = 0;
      setupMocks({
        'Accounts.json': createMockResponse(200, { accounts: [{ sid: 'test-account' }] }),
        'Calls.json': () => {
          requestCount++;
          if (requestCount < 3) {
            return createMockResponse(429, { status: '429', message: 'Rate limit exceeded' });
          }
          return createMockResponse(200, { sid: 'CA123456789', status: 'queued' });
        }
      });

      const result = await provider.initiateCall({
        to: '+1234567890',
        from: '+0987654321'
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(requestCount, 3, 'Should make 3 requests');

      // Check exponential backoff
      const callRequests = requestLog.filter(req => req.url.includes('Calls'));
      const delay1 = callRequests[1].timestamp - callRequests[0].timestamp;
      const delay2 = callRequests[2].timestamp - callRequests[1].timestamp;

      assert.ok(delay2 >= delay1, `Second delay (${delay2}ms) should be >= first delay (${delay1}ms)`);
      assert.ok(delay1 >= 2000, `First delay should be at least 2s for rate limit, was ${delay1}ms`);
    });
  });

  // ==========================================================================
  // TEST 4: Map errors to common TelephonyError types
  // ==========================================================================

  describe('Test 4: Map errors to common TelephonyError types', () => {

    it('4.1: Should classify authentication errors correctly', async () => {
      setupMocks({
        'Accounts.json': createMockResponse(401, { status: '401', message: 'Authentication failed' })
      });

      await assert.rejects(
        async () => {
          await provider.initialize('test-key', {
            projectId: 'test-project',
            apiToken: 'invalid-token',
            spaceUrl: 'test.signalwire.com'
          });
        },
        (error) => {
          assert.ok(error instanceof SignalWireError);
          assert.strictEqual(error.code, SignalWireErrorCode.INVALID_CREDENTIALS);
          return true;
        }
      );
    });

    it('4.2: Should classify rate limit errors correctly', async () => {
      await initProvider();

      setupMocks({
        'Accounts.json': createMockResponse(200, { accounts: [{ sid: 'test-account' }] }),
        'Calls.json': () => createMockResponse(429, { status: '429', message: 'Rate limit exceeded' })
      });

      await assert.rejects(
        async () => {
          await provider.initiateCall({
            to: '+1234567890',
            from: '+0987654321'
          });
        },
        (error) => {
          assert.ok(error instanceof SignalWireError);
          assert.strictEqual(error.code, SignalWireErrorCode.RATE_LIMIT_EXCEEDED);
          return true;
        }
      );
    });

    it('4.3: Should classify service unavailable errors correctly', async () => {
      await initProvider();

      setupMocks({
        'Accounts.json': createMockResponse(200, { accounts: [{ sid: 'test-account' }] }),
        'Calls.json': () => createMockResponse(503, { status: '503', message: 'Service unavailable' })
      });

      await assert.rejects(
        async () => {
          await provider.initiateCall({
            to: '+1234567890',
            from: '+0987654321'
          });
        },
        (error) => {
          assert.ok(error instanceof SignalWireError);
          assert.ok(error.message.includes('503') || error.message.includes('Service unavailable'));
          return true;
        }
      );
    });

    it('4.4: Should classify not found errors correctly', async () => {
      await initProvider();

      setupMocks({
        'Accounts.json': createMockResponse(200, { accounts: [{ sid: 'test-account' }] }),
        'Calls': createMockResponse(404, { status: '404', message: 'Call not found' })
      });

      await assert.rejects(
        async () => {
          await provider.getCallStatus({ callControlId: 'non-existent' });
        },
        (error) => {
          assert.ok(error instanceof SignalWireError);
          assert.strictEqual(error.code, SignalWireErrorCode.CALL_NOT_FOUND);
          return true;
        }
      );
    });
  });

  // ==========================================================================
  // TEST 5: Log errors with context for debugging
  // ==========================================================================

  describe('Test 5: Log errors with context for debugging', () => {

    it('5.1: Should log authentication errors', async () => {
      setupMocks({
        'Accounts.json': createMockResponse(401, { status: '401', message: 'Authentication failed' })
      });

      // Capture console.error output
      const originalError = console.error;
      const errorLogs = [];
      console.error = (...args) => {
        errorLogs.push(args.join(' '));
        originalError(...args);
      };

      try {
        await assert.rejects(
          async () => {
            await provider.initialize('test-key', {
              projectId: 'test-project-id',
              apiToken: 'invalid-token',
              spaceUrl: 'test.signalwire.com'
            });
          }
        );

        // Check that error was logged
        const authErrorLogs = errorLogs.filter(log =>
          log.includes('SignalWire') || log.includes('Error') || log.includes('Authentication')
        );

        assert.ok(authErrorLogs.length > 0, 'Should have authentication error logs');
      } finally {
        console.error = originalError;
      }
    });

    it('5.2: Should log retry attempts', async () => {
      await initProvider();

      setupMocks({
        'Accounts.json': createMockResponse(200, { accounts: [{ sid: 'test-account' }] }),
        'Calls.json': () => {
          const callRequests = requestLog.filter(req => req.url.includes('Calls'));
          if (callRequests.length < 2) {
            return createMockResponse(500, { status: '500', message: 'Internal server error' });
          }
          return createMockResponse(200, { sid: 'CA123456789', status: 'queued' });
        }
      });

      // Capture console.log output
      const originalLog = console.log;
      const logMessages = [];
      console.log = (...args) => {
        logMessages.push(args.join(' '));
        originalLog(...args);
      };

      try {
        const result = await provider.initiateCall({
          to: '+1234567890',
          from: '+0987654321'
        });

        assert.strictEqual(result.success, true);

        // Check for retry logs
        const retryLogs = logMessages.filter(log =>
          log.includes('retry') || log.includes('attempt')
        );

        assert.ok(retryLogs.length > 0, 'Should log retry attempts');
      } finally {
        console.log = originalLog;
      }
    });

    it('5.3: Should log errors with operation context', async () => {
      await initProvider();

      setupMocks({
        'Accounts.json': createMockResponse(200, { accounts: [{ sid: 'test-account' }] }),
        'Calls.json': () => createMockResponse(500, { status: '500', message: 'Internal server error' })
      });

      // Capture console.error output
      const originalError = console.error;
      const errorLogs = [];
      console.error = (...args) => {
        errorLogs.push(args.join(' '));
        originalError(...args);
      };

      try {
        await assert.rejects(
          async () => {
            await provider.initiateCall({
              to: '+1234567890',
              from: '+0987654321',
              webhookUrl: 'https://example.com/webhook'
            });
          }
        );

        // Check that context is included in logs
        const contextLogs = errorLogs.filter(log =>
          log.includes('+1234567890') || log.includes('webhook') || log.includes('initiateCall')
        );

        assert.ok(contextLogs.length > 0, 'Should include operation context in logs');
      } finally {
        console.error = originalError;
      }
    });
  });
});

console.log('Feature #249: All tests completed!');
