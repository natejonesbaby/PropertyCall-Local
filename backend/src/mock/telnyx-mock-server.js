/**
 * Telnyx Mock Server
 *
 * A simple mock server that simulates Telnyx API responses for local testing.
 * Run this alongside the main app to test Telnyx integration without real credentials.
 *
 * Usage: node backend/src/mock/telnyx-mock-server.js
 * The mock server listens on port 12111 (matching telnyx-mock conventions)
 *
 * Features:
 * - Simulates call initiation via POST /v2/calls
 * - Sends webhook events (call.initiated, call.answered, call.hangup) to the configured webhook URL
 * - Simulates realistic call timing with delays
 * - AMD (Answering Machine Detection) simulation
 * - Speak text-to-speech API simulation
 */

import express from 'express';

const app = express();
const PORT = 12111;

// Store active calls for simulation
const activeCalls = new Map();

// Default webhook URL (can be overridden in call request)
const DEFAULT_WEBHOOK_URL = 'http://localhost:3000/api/webhooks/telnyx';

app.use(express.json());

// Mock authentication middleware
app.use((req, res, next) => {
  const authHeader = req.headers.authorization;

  // Accept any Bearer token that starts with "KEY" or "MOCK_" for testing
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    if (token.startsWith('KEY') || token.startsWith('MOCK_') || token.length >= 20) {
      req.authenticated = true;
      req.apiKey = token;
    }
  }

  next();
});

/**
 * Send a webhook event to the configured URL
 */
async function sendWebhookEvent(webhookUrl, eventType, payload) {
  try {
    console.log(`[Mock Telnyx] Sending webhook: ${eventType} to ${webhookUrl}`);
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telnyx-Event': eventType
      },
      body: JSON.stringify({
        data: {
          event_type: eventType,
          id: `evt-${Date.now()}`,
          occurred_at: new Date().toISOString(),
          payload: payload,
          record_type: 'event'
        }
      })
    });
    console.log(`[Mock Telnyx] Webhook response: ${response.status}`);
    return response.ok;
  } catch (error) {
    console.error(`[Mock Telnyx] Webhook error: ${error.message}`);
    return false;
  }
}

/**
 * Simulate a call lifecycle with webhook events
 * @param {string} callId - Call control ID
 * @param {string} webhookUrl - URL to send webhook events
 * @param {string} to - Destination phone number
 * @param {string} from - Originating phone number
 * @param {string} amd - Answering machine detection mode ('detect', 'detect_beep', 'greeting_end', etc.)
 * @param {boolean} isVoicemailTest - If true, simulate machine detection
 */
async function simulateCallLifecycle(callId, webhookUrl, to, from, amd, isVoicemailTest = false) {
  const callData = {
    call_control_id: callId,
    call_leg_id: `leg-${callId}`,
    call_session_id: `session-${callId}`,
    to: to,
    from: from,
    direction: 'outgoing'
  };

  // Store call as active
  activeCalls.set(callId, { ...callData, status: 'initiated', webhookUrl, amd, isVoicemailTest });

  // 1. Send call.initiated event immediately
  await sendWebhookEvent(webhookUrl, 'call.initiated', callData);

  // 2. After 2 seconds, simulate call being answered
  setTimeout(async () => {
    const call = activeCalls.get(callId);
    if (call && call.status !== 'ended') {
      call.status = 'answered';
      await sendWebhookEvent(webhookUrl, 'call.answered', {
        ...callData,
        state: 'answered'
      });

      // 3. If AMD is enabled, send AMD result event after answer
      if (amd) {
        setTimeout(async () => {
          const callCheck = activeCalls.get(callId);
          if (callCheck && callCheck.status !== 'ended') {
            // Simulate AMD result - machine if test call, human otherwise
            const amdResult = isVoicemailTest ? 'machine' : 'human';
            console.log(`[Mock Telnyx] AMD result for ${callId}: ${amdResult}`);

            await sendWebhookEvent(webhookUrl, 'call.machine.detection.ended', {
              ...callData,
              result: amdResult,
              machine_detection_result: amdResult
            });
          }
        }, 500); // AMD result comes 500ms after answer
      }
    }
  }, 2000);

  // 4. After 8 seconds, send recording saved event (before hangup)
  setTimeout(async () => {
    const call = activeCalls.get(callId);
    if (call && call.status !== 'ended') {
      // Generate a mock recording URL
      const recordingUrl = `https://cdn.telnyx.com/recordings/${callId}.mp3`;

      console.log(`[Mock Telnyx] Recording saved for ${callId}: ${recordingUrl}`);

      await sendWebhookEvent(webhookUrl, 'call.recording.saved', {
        ...callData,
        recording_urls: {
          mp3: recordingUrl
        },
        public_recording_urls: {
          mp3: recordingUrl
        },
        recording_duration: 8,
        recording_format: 'mp3',
        recording_size: 245760 // Mock size in bytes
      });
    }
  }, 8000);

  // 5. After 10 seconds total, simulate call hangup (unless already ended)
  setTimeout(async () => {
    const call = activeCalls.get(callId);
    if (call && call.status !== 'ended') {
      call.status = 'ended';
      await sendWebhookEvent(webhookUrl, 'call.hangup', {
        ...callData,
        state: 'hangup',
        hangup_cause: 'normal_clearing',
        hangup_source: 'callee'
      });
      activeCalls.delete(callId);
    }
  }, 10000);
}

