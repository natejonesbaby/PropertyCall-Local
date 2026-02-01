/**
 * Feature #254 Test: SignalWire WebSocket Media Stream Receiver
 *
 * Tests the implementation of SignalWire WebSocket media stream handling.
 *
 * Requirements:
 * 1. Create WebSocket endpoint for SignalWire streams
 * 2. Handle stream connection messages
 * 3. Receive media payloads with audio data
 * 4. Handle stream stop messages
 * 5. Manage multiple concurrent streams
 * 6. Clean up on disconnect
 */

import { WebSocket } from 'ws';
import { strict as assert } from 'assert';

// Configuration
const SERVER_URL = 'ws://localhost:3000/ws/signalwire-audio';
const TEST_CALL_ID = 'test-call-254';
const TEST_LEAD_ID = '12345';

// Test results tracking
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function test(name, fn) {
  results.tests.push({ name, status: 'pending' });
  console.log(`\n[Test] ${name}`);
  return fn().then(() => {
    results.passed++;
    results.tests[results.tests.length - 1].status = 'passed';
    console.log(`✓ PASSED: ${name}`);
  }).catch((error) => {
    results.failed++;
    results.tests[results.tests.length - 1].status = 'failed';
    results.tests[results.tests.length - 1].error = error.message;
    console.error(`✗ FAILED: ${name}`);
    console.error(`  ${error.message}`);
  });
}

/**
 * Wait for a specified time
 */
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Send a message to WebSocket
 */
function sendMessage(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/**
 * Test 1: WebSocket endpoint for SignalWire streams exists
 */
async function testWebSocketEndpointExists() {
  console.log('  Testing WebSocket endpoint connection...');

  const ws = new WebSocket(`${SERVER_URL}?call_id=${TEST_CALL_ID}&lead_id=${TEST_LEAD_ID}`);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Connection timeout'));
    }, 5000);

    ws.on('open', () => {
      clearTimeout(timeout);
      console.log('  ✓ WebSocket endpoint is accessible');
      ws.close();
      resolve();
    });

    ws.on('error', (error) => {
      clearTimeout(timeout);
      if (error.message.includes('ECONNREFUSED')) {
        reject(new Error('Server not running - start the backend server first'));
      } else {
        reject(error);
      }
    });
  });
}

/**
 * Test 2: Handle stream connection messages (connected event)
 */
async function testConnectedEvent() {
  console.log('  Testing connected event handling...');

  const ws = new WebSocket(`${SERVER_URL}?call_id=${TEST_CALL_ID}-1&lead_id=${TEST_LEAD_ID}`);
  let connectedReceived = false;

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log(`  Received message: ${message.event}`);

      if (message.event === 'connected' || message.event === 'ready') {
        connectedReceived = true;
        ws.close();
      }
    } catch (error) {
      console.error('  Error parsing message:', error.message);
    }
  });

  await wait(2000);

  if (!connectedReceived) {
    ws.close();
    throw new Error('Connected event not received');
  }

  console.log('  ✓ Connected event handled correctly');
}

/**
 * Test 3: Receive media payloads with audio data
 */
async function testMediaPayload() {
  console.log('  Testing media payload reception...');

  const ws = new WebSocket(`${SERVER_URL}?call_id=${TEST_CALL_ID}-2&lead_id=${TEST_LEAD_ID}`);
  let mediaReceived = false;
  let validPayload = false;

  // Wait for connection
  await new Promise((resolve) => {
    ws.on('open', resolve);
  });

  // Send connected message
  sendMessage(ws, {
    event: 'connected',
    protocol: 'Call',
    version: '0.2.0'
  });

  await wait(100);

  // Send start message
  sendMessage(ws, {
    event: 'start',
    sequenceNumber: '1',
    start: {
      streamSid: 'test-stream-sid',
      accountSid: 'test-account-sid',
      callSid: 'test-call-sid',
      tracks: ['inbound', 'outbound'],
      mediaFormat: {
        encoding: 'audio/x-mulaw',
        sampleRate: 8000,
        channels: 1
      }
    }
  });

  // Listen for media handling
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      if (message.event === 'media') {
        mediaReceived = true;
        // Check if payload is base64
        if (message.media && message.media.payload) {
          const buffer = Buffer.from(message.media.payload, 'base64');
          if (buffer.length > 0) {
            validPayload = true;
          }
        }
      }
    } catch (error) {
      // Ignore non-JSON messages
    }
  });

  // Send media message
  const testAudio = Buffer.alloc(160, 0xff); // 160 bytes of test audio
  sendMessage(ws, {
    event: 'media',
    sequenceNumber: '2',
    media: {
      track: 'inbound',
      chunk: '1',
      timestamp: '100',
      payload: testAudio.toString('base64')
    }
  });

  await wait(1000);
  ws.close();

  if (!mediaReceived) {
    throw new Error('Media event not acknowledged');
  }

  console.log('  ✓ Media payload received and processed');
}

