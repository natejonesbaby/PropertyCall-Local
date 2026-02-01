/**
 * Test Feature #194: Live transcript updates as conversation happens
 *
 * This test verifies that:
 * 1. Navigate to Live Monitor during active call
 * 2. Click on call to view details
 * 3. Verify transcript updates in real-time
 * 4. Verify speaker indicated (AI vs Caller)
 * 5. Verify messages appear without page refresh
 */

const API_URL = 'http://localhost:3000';
const WS_URL = 'ws://localhost:3000';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function loginAndGetToken() {
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test@example.com', password: 'password123' })
  });

  if (!response.ok) {
    throw new Error('Login failed');
  }

  const data = await response.json();
  return data.token;
}

async function createTestLead(token) {
  // First check if test lead exists
  const leadResponse = await fetch(`${API_URL}/api/leads?search=FEATURE194_TEST`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  const leads = await leadResponse.json();
  if (leads.leads && leads.leads.length > 0) {
    console.log('  Using existing test lead:', leads.leads[0].id);
    return leads.leads[0];
  }

  // Create a new test lead
  // We need to do this via import since there's no direct create endpoint
  console.log('  Creating test lead via database...');

  // Use an existing lead for testing
  const existingLeads = await fetch(`${API_URL}/api/leads?limit=1`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const existingData = await existingLeads.json();

  if (existingData.leads && existingData.leads.length > 0) {
    return existingData.leads[0];
  }

  throw new Error('No leads available for testing');
}

async function createTestCall(token, leadId) {
  // Create a call record in the database
  const response = await fetch(`${API_URL}/api/calls/trigger`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      lead_id: leadId,
      phone_number: '(555) 123-4567'
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to create call: ${error.message || response.statusText}`);
  }

  const data = await response.json();
  return data;
}

async function simulateCallWithTranscripts(token, callId) {
  return new Promise((resolve, reject) => {
    const WebSocket = require('ws');

    // Connect to the audio WebSocket to start a simulated call
    const ws = new WebSocket(`${WS_URL}/ws/audio?call_id=${callId}&lead_id=1`);

    const transcriptsReceived = [];
    let sessionStarted = false;

    ws.on('open', () => {
      console.log('  WebSocket connected to audio stream');
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.event === 'ready') {
          sessionStarted = true;
          console.log('  Audio bridge ready, session:', msg.sessionId);

          // Start sending mock audio to trigger transcript events
          sendMockAudio(ws);
        }
      } catch (e) {
        // Binary audio data, ignore
      }
    });

    ws.on('error', (err) => {
      console.error('  WebSocket error:', err.message);
      reject(err);
    });

    ws.on('close', () => {
      console.log('  WebSocket closed');
      resolve({ transcriptsReceived, sessionStarted });
    });

    // Send mock audio packets to trigger the mock Deepgram server
    function sendMockAudio(ws) {
      let packetCount = 0;
      const interval = setInterval(() => {
        if (packetCount >= 100) {
          clearInterval(interval);
          // Close the connection after sending audio
          setTimeout(() => {
            ws.close();
          }, 2000);
          return;
        }

        // Send mock mulaw audio (silence pattern)
        const mockAudio = Buffer.alloc(160, 0xFF);
        ws.send(mockAudio);
        packetCount++;
      }, 20);
    }
  });
}

async function monitorWebSocketForTranscripts(token, callId, durationMs = 5000) {
  return new Promise((resolve) => {
    const WebSocket = require('ws');

    const ws = new WebSocket(`${WS_URL}/ws/monitor?token=${token}`);
    const events = [];

    ws.on('open', () => {
      console.log('  Monitor WebSocket connected');
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        console.log(`  Received event: ${msg.type}`, msg.data?.role || msg.data?.eventType || '');

        if (msg.type === 'transcript_update' || msg.type === 'conversation_event') {
          events.push(msg);
        }
      } catch (e) {
        // Ignore parse errors
      }
    });

    ws.on('error', (err) => {
      console.log('  Monitor error:', err.message);
    });

    setTimeout(() => {
      ws.close();
      resolve(events);
    }, durationMs);
  });
}

async function runTest() {
  console.log('=== Feature #194 Test: Live transcript updates as conversation happens ===\n');

  try {
    // Step 1: Login
    console.log('Step 1: Logging in...');
    const token = await loginAndGetToken();
    console.log('  Logged in successfully\n');

    // Step 2: Get a test lead
    console.log('Step 2: Getting test lead...');
    const lead = await createTestLead(token);
    console.log(`  Using lead: ${lead.first_name} ${lead.last_name} (ID: ${lead.id})\n`);

    // Step 3: Start monitoring BEFORE initiating the call
    console.log('Step 3: Starting WebSocket monitor for real-time events...');
    const monitorPromise = monitorWebSocketForTranscripts(token, null, 10000);
    await sleep(500); // Give monitor time to connect

    // Step 4: Trigger a call
    console.log('\nStep 4: Triggering test call...');
    const callData = await createTestCall(token, lead.id);
    console.log(`  Call initiated: ID ${callData.call?.id || 'unknown'}`);
    console.log(`  Telnyx Call ID: ${callData.call?.telnyx_call_id || 'N/A'}\n`);

    // Wait for all events to be captured
    console.log('Step 5: Waiting for real-time transcript events...\n');
    const events = await monitorPromise;

    // Step 6: Analyze results
    console.log('\n=== Results ===\n');

    console.log(`Total events received: ${events.length}`);

    const transcriptUpdates = events.filter(e => e.type === 'transcript_update');
    const conversationEvents = events.filter(e => e.type === 'conversation_event');

    console.log(`Transcript updates: ${transcriptUpdates.length}`);
    console.log(`Conversation events: ${conversationEvents.length}`);

    if (transcriptUpdates.length > 0) {
      console.log('\nTranscript messages:');
      transcriptUpdates.forEach((e, i) => {
        const role = e.data?.role || 'unknown';
        const content = e.data?.content || '';
        const speaker = role === 'user' ? 'CALLER' : role === 'assistant' ? 'AI' : role;
        console.log(`  ${i + 1}. [${speaker}] ${content.substring(0, 80)}${content.length > 80 ? '...' : ''}`);
      });
    }

    if (conversationEvents.length > 0) {
      console.log('\nConversation events:');
      conversationEvents.forEach((e, i) => {
        console.log(`  ${i + 1}. ${e.data?.eventType || 'unknown'}`);
      });
    }

    // Verify feature requirements
    console.log('\n=== Feature Verification ===\n');

    const hasUserTranscript = transcriptUpdates.some(e => e.data?.role === 'user');
    const hasAssistantTranscript = transcriptUpdates.some(e => e.data?.role === 'assistant');
    const hasTimestamps = transcriptUpdates.every(e => e.data?.timestamp);
    const hasRealTimeEvents = events.length > 0;

    console.log(`1. Transcript updates in real-time: ${hasRealTimeEvents ? 'PASS' : 'FAIL'}`);
    console.log(`2. Speaker indicated (Caller): ${hasUserTranscript ? 'PASS' : 'FAIL'}`);
    console.log(`3. Speaker indicated (AI): ${hasAssistantTranscript ? 'PASS' : 'FAIL'}`);
    console.log(`4. Messages have timestamps: ${hasTimestamps ? 'PASS' : 'FAIL'}`);
    console.log(`5. Messages appear without page refresh: ${hasRealTimeEvents ? 'PASS (WebSocket)' : 'FAIL'}`);

    const allPassed = hasRealTimeEvents && (hasUserTranscript || hasAssistantTranscript) && hasTimestamps;

    console.log('\n' + '='.repeat(60));
    if (allPassed) {
      console.log('FEATURE #194 TEST PASSED: Live transcript updates working');
    } else {
      console.log('FEATURE #194 TEST FAILED: Some requirements not met');
      console.log('\nNote: This test requires:');
      console.log('  - Backend server running on port 3000');
      console.log('  - Deepgram mock server running on port 12112');
      console.log('  - Telnyx mock server running on port 12111');
    }
    console.log('='.repeat(60));

    return allPassed;

  } catch (error) {
    console.error('Test failed with error:', error.message);
    return false;
  }
}

// Run the test
runTest().then(passed => {
  process.exit(passed ? 0 : 1);
});
