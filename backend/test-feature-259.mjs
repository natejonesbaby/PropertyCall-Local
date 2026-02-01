/**
 * Test Suite for Feature #259: Telnyx Audio Bridge Standardized to Common Interface
 *
 * This test suite verifies:
 * 1. TelnyxAudioAdapter implements the audio interface
 * 2. Telnyx stream handling is moved to adapter
 * 3. Audio output format is standardized
 * 4. Common connection management is implemented
 * 5. Audio flow works correctly through the adapter
 */

import { strict as assert } from 'assert';
import WebSocket from 'ws';
import TelnyxAudioAdapter from './src/providers/telnyx-audio-adapter.js';
import SignalWireAudioAdapter from './src/providers/signalwire-audio-adapter.js';
import { createAudioAdapter, getSupportedAudioAdapters, isAudioAdapterSupported } from './src/providers/audio-adapter-factory.js';

// Test counter
let testsPassed = 0;
let testsFailed = 0;

function test(description, testFn) {
  try {
    testFn();
    console.log(`✅ PASS: ${description}`);
    testsPassed++;
  } catch (error) {
    console.log(`❌ FAIL: ${description}`);
    console.log(`   Error: ${error.message}`);
    testsFailed++;
  }
}

console.log('='.repeat(80));
console.log('Feature #259: Telnyx Audio Bridge Standardized to Common Interface');
console.log('='.repeat(80));
console.log();

// ============================================================================
// TEST 1: TelnyxAudioAdapter implements the audio interface
// ============================================================================
console.log('Test 1: TelnyxAudioAdapter implements the audio interface');
console.log('-'.repeat(80));

test('1.1: TelnyxAudioAdapter class exists', () => {
  assert.ok(TelnyxAudioAdapter, 'TelnyxAudioAdapter class should be defined');
});

test('1.2: TelnyxAudioAdapter has required properties', () => {
  const adapter = new TelnyxAudioAdapter({ callId: 'test-1' });
  assert.equal(adapter.name, 'telnyx', 'Should have name property');
  assert.equal(adapter.version, '1.0.0', 'Should have version property');
  assert.equal(adapter.callId, 'test-1', 'Should have callId property');
  assert.equal(typeof adapter.state, 'string', 'Should have state property');
  assert.equal(typeof adapter.isStreaming, 'boolean', 'Should have isStreaming property');
  assert.ok(adapter.audioConfig, 'Should have audioConfig property');
  assert.ok(adapter.stats, 'Should have stats property');
});

test('1.3: TelnyxAudioAdapter has required methods', () => {
  const adapter = new TelnyxAudioAdapter({ callId: 'test-1' });
  assert.equal(typeof adapter.initialize, 'function', 'Should have initialize method');
  assert.equal(typeof adapter.connect, 'function', 'Should have connect method');
  assert.equal(typeof adapter.disconnect, 'function', 'Should have disconnect method');
  assert.equal(typeof adapter.startStreaming, 'function', 'Should have startStreaming method');
  assert.equal(typeof adapter.stopStreaming, 'function', 'Should have stopStreaming method');
  assert.equal(typeof adapter.sendAudioToProvider, 'function', 'Should have sendAudioToProvider method');
  assert.equal(typeof adapter.receiveAudioFromProvider, 'function', 'Should have receiveAudioFromProvider method');
  assert.equal(typeof adapter.getStats, 'function', 'Should have getStats method');
  assert.equal(typeof adapter.getState, 'function', 'Should have getState method');
  assert.equal(typeof adapter.setState, 'function', 'Should have setState method');
  assert.equal(typeof adapter.isReady, 'function', 'Should have isReady method');
  assert.equal(typeof adapter.setWebSocket, 'function', 'Should have setWebSocket method');
});

test('1.4: TelnyxAudioAdapter extends EventEmitter', () => {
  const adapter = new TelnyxAudioAdapter({ callId: 'test-1' });
  assert.equal(typeof adapter.on, 'function', 'Should have on method (from EventEmitter)');
  assert.equal(typeof adapter.emit, 'function', 'Should have emit method (from EventEmitter)');
});