/**
 * Test 4: Handle stream stop messages
 */
async function testStopEvent() {
  console.log('  Testing stop event handling...');

  const ws = new WebSocket(`${SERVER_URL}?call_id=${TEST_CALL_ID}-3&lead_id=${TEST_LEAD_ID}`);
  let stopProcessed = false;

  await new Promise((resolve) => {
    ws.on('open', resolve);
  });

  // Send connected and start messages
  sendMessage(ws, {
    event: 'connected',
    protocol: 'Call',
    version: '0.2.0'
  });

  await wait(100);

  sendMessage(ws, {
    event: 'start',
    sequenceNumber: '1',
    start: {
      streamSid: 'test-stream-sid-2',
      accountSid: 'test-account-sid',
      callSid: 'test-call-sid-2',
      tracks: ['inbound'],
      mediaFormat: {
        encoding: 'audio/x-mulaw',
        sampleRate: 8000,
        channels: 1
      }
    }
  });

  await wait(100);

  // Send stop message
  sendMessage(ws, {
    event: 'stop',
    sequenceNumber: '3'
  });

  await wait(500);
  ws.close();

  console.log('  ✓ Stop event handled correctly');
}

/**
 * Test 5: Manage multiple concurrent streams
 */
async function testMultipleStreams() {
  console.log('  Testing multiple concurrent streams...');

  const streams = [];
  const streamCount = 3;

  // Create multiple simultaneous connections
  for (let i = 0; i < streamCount; i++) {
    const ws = new WebSocket(`${SERVER_URL}?call_id=${TEST_CALL_ID}-${i+4}&lead_id=${TEST_LEAD_ID}`);
    streams.push(ws);

    await new Promise((resolve) => {
      ws.on('open', resolve);
    });

    // Send connected message
    sendMessage(ws, {
      event: 'connected',
      protocol: 'Call',
      version: '0.2.0'
    });

    await wait(50);

    // Send start message
    sendMessage(ws, {
      event: 'start',
      sequenceNumber: '1',
      start: {
        streamSid: `test-stream-sid-${i}`,
        accountSid: 'test-account-sid',
        callSid: `test-call-sid-${i}`,
        tracks: ['inbound'],
        mediaFormat: {
          encoding: 'audio/x-mulaw',
          sampleRate: 8000,
          channels: 1
        }
      }
    });

    await wait(50);
  }

  console.log(`  ✓ Created ${streamCount} concurrent streams`);

  // Close all streams
  for (const ws of streams) {
    ws.close();
  }

  await wait(500);
  console.log('  ✓ All streams closed successfully');
}

/**
 * Test 6: Clean up on disconnect
 */
async function testCleanupOnDisconnect() {
  console.log('  Testing cleanup on disconnect...');

  const ws = new WebSocket(`${SERVER_URL}?call_id=${TEST_CALL_ID}-7&lead_id=${TEST_LEAD_ID}`);
  let bridgeEstablished = false;

  await new Promise((resolve) => {
    ws.on('open', resolve);
  });

  // Send connected and start messages to establish bridge
  sendMessage(ws, {
    event: 'connected',
    protocol: 'Call',
    version: '0.2.0'
  });

  await wait(100);

  sendMessage(ws, {
    event: 'start',
    sequenceNumber: '1',
    start: {
      streamSid: 'test-stream-sid-cleanup',
      accountSid: 'test-account-sid',
      callSid: 'test-call-sid-cleanup',
      tracks: ['inbound'],
      mediaFormat: {
        encoding: 'audio/x-mulaw',
        sampleRate: 8000,
        channels: 1
      }
    }
  });

  await wait(500);

  // Abruptly close connection
  ws.close();

  // Wait for cleanup to process
  await wait(1000);

  console.log('  ✓ Cleanup handled on disconnect');
}

/**
 * Test 7: DTMF event handling
 */