// Mock phone numbers endpoint (used by health check)
app.get('/v2/phone_numbers', (req, res) => {
  if (!req.authenticated) {
    return res.status(401).json({
      errors: [{
        code: '10001',
        title: 'Unauthorized',
        detail: 'Invalid API key'
      }]
    });
  }

  res.json({
    data: [
      {
        id: 'mock-phone-1',
        record_type: 'phone_number',
        phone_number: '+15551234567',
        status: 'active',
        connection_id: 'mock-connection-1',
        connection_name: 'Mock Connection',
        messaging_profile_id: null,
        emergency_enabled: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ],
    meta: {
      total_pages: 1,
      total_results: 1,
      page_number: 1,
      page_size: 25
    }
  });
});

// Mock call control - create call
app.post('/v2/calls', (req, res) => {
  if (!req.authenticated) {
    return res.status(401).json({
      errors: [{ code: '10001', title: 'Unauthorized' }]
    });
  }

  const { to, from, webhook_url, connection_id, answering_machine_detection } = req.body;
  const callId = `mock-call-${Date.now()}`;
  const webhookUrl = webhook_url || DEFAULT_WEBHOOK_URL;

  console.log(`[Mock Telnyx] Creating call: ${callId}`);
  console.log(`[Mock Telnyx] From: ${from}, To: ${to}`);
  console.log(`[Mock Telnyx] Webhook URL: ${webhookUrl}`);
  console.log(`[Mock Telnyx] AMD: ${answering_machine_detection || 'disabled'}`);

  // Check if this is a voicemail test call (phone number ends with VM or contains 'voicemail')
  const isVoicemailTest = to && (to.endsWith('VM') || to.toLowerCase().includes('voicemail') || to.includes('9999'));

  // Start the call simulation asynchronously
  simulateCallLifecycle(callId, webhookUrl, to, from, answering_machine_detection, isVoicemailTest);

  res.json({
    data: {
      call_control_id: callId,
      call_leg_id: `leg-${callId}`,
      call_session_id: `session-${callId}`,
      record_type: 'call',
      is_alive: true,
      state: 'initiated',
      to: to,
      from: from,
      connection_id: connection_id || 'mock-connection-1'
    }
  });
});

// Mock speak text-to-speech API
app.post('/v2/calls/:callId/actions/speak', (req, res) => {
  if (!req.authenticated) {
    return res.status(401).json({
      errors: [{ code: '10001', title: 'Unauthorized' }]
    });
  }

  const { callId } = req.params;
  const { payload, voice, language } = req.body;
  const call = activeCalls.get(callId);

  if (!call) {
    return res.status(404).json({
      errors: [{ code: '10007', title: 'Call not found' }]
    });
  }

  console.log(`[Mock Telnyx] Speaking on call ${callId}: "${payload?.substring(0, 50)}..."`);
  console.log(`[Mock Telnyx] Voice: ${voice || 'default'}, Language: ${language || 'en-US'}`);

  // Simulate TTS duration - approximately 100ms per 10 characters
  const textLength = payload?.length || 0;
  const ttsDuration = Math.min(Math.max(1000, textLength * 10), 30000); // 1-30 seconds

  // Send speak.started event
  sendWebhookEvent(call.webhookUrl, 'call.speak.started', {
    call_control_id: callId,
    call_leg_id: `leg-${callId}`,
    call_session_id: `session-${callId}`,
    to: call.to,
    from: call.from
  });

  // After TTS duration, send speak.ended event
  setTimeout(() => {
    const callCheck = activeCalls.get(callId);
    if (callCheck) {
      sendWebhookEvent(call.webhookUrl, 'call.speak.ended', {
        call_control_id: callId,
        call_leg_id: `leg-${callId}`,
        call_session_id: `session-${callId}`,
        to: call.to,
        from: call.from,
        status: 'completed'
      });

      // Mark that speak has completed for this call
      callCheck.speakCompleted = true;
    }
  }, ttsDuration);

  res.json({
    data: {
      result: 'ok'
    }
  });
});

// Endpoint to manually trigger a call hangup (for testing)
app.post('/v2/calls/:callId/actions/hangup', (req, res) => {
  if (!req.authenticated) {
    return res.status(401).json({
      errors: [{ code: '10001', title: 'Unauthorized' }]
    });
  }

  const { callId } = req.params;
  const call = activeCalls.get(callId);

  if (!call) {
    return res.status(404).json({
      errors: [{ code: '10007', title: 'Call not found' }]
    });
  }

  // Trigger immediate hangup
  call.status = 'ended';
  sendWebhookEvent(call.webhookUrl, 'call.hangup', {
    call_control_id: callId,
    call_leg_id: `leg-${callId}`,
    call_session_id: `session-${callId}`,
    state: 'hangup',
    hangup_cause: 'normal_clearing',
    hangup_source: 'caller'
  });
  activeCalls.delete(callId);

  res.json({
    data: {
      result: 'ok'
    }
  });
});

// Get active calls (for debugging)
app.get('/v2/calls/active', (req, res) => {
  const calls = Array.from(activeCalls.entries()).map(([id, data]) => ({
    call_control_id: id,
    ...data
  }));
  res.json({ data: calls, meta: { total: calls.length } });
});

// Mock messaging profiles
app.get('/v2/messaging_profiles', (req, res) => {
  if (!req.authenticated) {
    return res.status(401).json({
      errors: [{ code: '10001', title: 'Unauthorized' }]
    });
  }

  res.json({
    data: [],
    meta: { total_pages: 1, total_results: 0 }
  });
});

// Mock number orders
app.get('/v2/number_orders', (req, res) => {
  if (!req.authenticated) {
    return res.status(401).json({
      errors: [{ code: '10001', title: 'Unauthorized' }]
    });
  }

  res.json({
    data: [],
    meta: { total_pages: 1, total_results: 0 }
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', mock: true });
});

app.listen(PORT, () => {
  console.log(`Telnyx Mock Server running on http://localhost:${PORT}`);
  console.log('Use API key starting with "KEY" or "MOCK_" for successful auth');
});