test('1.5: TelnyxAudioAdapter has correct audio configuration', () => {
  const adapter = new TelnyxAudioAdapter({ callId: 'test-1' });
  assert.equal(adapter.audioConfig.encoding, 'mulaw', 'Should use mulaw encoding');
  assert.equal(adapter.audioConfig.sampleRate, 8000, 'Should use 8kHz sample rate');
  assert.equal(adapter.audioConfig.channels, 1, 'Should use mono audio');
});

test('1.6: TelnyxAudioAdapter initial state is disconnected', () => {
  const adapter = new TelnyxAudioAdapter({ callId: 'test-1' });
  assert.equal(adapter.getState(), 'disconnected', 'Initial state should be disconnected');
  assert.equal(adapter.isStreaming, false, 'Should not be streaming initially');
});

test('1.7: TelnyxAudioAdapter initial stats are correct', () => {
  const adapter = new TelnyxAudioAdapter({ callId: 'test-1' });
  const stats = adapter.getStats();
  assert.equal(stats.packetsFromProvider, 0, 'Should have 0 packets from provider');
  assert.equal(stats.packetsToProvider, 0, 'Should have 0 packets to provider');
  assert.equal(stats.bytesFromProvider, 0, 'Should have 0 bytes from provider');
  assert.equal(stats.bytesToProvider, 0, 'Should have 0 bytes to provider');
  assert.equal(stats.state, 'disconnected', 'State should be disconnected');
});

console.log();
console.log(`Test 1 Results: ${testsPassed} passed, ${testsFailed} failed`);
console.log();

// ============================================================================
// TEST 2: Telnyx stream handling is moved to adapter
// ============================================================================
console.log('Test 2: Telnyx stream handling is moved to adapter');
console.log('-'.repeat(80));

test('2.1: Adapter can handle start stream event', () => {
  const adapter = new TelnyxAudioAdapter({ callId: 'test-2', debug: false });
  let streamStartedEmitted = false;
  let streamSidReceived = null;

  adapter.on('stream_started', (data) => {
    streamStartedEmitted = true;
    streamSidReceived = data.streamSid;
  });

  // Simulate Telnyx start event
  const startEvent = {
    event: 'start',
    streamSid: 'MT123456789'
  };

  adapter._handleStreamStart(startEvent);

  assert.equal(streamStartedEmitted, true, 'stream_started event should be emitted');
  assert.equal(streamSidReceived, 'MT123456789', 'Stream SID should be stored');
  assert.equal(adapter.streamSid, 'MT123456789', 'Stream SID should be accessible');
});

test('2.2: Adapter can handle media (audio) event', () => {
  const adapter = new TelnyxAudioAdapter({ callId: 'test-2', debug: false });
  adapter._isStreaming = true; // Enable streaming

  let audioReceived = false;
  let audioBuffer = null;

  adapter.on('audio_from_provider', (data) => {
    audioReceived = true;
    audioBuffer = data.audioBuffer;
  });

  // Simulate Telnyx media event
  const audioData = Buffer.from('test audio data');
  const mediaEvent = {
    event: 'media',
    media: {
      payload: audioData.toString('base64')
    }
  };

  adapter._handleMedia(mediaEvent);

  assert.equal(audioReceived, true, 'audio_from_provider event should be emitted');
  assert.ok(audioBuffer, 'Audio buffer should be provided');
  assert.equal(adapter.stats.packetsFromProvider, 1, 'Should increment packet count');
});

test('2.3: Adapter can handle stop stream event', () => {
  const adapter = new TelnyxAudioAdapter({ callId: 'test-2', debug: false });
  adapter._isStreaming = true;
  adapter.setState('streaming');

  let streamStoppedEmitted = false;

  adapter.on('stream_stopped', (data) => {
    streamStoppedEmitted = true;
  });

  // Simulate Telnyx stop event
  const stopEvent = {
    event: 'stop'
  };

  adapter._handleStreamStop(stopEvent);

  assert.equal(streamStoppedEmitted, true, 'stream_stopped event should be emitted');
  assert.equal(adapter.isStreaming, false, 'Should not be streaming after stop');
});