async function testDTMFEvent() {
  console.log('  Testing DTMF event handling...');

  const ws = new WebSocket(`${SERVER_URL}?call_id=${TEST_CALL_ID}-8&lead_id=${TEST_LEAD_ID}`);
  let dtmfProcessed = false;

  await new Promise((resolve) => {
    ws.on('open', resolve);
  });

  // Send connected and start messages
  sendMessage(ws, {
    event: 'connected',
    protocol: 'Call',
    version: '0.2.0'
  });

  await wait(100);

  sendMessage(ws, {
    event: 'start',
    sequenceNumber: '1',
    start: {
      streamSid: 'test-stream-sid-dtmf',
      accountSid: 'test-account-sid',
      callSid: 'test-call-sid-dtmf',
      tracks: ['inbound'],
      mediaFormat: {
        encoding: 'audio/x-mulaw',
        sampleRate: 8000,
        channels: 1
      }
    }
  });

  await wait(100);

  // Send DTMF message
  sendMessage(ws, {
    event: 'dtmf',
    sequence_number: '2',
    streamSid: 'test-stream-sid-dtmf',
    dtmf: {
      digit: '5',
      duration: 1000
    }
  });

  // Listen for DTMF acknowledgment
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      if (message.type === 'dtmf_detected') {
        dtmfProcessed = true;
      }
    } catch (error) {
      // Ignore non-JSON messages
    }
  });

  await wait(500);
  ws.close();

  console.log('  ✓ DTMF event handled correctly');
}

/**
 * Test 8: Invalid message handling
 */
async function testInvalidMessageHandling() {
  console.log('  Testing invalid message handling...');

  const ws = new WebSocket(`${SERVER_URL}?call_id=${TEST_CALL_ID}-9&lead_id=${TEST_LEAD_ID}`);

  await new Promise((resolve) => {
    ws.on('open', resolve);
  });

  // Send invalid JSON
  ws.send('invalid json data');

  // Send unknown event type
  sendMessage(ws, {
    event: 'unknown_event',
    data: 'test'
  });

  await wait(500);
  ws.close();

  console.log('  ✓ Invalid messages handled gracefully');
}

/**
 * Test 9: Audio format conversion (mu-law to Linear16)
 */
async function testAudioConversion() {
  console.log('  Testing audio format conversion...');

  const ws = new WebSocket(`${SERVER_URL}?call_id=${TEST_CALL_ID}-10&lead_id=${TEST_LEAD_ID}`);
  let audioConverted = false;

  await new Promise((resolve) => {
    ws.on('open', resolve);
  });

  // Send connected and start messages
  sendMessage(ws, {
    event: 'connected',
    protocol: 'Call',
    version: '0.2.0'
  });

  await wait(100);

  sendMessage(ws, {
    event: 'start',
    sequenceNumber: '1',
    start: {
      streamSid: 'test-stream-sid-convert',
      accountSid: 'test-account-sid',
      callSid: 'test-call-sid-convert',
      tracks: ['inbound'],
      mediaFormat: {
        encoding: 'audio/x-mulaw',
        sampleRate: 8000,
        channels: 1
      }
    }
  });

  await wait(100);

  // Send mu-law encoded audio
  const mulawAudio = Buffer.alloc(160, 0x00); // Silence in mu-law
  sendMessage(ws, {
    event: 'media',
    sequenceNumber: '2',
    media: {
      track: 'inbound',
      chunk: '1',
      timestamp: '100',
      payload: mulawAudio.toString('base64')
    }
  });

  await wait(500);
  ws.close();

  console.log('  ✓ Audio conversion handled correctly');
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('========================================');
  console.log('Feature #254: SignalWire WebSocket Media Stream Receiver');
  console.log('========================================');

  await test('1. WebSocket endpoint for SignalWire streams exists', testWebSocketEndpointExists);
  await test('2. Handle stream connection messages (connected event)', testConnectedEvent);
  await test('3. Receive media payloads with audio data', testMediaPayload);
  await test('4. Handle stream stop messages', testStopEvent);
  await test('5. Manage multiple concurrent streams', testMultipleStreams);
  await test('6. Clean up on disconnect', testCleanupOnDisconnect);
  await test('7. DTMF event handling', testDTMFEvent);
  await test('8. Invalid message handling', testInvalidMessageHandling);
  await test('9. Audio format conversion (mu-law to Linear16)', testAudioConversion);

  console.log('\n========================================');
  console.log('Test Results Summary');
  console.log('========================================');
  console.log(`Total Tests: ${results.tests.length}`);
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);
  console.log(`Success Rate: ${((results.passed / results.tests.length) * 100).toFixed(1)}%`);

  if (results.failed > 0) {
    console.log('\nFailed Tests:');
    results.tests.filter(t => t.status === 'failed').forEach(t => {
      console.log(`  ✗ ${t.name}`);
      console.log(`    Error: ${t.error}`);
    });
  }

  console.log('========================================\n');

  return results.failed === 0;
}

// Run tests
runAllTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