test('2.4: Adapter does not process media when not streaming', () => {
  const adapter = new TelnyxAudioAdapter({ callId: 'test-2', debug: false });
  adapter._isStreaming = false; // Streaming disabled

  let audioReceived = false;

  adapter.on('audio_from_provider', (data) => {
    audioReceived = true;
  });

  // Simulate Telnyx media event
  const audioData = Buffer.from('test audio data');
  const mediaEvent = {
    event: 'media',
    media: {
      payload: audioData.toString('base64')
    }
  };

  adapter._handleMedia(mediaEvent);

  assert.equal(audioReceived, false, 'Should not process audio when not streaming');
});

test('2.5: Adapter handles WebSocket connection lifecycle', () => {
  const adapter = new TelnyxAudioAdapter({ callId: 'test-2', debug: false });

  assert.equal(adapter.getState(), 'disconnected', 'Should start disconnected');

  adapter.setState('connecting');
  assert.equal(adapter.getState(), 'connecting', 'State should change to connecting');

  adapter.setState('connected');
  assert.equal(adapter.getState(), 'connected', 'State should change to connected');

  adapter.setState('streaming');
  assert.equal(adapter.getState(), 'streaming', 'State should change to streaming');

  adapter.setState('disconnected');
  assert.equal(adapter.getState(), 'disconnected', 'State should change to disconnected');
});

console.log();
console.log(`Test 2 Results: ${testsPassed} passed, ${testsFailed} failed`);
console.log();

// ============================================================================
// TEST 3: Audio output format is standardized
// ============================================================================
console.log('Test 3: Audio output format is standardized');
console.log('-'.repeat(80));

test('3.1: Adapter sends audio in correct format to provider', () => {
  const adapter = new TelnyxAudioAdapter({ callId: 'test-3', debug: false });
  adapter.setState('connected');
  adapter.streamSid = 'MT123456789';

  // Mock WebSocket
  let messageSent = null;
  adapter.ws = {
    readyState: WebSocket.OPEN,
    send: (data) => {
      messageSent = JSON.parse(data);
    }
  };

  const audioBuffer = Buffer.from('test audio');

  adapter.sendAudioToProvider(audioBuffer);

  assert.ok(messageSent, 'Message should be sent');
  assert.equal(messageSent.event, 'media', 'Should send media event');
  assert.equal(messageSent.streamSid, 'MT123456789', 'Should include stream SID');
  assert.ok(messageSent.media.payload, 'Should include base64 encoded audio');
  assert.equal(messageSent.media.payload, audioBuffer.toString('base64'), 'Audio should be base64 encoded');
});

test('3.2: Adapter statistics track bytes correctly', () => {
  const adapter = new TelnyxAudioAdapter({ callId: 'test-3', debug: false });
  adapter.setState('connected');
  adapter.streamSid = 'MT123456789';

  // Mock WebSocket
  adapter.ws = {
    readyState: WebSocket.OPEN,
    send: () => {}
  };

  const audioBuffer = Buffer.from('test audio data'); // 15 bytes

  adapter.sendAudioToProvider(audioBuffer);

  assert.equal(adapter.stats.packetsToProvider, 1, 'Should track packets sent');
  assert.equal(adapter.stats.bytesToProvider, 15, 'Should track bytes sent');
});

test('3.3: Audio encoding is standardized to mulaw', () => {
  const adapter = new TelnyxAudioAdapter({ callId: 'test-3', debug: false });
  assert.equal(adapter.audioConfig.encoding, 'mulaw', 'Should use mulaw encoding');
});

test('3.4: Sample rate is standardized to 8kHz', () => {
  const adapter = new TelnyxAudioAdapter({ callId: 'test-3', debug: false });
  assert.equal(adapter.audioConfig.sampleRate, 8000, 'Should use 8kHz sample rate');
});

test('3.5: Channels are standardized to mono', () => {
  const adapter = new TelnyxAudioAdapter({ callId: 'test-3', debug: false });
  assert.equal(adapter.audioConfig.channels, 1, 'Should use mono (1 channel)');
});

test('3.6: Audio metadata includes required fields', () => {
  const adapter = new TelnyxAudioAdapter({ callId: 'test-3', debug: false });
  adapter._isStreaming = true;

  let receivedMetadata = null;

  adapter.on('audio_from_provider', (data) => {
    receivedMetadata = data.metadata;
  });

  const audioBuffer = Buffer.from('test audio');
  adapter.receiveAudioFromProvider(audioBuffer);

  assert.ok(receivedMetadata, 'Should emit metadata with audio');
  assert.equal(typeof receivedMetadata.size, 'number', 'Should include size');
  assert.ok(receivedMetadata.timestamp, 'Should include timestamp');
  assert.equal(receivedMetadata.source, 'caller', 'Should include source');
});

console.log();
console.log(`Test 3 Results: ${testsPassed} passed, ${testsFailed} failed`);
console.log();

// ============================================================================
// TEST 4: Common connection management is implemented
// ============================================================================
console.log('Test 4: Common connection management is implemented');
console.log('-'.repeat(80));

test('4.1: Adapter can be initialized with options', async () => {
  const adapter = new TelnyxAudioAdapter({ callId: 'test-4' });

  await adapter.initialize({
    callId: 'test-4-updated',
    debug: false
  });

  assert.equal(adapter.callId, 'test-4-updated', 'Should update callId on initialize');
});

test('4.2: Adapter state changes emit events', () => {
  const adapter = new TelnyxAudioAdapter({ callId: 'test-4', debug: false });

  let stateChangedEmitted = false;
  let oldState = null;
  let newState = null;

  adapter.on('state_changed', (data) => {
    stateChangedEmitted = true;
    oldState = data.oldState;
    newState = data.newState;
  });

  adapter.setState('connecting');

  assert.equal(stateChangedEmitted, true, 'state_changed event should be emitted');
  assert.equal(oldState, 'disconnected', 'Should include old state');
  assert.equal(newState, 'connecting', 'Should include new state');
});

test('4.3: Adapter isReady returns correct status', () => {
  const adapter = new TelnyxAudioAdapter({ callId: 'test-4', debug: false });

  assert.equal(adapter.isReady(), false, 'Should not be ready when disconnected');

  adapter.setState('connected');
  assert.equal(adapter.isReady(), true, 'Should be ready when connected');

  adapter.setState('streaming');
  assert.equal(adapter.isReady(), true, 'Should be ready when streaming');

  adapter.setState('disconnected');
  assert.equal(adapter.isReady(), false, 'Should not be ready when disconnected');
});

test('4.4: Adapter can set WebSocket externally', () => {
  const adapter = new TelnyxAudioAdapter({ callId: 'test-4', debug: false });

  let messageHandlersSet = false;

  const mockWs = {
    on: (event, handler) => {
      if (event === 'message') {
        messageHandlersSet = true;
      }
    }
  };

  adapter.setWebSocket(mockWs, 'MT987654321');

  assert.equal(adapter.ws, mockWs, 'Should store WebSocket');
  assert.equal(adapter.streamSid, 'MT987654321', 'Should store stream SID');
  assert.equal(adapter.getState(), 'connected', 'Should set state to connected');
  assert.equal(messageHandlersSet, true, 'Should set up message handlers');
});

test('4.5: Adapter disconnect cleans up resources', async () => {
  const adapter = new TelnyxAudioAdapter({ callId: 'test-4', debug: false });
  adapter.setState('streaming');
  adapter._isStreaming = true;

  let wsClosed = false;

  adapter.ws = {
    readyState: WebSocket.OPEN,
    close: () => {
      wsClosed = true;
    }
  };

  adapter.streamSid = 'MT123456789';

  await adapter.disconnect();

  assert.equal(wsClosed, true, 'Should close WebSocket');
  assert.equal(adapter.ws, null, 'Should clear WebSocket reference');
  assert.equal(adapter.streamSid, null, 'Should clear stream SID');
  assert.equal(adapter.getState(), 'disconnected', 'Should set state to disconnected');
  assert.equal(adapter.isStreaming, false, 'Should not be streaming');
});

test('4.6: Adapter startStreaming updates state and stats', async () => {
  const adapter = new TelnyxAudioAdapter({ callId: 'test-4', debug: false });
  adapter.setState('connected');

  await adapter.startStreaming();

  assert.equal(adapter.isStreaming, true, 'Should be streaming');
  assert.equal(adapter.getState(), 'streaming', 'State should be streaming');
  assert.ok(adapter.stats.startTime, 'Should set start time');
});

test('4.7: Adapter stopStreaming updates state and stats', async () => {
  const adapter = new TelnyxAudioAdapter({ callId: 'test-4', debug: false });
  adapter._isStreaming = true;
  adapter.setState('streaming');

  await adapter.stopStreaming();

  assert.equal(adapter.isStreaming, false, 'Should not be streaming');
  assert.equal(adapter.getState(), 'connected', 'State should be connected');
  assert.ok(adapter.stats.endTime, 'Should set end time');
});

console.log();
console.log(`Test 4 Results: ${testsPassed} passed, ${testsFailed} failed`);
console.log();

// ============================================================================
// TEST 5: Audio flow works correctly through the adapter
// ============================================================================
console.log('Test 5: Audio flow works correctly through the adapter');
console.log('-'.repeat(80));

test('5.1: Audio flows from provider to adapter events', () => {
  const adapter = new TelnyxAudioAdapter({ callId: 'test-5', debug: false });
  adapter._isStreaming = true;

  let audioEventEmitted = false;
  let receivedBuffer = null;

  adapter.on('audio_from_provider', (data) => {
    audioEventEmitted = true;
    receivedBuffer = data.audioBuffer;
  });

  const originalBuffer = Buffer.from('test audio from caller');
  adapter.receiveAudioFromProvider(originalBuffer);

  assert.equal(audioEventEmitted, true, 'Should emit audio_from_provider event');
  assert.ok(receivedBuffer, 'Should provide audio buffer');
  assert.equal(receivedBuffer.toString(), originalBuffer.toString(), 'Audio data should match');
});

test('5.2: Adapter emits audio_to_provider events', () => {
  const adapter = new TelnyxAudioAdapter({ callId: 'test-5', debug: false });
  adapter.setState('connected');
  adapter.streamSid = 'MT123456789';

  let audioToProviderEmitted = false;
  let sentSize = null;

  adapter.on('audio_to_provider', (data) => {
    audioToProviderEmitted = true;
    sentSize = data.size;
  });

  adapter.ws = {
    readyState: WebSocket.OPEN,
    send: () => {}
  };

  const audioBuffer = Buffer.from('test audio to caller');
  adapter.sendAudioToProvider(audioBuffer);

  assert.equal(audioToProviderEmitted, true, 'Should emit audio_to_provider event');
  assert.equal(sentSize, audioBuffer.length, 'Should include audio size');
});

test('5.3: End-to-end audio flow simulation', () => {
  const adapter = new TelnyxAudioAdapter({ callId: 'test-5', debug: false });

  // Track audio in both directions
  let audioFromProvider = 0;
  let audioToProvider = 0;

  adapter.on('audio_from_provider', () => {
    audioFromProvider++;
  });

  adapter.on('audio_to_provider', () => {
    audioToProvider++;
  });

  // Simulate audio from provider
  adapter._isStreaming = true;
  adapter.receiveAudioFromProvider(Buffer.from('caller audio 1'));
  adapter.receiveAudioFromProvider(Buffer.from('caller audio 2'));

  // Simulate audio to provider
  adapter.setState('connected');
  adapter.streamSid = 'MT123456789';
  adapter.ws = {
    readyState: WebSocket.OPEN,
    send: () => {}
  };

  adapter.sendAudioToProvider(Buffer.from('agent audio 1'));
  adapter.sendAudioToProvider(Buffer.from('agent audio 2'));

  assert.equal(audioFromProvider, 2, 'Should receive 2 audio packets from provider');
  assert.equal(audioToProvider, 2, 'Should send 2 audio packets to provider');
  assert.equal(adapter.stats.packetsFromProvider, 2, 'Should track packets from provider');
  assert.equal(adapter.stats.packetsToProvider, 2, 'Should track packets to provider');
});

test('5.4: Statistics track complete audio flow', () => {
  const adapter = new TelnyxAudioAdapter({ callId: 'test-5', debug: false });

  adapter._isStreaming = true;
  adapter.setState('connected');
  adapter.streamSid = 'MT123456789';

  adapter.ws = {
    readyState: WebSocket.OPEN,
    send: () => {}
  };

  const callerAudio = Buffer.from('caller audio data'); // 17 bytes
  const agentAudio = Buffer.from('agent audio data');   // 16 bytes

  adapter.receiveAudioFromProvider(callerAudio);
  adapter.sendAudioToProvider(agentAudio);

  const stats = adapter.getStats();

  assert.equal(stats.packetsFromProvider, 1, 'Should track from provider packets');
  assert.equal(stats.packetsToProvider, 1, 'Should track to provider packets');
  assert.equal(stats.bytesFromProvider, 17, 'Should track from provider bytes');
  assert.equal(stats.bytesToProvider, 16, 'Should track to provider bytes');
  assert.ok(stats.state, 'Should include state');
  assert.equal(typeof stats.isStreaming, 'boolean', 'Should include streaming flag');
  assert.ok(stats.state, 'Should include state');
  assert.equal(typeof stats.isStreaming, 'boolean', 'Should include streaming flag');
});

test('5.5: Adapter handles rapid audio packets', () => {
  const adapter = new TelnyxAudioAdapter({ callId: 'test-5', debug: false });
  adapter._isStreaming = true;
  adapter.setState('connected');
  adapter.streamSid = 'MT123456789';

  adapter.ws = {
    readyState: WebSocket.OPEN,
    send: () => {}
  };

  // Send 100 rapid packets
  for (let i = 0; i < 100; i++) {
    adapter.receiveAudioFromProvider(Buffer.from(`audio ${i}`));
  }

  for (let i = 0; i < 100; i++) {
    adapter.sendAudioToProvider(Buffer.from(`response ${i}`));
  }

  const stats = adapter.getStats();

  assert.equal(stats.packetsFromProvider, 100, 'Should handle 100 packets from provider');
  assert.equal(stats.packetsToProvider, 100, 'Should handle 100 packets to provider');
});

console.log();
console.log(`Test 5 Results: ${testsPassed} passed, ${testsFailed} failed`);
console.log();

// ============================================================================
// TEST 6: SignalWire adapter also implements the interface
// ============================================================================
console.log('Test 6: SignalWire adapter also implements the interface');
console.log('-'.repeat(80));

test('6.1: SignalWireAudioAdapter implements the same interface', () => {
  const adapter = new SignalWireAudioAdapter({ callId: 'test-6' });

  assert.equal(adapter.name, 'signalwire', 'Should have correct name');
  assert.equal(typeof adapter.connect, 'function', 'Should have connect method');
  assert.equal(typeof adapter.disconnect, 'function', 'Should have disconnect method');
  assert.equal(typeof adapter.sendAudioToProvider, 'function', 'Should have sendAudioToProvider method');
  assert.equal(typeof adapter.receiveAudioFromProvider, 'function', 'Should have receiveAudioFromProvider method');
});

test('6.2: SignalWire adapter uses same audio format', () => {
  const adapter = new SignalWireAudioAdapter({ callId: 'test-6' });

  assert.equal(adapter.audioConfig.encoding, 'mulaw', 'Should use mulaw');
  assert.equal(adapter.audioConfig.sampleRate, 8000, 'Should use 8kHz');
  assert.equal(adapter.audioConfig.channels, 1, 'Should use mono');
});

test('6.3: SignalWire adapter handles inbound track only', () => {
  const adapter = new SignalWireAudioAdapter({ callId: 'test-6', debug: false });
  adapter._isStreaming = true;

  let audioReceived = false;

  adapter.on('audio_from_provider', () => {
    audioReceived = true;
  });

  const audioData = Buffer.from('test audio');

  // Inbound track (caller audio) - should process
  const inboundEvent = {
    event: 'media',
    media: {
      track: 'inbound',
      payload: audioData.toString('base64')
    }
  };

  adapter._handleMedia(inboundEvent);
  assert.equal(audioReceived, true, 'Should process inbound track');

  // Outbound track (agent audio) - should not process
  audioReceived = false;
  const outboundEvent = {
    event: 'media',
    media: {
      track: 'outbound',
      payload: audioData.toString('base64')
    }
  };

  adapter._handleMedia(outboundEvent);
  assert.equal(audioReceived, false, 'Should not process outbound track');
});

console.log();
console.log(`Test 6 Results: ${testsPassed} passed, ${testsFailed} failed`);
console.log();

// ============================================================================
// TEST 7: Audio adapter factory works correctly
// ============================================================================
console.log('Test 7: Audio adapter factory works correctly');
console.log('-'.repeat(80));

test('7.1: Factory creates Telnyx adapter', () => {
  const adapter = createAudioAdapter('telnyx', { callId: 'test-7' });

  assert.ok(adapter, 'Should create adapter');
  assert.equal(adapter.constructor.name, 'TelnyxAudioAdapter', 'Should create TelnyxAudioAdapter');
});

test('7.2: Factory creates SignalWire adapter', () => {
  const adapter = createAudioAdapter('signalwire', { callId: 'test-7' });

  assert.ok(adapter, 'Should create adapter');
  assert.equal(adapter.constructor.name, 'SignalWireAudioAdapter', 'Should create SignalWireAudioAdapter');
});

test('7.3: Factory is case-insensitive', () => {
  const adapter1 = createAudioAdapter('TELNYX', { callId: 'test-7' });
  const adapter2 = createAudioAdapter('SignalWire', { callId: 'test-7' });

  assert.equal(adapter1.constructor.name, 'TelnyxAudioAdapter', 'Should handle uppercase');
  assert.equal(adapter2.constructor.name, 'SignalWireAudioAdapter', 'Should handle mixed case');
});

test('7.4: Factory throws for unsupported provider', () => {
  try {
    createAudioAdapter('unsupported', { callId: 'test-7' });
    assert.fail('Should throw error for unsupported provider');
  } catch (error) {
    assert.ok(error.message.includes('Unsupported'), 'Should indicate unsupported provider');
  }
});

test('7.5: getSupportedAudioAdapters returns list', () => {
  const supported = getSupportedAudioAdapters();

  assert.ok(Array.isArray(supported), 'Should return array');
  assert.ok(supported.includes('telnyx'), 'Should include telnyx');
  assert.ok(supported.includes('signalwire'), 'Should include signalwire');
});

test('7.6: isAudioAdapterSupported checks provider', () => {
  assert.equal(isAudioAdapterSupported('telnyx'), true, 'Should support telnyx');
  assert.equal(isAudioAdapterSupported('signalwire'), true, 'Should support signalwire');
  assert.equal(isAudioAdapterSupported('twilio'), false, 'Should not support twilio (yet)');
  assert.equal(isAudioAdapterSupported('TELNYX'), true, 'Should be case-insensitive');
});

console.log();
console.log(`Test 7 Results: ${testsPassed} passed, ${testsFailed} failed`);
console.log();

// ============================================================================
// FINAL RESULTS
// ============================================================================
console.log('='.repeat(80));
console.log('FINAL RESULTS');
console.log('='.repeat(80));
console.log(`Total Tests: ${testsPassed + testsFailed}`);
console.log(`✅ Passed: ${testsPassed}`);
console.log(`❌ Failed: ${testsFailed}`);
console.log(`Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);
console.log('='.repeat(80));

if (testsFailed === 0) {
  console.log('🎉 ALL TESTS PASSED! Feature #259 is complete.');
  process.exit(0);
} else {
  console.log('⚠️  Some tests failed. Please review and fix.');
  process.exit(1);
}
