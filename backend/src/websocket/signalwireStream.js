/**
 * SignalWire WebSocket Media Stream Handler
 *
 * Handles WebSocket connections from SignalWire for real-time audio streaming.
 * SignalWire sends audio in base64-encoded JSON messages via the <Stream> instruction.
 *
 * Audio Format: G.711 mu-law at 8kHz (PCMU - standard telephony codec)
 *
 * Supported events:
 * - connected: Initial handshake with protocol info
 * - start: Stream metadata (callSid, streamSid, tracks, mediaFormat)
 * - media: Audio payload (base64-encoded linear16 PCM)
 * - stop: Stream ended
 * - dtmf: DTMF tone detected
 * - clear: Clear buffered audio
 *
 * Reference: https://developer.signalwire.com/compatibility-api/cxml/voice/stream
 */

import { audioBridgeManager } from '../services/audioBridge.js';
import { db } from '../db/setup.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Debug logging to file (for packaged app debugging)
const DEBUG_LOG_PATH = path.join(process.cwd(), 'data', 'debug.log');
function debugLog(message) {
  const timestamp = new Date().toISOString();
  const logLine = `${timestamp} ${message}\n`;
  try {
    fs.appendFileSync(DEBUG_LOG_PATH, logLine);
  } catch (e) {
    // Ignore file write errors
  }
  console.log(message);
}

// Append SignalWire log to call record in database
function appendSignalWireLog(callId, message) {
  if (!callId) return;
  const timestamp = new Date().toISOString();
  const logLine = `${timestamp} ${message}`;
  try {
    const row = db.prepare('SELECT signalwire_log FROM calls WHERE id = ?').get(callId);
    const existingLog = row?.signalwire_log || '';
    const newLog = existingLog ? `${existingLog}\n${logLine}` : logLine;
    db.prepare('UPDATE calls SET signalwire_log = ? WHERE id = ?').run(newLog, callId);
  } catch (e) {
    console.error('Failed to append SignalWire log to call:', e.message);
  }
}

// Encryption settings for API key retrieval
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'property-call-default-key-32b!';
const ALGORITHM = 'aes-256-cbc';

function decrypt(encryptedText) {
  if (!encryptedText) return null;
  try {
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const [ivHex, encrypted] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('[SignalWire WS] Decryption error:', error);
    return null;
  }
}

/**
 * Get API keys from database
 */
function getApiKeys(userId) {
  if (!userId) {
    debugLog('[SignalWire WS] WARNING: No userId provided to getApiKeys, cannot retrieve keys');
    return {};
  }
  const keys = {};
  const services = ['deepgram', 'openai'];

  for (const service of services) {
    const row = db.prepare(`
      SELECT api_key_encrypted FROM api_keys WHERE user_id = ? AND service = ?
    `).get(userId, service);

    if (row && row.api_key_encrypted) {
      keys[service] = decrypt(row.api_key_encrypted);
    }
  }

  return keys;
}

/**
 * Get system prompt and greeting from database
 */
function getPrompts(userId) {
  if (!userId) return {};
  const prompts = {};

  const rows = db.prepare(`
    SELECT type, content FROM prompts WHERE user_id = ?
  `).all(userId);

  for (const row of rows) {
    prompts[row.type] = row.content;
  }

  return prompts;
}

/**
 * Get qualifying questions from database
 */
function getQualifyingQuestions(userId) {
  if (!userId) return [];
  return db.prepare(`
    SELECT question FROM qualifying_questions WHERE user_id = ? ORDER BY order_index
  `).all(userId).map(r => r.question);
}

/**
 * Get the user's selected voice from database
 */
function getSelectedVoice(userId) {
  if (!userId) return 'aura-asteria-en';
  const setting = db.prepare(`
    SELECT value FROM settings
    WHERE user_id = ? AND key = 'selected_voice'
  `).get(userId);

  return setting?.value || 'aura-asteria-en';
}

/**
 * Get the user's selected LLM model from database
 */
function getSelectedLLMModel(userId) {
  if (!userId) return 'gpt-4.1-mini';
  const setting = db.prepare(`
    SELECT value FROM settings
    WHERE user_id = ? AND key = 'selected_llm_model'
  `).get(userId);

  return setting?.value || 'gpt-4.1-mini';
}

/**
 * Get disqualifying triggers from database
 */
function getDisqualifyingTriggers(userId) {
  if (!userId) return [];
  return db.prepare(`
    SELECT trigger_phrase, action FROM disqualifying_triggers WHERE user_id = ? ORDER BY id
  `).all(userId);
}

/**
 * Substitute template variables in a string
 */
function substituteVariables(text, leadInfo) {
  if (!text) return text;

  let result = text;
  result = result.replace(/\{\{first_name\}\}/gi, leadInfo.firstName || 'there');
  result = result.replace(/\{\{last_name\}\}/gi, leadInfo.lastName || '');
  result = result.replace(/\{\{property_address\}\}/gi, leadInfo.propertyAddress || 'the property');

  return result;
}

/**
 * Convert base64 mu-law audio to Linear16 PCM
 * SignalWire sends audio/x-mulaw (8kHz) by default
 * Deepgram needs audio/L16;rate=16000
 */
function convertMulawToLinear16(base64Payload) {
  try {
    // Decode base64 to get mu-law buffer
    const mulawBuffer = Buffer.from(base64Payload, 'base64');

    // Convert mu-law to 16-bit linear PCM
    const linear16Buffer = Buffer.alloc(mulawBuffer.length * 2);

    for (let i = 0; i < mulawBuffer.length; i++) {
      // Mu-law decompression algorithm
      const mulawByte = mulawBuffer[i] ^ 0xff; // Flip bits
      const sign = (mulawByte & 0x80) ? -1 : 1;
      const exponent = (mulawByte >> 4) & 0x07;
      const mantissa = mulawByte & 0x0f;

      const sample = sign * ((mantissa << 3) + 0x84) << exponent;
      linear16Buffer.writeInt16LE(sample, i * 2);
    }

    return linear16Buffer;
  } catch (error) {
    console.error('[SignalWire WS] Audio conversion error:', error);
    return null;
  }
}

/**
 * Handle SignalWire media stream WebSocket connection
 * Called when a client connects to /ws/signalwire-audio/{callId}/{leadId}
 *
 * IMPORTANT: SignalWire's <Stream> URL does NOT support query string parameters
 * and <Parameter> elements don't work reliably inside <Connect><Stream>.
 * So we pass call_id and lead_id in the URL path instead.
 */
export async function handleSignalWireStreamConnection(ws, req) {
  // Extract callId and leadId from URL path: /ws/signalwire-audio/{callId}/{leadId}
  const url = new URL(req.url, 'http://localhost');
  const pathParts = url.pathname.split('/');
  // Path: ['', 'ws', 'signalwire-audio', '{callId}', '{leadId}']
  const callId = pathParts[3] || null;
  const leadId = pathParts[4] || null;

  console.log(`[SignalWire WS] New connection from SignalWire`);
  console.log(`[SignalWire WS] Request URL: ${req.url}`);
  console.log(`[SignalWire WS] Extracted from path - callId: ${callId}, leadId: ${leadId}`);
  console.log(`[SignalWire WS] WebSocket readyState: ${ws.readyState}`);

  if (!callId || callId === 'unknown') {
    console.error('[SignalWire WS] No valid call_id in URL path - cannot proceed');
    ws.close(4000, 'call_id required in URL path');
    return;
  }

  // Stream state - callId and leadId extracted from URL path
  let streamState = {
    connected: false,
    started: false,
    streamSid: null,
    callSid: null,
    callId: callId,
    leadId: leadId,
    tracks: [],
    mediaFormat: null,
    bridge: null,
    messageSequence: 0
  };

  // Handle WebSocket messages
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      streamState.messageSequence++;

      // Log all events except media (too noisy)
      if (message.event !== 'media') {
        console.log(`[SignalWire WS] Message #${streamState.messageSequence}:`, message.event, JSON.stringify(message, null, 2));
      }

      switch (message.event) {
        case 'connected':
          await handleConnected(ws, message, streamState);
          break;

        case 'start':
          // Extract callId and leadId from customParameters in the start event
          await handleStart(ws, message, streamState);
          break;

        case 'media':
          await handleMedia(ws, message, streamState);
          break;

        case 'stop':
          await handleStop(ws, message, streamState);
          break;

        case 'dtmf':
          await handleDTMF(ws, message, streamState);
          break;

        case 'clear':
          await handleClear(ws, message, streamState);
          break;

        default:
          console.log(`[SignalWire WS] Unknown event type: ${message.event}`);
      }
    } catch (error) {
      console.error('[SignalWire WS] Error handling message:', error);
    }
  });

  // Handle WebSocket close
  ws.on('close', (code, reason) => {
    console.log(`[SignalWire WS] Connection closed for call ${streamState.callId || 'unknown'} - Code: ${code}, Reason: ${reason?.toString() || 'none'}`);
    console.log(`[SignalWire WS] Messages received before close: ${streamState.messageSequence}`);
    cleanupBridge(streamState);
  });

  // Handle WebSocket errors
  ws.on('error', (error) => {
    console.error(`[SignalWire WS] WebSocket error for call ${streamState.callId || 'unknown'}:`, error);
    cleanupBridge(streamState);
  });
}

/**
 * Handle connected event
 * First message sent when WebSocket connection is established
 */
async function handleConnected(ws, message, streamState) {
  console.log(`[SignalWire WS] Connected - Protocol: ${message.protocol}, Version: ${message.version}`);

  streamState.connected = true;

  // Validate protocol
  if (message.protocol !== 'Call') {
    console.error(`[SignalWire WS] Unexpected protocol: ${message.protocol}`);
    ws.close(4003, 'Unexpected protocol');
    return;
  }
}

/**
 * Handle start event
 * Contains stream metadata (callSid, streamSid, tracks, mediaFormat)
 *
 * NOTE: callId and leadId are already extracted from the URL path during connection.
 * This event just provides SignalWire's stream metadata.
 */
async function handleStart(ws, message, streamState) {
  const startData = message.start;
  debugLog(`[SignalWire WS] Stream started - StreamSid: ${startData.streamSid}, CallSid: ${startData.callSid}`);
  debugLog(`[SignalWire WS] Using callId from URL path: ${streamState.callId}, leadId: ${streamState.leadId}`);
  appendSignalWireLog(streamState.callId, `Stream started - StreamSid: ${startData.streamSid}, CallSid: ${startData.callSid}`);

  // Validate we have callId (should be set from URL path already)
  if (!streamState.callId) {
    debugLog('[SignalWire WS] ERROR: No call_id available - connection should have been rejected');
    ws.close(4000, 'call_id required');
    return;
  }

  streamState.started = true;
  streamState.streamSid = startData.streamSid;
  streamState.callSid = startData.callSid;
  streamState.tracks = startData.tracks || [];
  streamState.mediaFormat = startData.mediaFormat;

  debugLog(`[SignalWire WS] Tracks: ${streamState.tracks.join(', ')}`);
  debugLog(`[SignalWire WS] Media Format: ${JSON.stringify(streamState.mediaFormat)}`);

  try {
    // Get user_id from call record (the logged-in user who initiated the call)
    let userId = null;
    const callRecord = db.prepare(`
      SELECT user_id FROM calls WHERE id = ?
    `).get(streamState.callId);

    if (callRecord && callRecord.user_id) {
      userId = callRecord.user_id;
      debugLog(`[SignalWire WS] Found call record, user_id: ${userId}`);
    }

    if (!userId) {
      debugLog('[SignalWire WS] ERROR: Could not determine user_id from call record');
      sendClearMessage(ws, streamState.streamSid);
      ws.close(4001, 'Could not determine user from call');
      return;
    }

    // Get lead info if lead_id provided
    let leadInfo = {};
    if (streamState.leadId && streamState.leadId !== '0') {
      const lead = db.prepare(`
        SELECT first_name, last_name, property_address, property_city, property_state
        FROM leads WHERE id = ?
      `).get(streamState.leadId);

      if (lead) {
        leadInfo = {
          firstName: lead.first_name,
          lastName: lead.last_name,
          propertyAddress: [lead.property_address, lead.property_city, lead.property_state]
            .filter(Boolean).join(', ')
        };
        debugLog(`[SignalWire WS] Found lead info for ${leadInfo.firstName}`);
      }
    }

    // Get API keys for this user
    debugLog(`[SignalWire WS] Getting API keys for user ${userId}...`);
    const apiKeys = getApiKeys(userId);
    debugLog(`[SignalWire WS] API keys retrieved - deepgram: ${!!apiKeys.deepgram}, openai: ${!!apiKeys.openai}`);

    if (!apiKeys.deepgram) {
      debugLog('[SignalWire WS] ERROR: Deepgram API key not configured for this user');
      sendClearMessage(ws, streamState.streamSid);
      ws.close(4001, 'Deepgram API key not configured');
      return;
    }

    // Get prompts and settings for this user
    const prompts = getPrompts(userId);
    const questions = getQualifyingQuestions(userId);
    const selectedVoice = getSelectedVoice(userId);
    const selectedLLMModel = getSelectedLLMModel(userId);
    const disqualifyingTriggers = getDisqualifyingTriggers(userId);

    // Substitute variables in greeting message
    const greetingWithLeadInfo = substituteVariables(
      prompts.greeting || 'Hi, this is calling on behalf of a real estate investment company. Am I speaking with the property owner?',
      leadInfo
    );

    // Build system prompt with questions
    let systemPrompt = prompts.system || `You are a friendly AI assistant calling on behalf of a real estate investment company to speak with property owners about potentially selling their property.`;

    if (questions.length > 0) {
      const questionsWithLeadInfo = questions.map(q => substituteVariables(q, leadInfo));
      systemPrompt += `\n\nQualifying questions to ask:\n${questionsWithLeadInfo.map((q, i) => `${i + 1}. ${q}`).join('\n')}`;
    }

    // Add disqualifying triggers
    if (disqualifyingTriggers.length > 0) {
      const triggerInstructions = disqualifyingTriggers.map(t => {
        const action = t.action === 'end_call'
          ? 'politely thank them for their time and end the call immediately'
          : 'mark them as disqualified and end the call politely';
        return `- If they say "${t.trigger_phrase}": ${action}`;
      }).join('\n');

      systemPrompt += `\n\nDisqualifying triggers:\n${triggerInstructions}`;
    }

    // Create audio bridge
    debugLog(`[SignalWire WS] Creating audio bridge for call ${streamState.callId}...`);
    const bridge = await audioBridgeManager.createBridge({
      callId: streamState.callId,
      deepgramApiKey: apiKeys.deepgram,
      openaiApiKey: apiKeys.openai,
      systemPrompt,
      greetingMessage: greetingWithLeadInfo,
      leadInfo,
      voice: selectedVoice,
      llmModel: selectedLLMModel
    });
    debugLog(`[SignalWire WS] Audio bridge created successfully`);

    streamState.bridge = bridge;

    // Set up event handlers
    setupBridgeEventHandlers(bridge, streamState.callId, streamState.leadId, ws);

    // IMPORTANT: Set the SignalWire WebSocket BEFORE connecting to Deepgram
    // Deepgram starts sending greeting audio immediately after SettingsApplied,
    // so we need the forwarding path ready before we connect
    bridge.setSignalWireWebSocket(ws, streamState.streamSid);
    debugLog(`[SignalWire WS] SignalWire WebSocket attached to bridge with streamSid: ${streamState.streamSid}`);

    // Now connect to Deepgram - greeting audio will be forwarded immediately
    debugLog(`[SignalWire WS] Connecting to Deepgram Voice Agent...`);
    await bridge.connectToDeepgram();
    debugLog(`[SignalWire WS] Deepgram connection established!`);

    // Update call record with session ID
    if (bridge.sessionId) {
      db.prepare(`
        UPDATE calls SET deepgram_session_id = ? WHERE id = ?
      `).run(bridge.sessionId, streamState.callId);
    }

    debugLog(`[SignalWire WS] Bridge fully established for call ${streamState.callId}`);
    appendSignalWireLog(streamState.callId, `Bridge fully established - Deepgram connected`);

    // Broadcast to monitoring clients
    broadcastToMonitorsIfAvailable({
      type: 'stream_started',
      data: {
        callId: streamState.callId,
        streamSid: streamState.streamSid,
        callSid: streamState.callSid,
        tracks: streamState.tracks,
        sessionId: bridge.sessionId
      }
    });

  } catch (error) {
    debugLog(`[SignalWire WS] FAILED to setup bridge: ${error.message}`);
    debugLog(`[SignalWire WS] Error stack: ${error.stack}`);
    appendSignalWireLog(streamState.callId, `FAILED to setup bridge: ${error.message}`);
    sendClearMessage(ws, streamState.streamSid);
    ws.close(4002, 'Failed to initialize audio bridge');
  }
}

/**
 * Handle media event
 * Contains audio payload (base64-encoded linear16 PCM at 16kHz)
 */
async function handleMedia(ws, message, streamState) {
  if (!streamState.bridge) {
    console.error('[SignalWire WS] No bridge available for media');
    return;
  }

  const mediaData = message.media;
  const track = mediaData.track;
  const payload = mediaData.payload;

  // Only process inbound track (audio from the caller)
  if (track !== 'inbound') {
    return;
  }

  // Decode base64 payload - SignalWire sends linear16 audio at 16kHz
  // Deepgram is configured to accept linear16@16kHz, so no conversion needed
  const audioBuffer = Buffer.from(payload, 'base64');

  // Send to Deepgram via audio bridge
  try {
    await streamState.bridge.sendAudioToDeepgram(audioBuffer);
  } catch (error) {
    console.error('[SignalWire WS] Error sending audio to Deepgram:', error);
  }
}

/**
 * Handle stop event
 * Stream has ended
 */
async function handleStop(ws, message, streamState) {
  console.log(`[SignalWire WS] Stream stopped - StreamSid: ${streamState.streamSid}`);

  // Cleanup bridge
  cleanupBridge(streamState);

  // Broadcast to monitoring clients
  broadcastToMonitorsIfAvailable({
    type: 'stream_stopped',
    data: {
      callSid: streamState.callSid,
      streamSid: streamState.streamSid
    }
  });
}

/**
 * Handle DTMF event
 * User pressed a key
 */
async function handleDTMF(ws, message, streamState) {
  const dtmfData = message.dtmf;
  console.log(`[SignalWire WS] DTMF detected - Digit: ${dtmfData.digit}, Duration: ${dtmfData.duration}ms`);

  // Broadcast to monitoring clients
  broadcastToMonitorsIfAvailable({
    type: 'dtmf_detected',
    data: {
      callSid: streamState.callSid,
      streamSid: streamState.streamSid,
      digit: dtmfData.digit,
      duration: dtmfData.duration
    }
  });
}

/**
 * Handle clear event
 * Clear all buffered audio
 */
async function handleClear(ws, message, streamState) {
  console.log(`[SignalWire WS] Clear event received`);

  if (streamState.bridge) {
    await streamState.bridge.clearAudioBuffer();
  }
}

/**
 * Send clear message to SignalWire
 * Clears all buffered audio on SignalWire side
 */
function sendClearMessage(ws, streamSid) {
  if (ws.readyState === 1 && streamSid) { // WebSocket.OPEN
    const clearMessage = JSON.stringify({
      event: 'clear',
      streamSid: streamSid
    });
    ws.send(clearMessage);
  }
}

/**
 * Send media message to SignalWire
 * For bidirectional streaming (play audio to the caller)
 * Audio is linear16 PCM at 16kHz - no conversion needed since Stream uses L16@16000h
 */
export function sendMediaToSignalWire(ws, streamSid, audioBuffer) {
  if (ws.readyState === 1 && streamSid) { // WebSocket.OPEN
    try {
      // No conversion needed - both SignalWire and Deepgram use linear16@16kHz
      // Encode to base64
      const base64Payload = audioBuffer.toString('base64');

      const mediaMessage = JSON.stringify({
        event: 'media',
        streamSid: streamSid,
        media: {
          payload: base64Payload
        }
      });

      ws.send(mediaMessage);
    } catch (error) {
      console.error('[SignalWire WS] Error sending media to SignalWire:', error);
    }
  }
}

/**
 * Convert Linear16 PCM to mu-law
 */
function convertLinear16ToMulaw(linear16Buffer) {
  const mulawBuffer = Buffer.alloc(linear16Buffer.length / 2);

  for (let i = 0; i < mulawBuffer.length; i++) {
    const sample = linear16Buffer.readInt16LE(i * 2);
    mulawBuffer[i] = linearToMulaw(sample) ^ 0xff;
  }

  return mulawBuffer;
}

/**
 * Linear to mu-law conversion
 */
function linearToMulaw(sample) {
  const sign = (sample >> 8) & 0x80;
  if (sign !== 0) sample = -sample;
  if (sample > 32635) sample = 32635;

  const exponent = findExponent(sample);
  const mantissa = (sample >> (exponent + 3)) & 0x0f;

  return ~(sign | (exponent << 4) | mantissa);
}

function findExponent(sample) {
  let exponent = 7;
  for (let i = 0; i < 7; i++) {
    if (!(sample & 0x4000)) {
      exponent--;
      sample <<= 1;
    } else {
      break;
    }
  }
  return exponent;
}

/**
 * Setup event handlers for the audio bridge
 */
function setupBridgeEventHandlers(bridge, callId, leadId, ws) {
  // Handle transcript updates
  bridge.on('transcript_update', ({ role, content }) => {
    console.log(`[Call ${callId}] ${role}: ${content}`);

    broadcastToMonitorsIfAvailable({
      type: 'transcript_update',
      data: {
        callId,
        role,
        content,
        timestamp: new Date().toISOString()
      }
    });
  });

  // NOTE: Agent audio is handled directly in audioBridge.js via forwardAudioToSignalWire()
  // The handleDeepgramMessage() function already calls forwardAudioToSignalWire() for binary audio
  // Deepgram outputs mu-law audio which is sent directly to SignalWire (no conversion needed)

  // Handle qualification data extraction
  bridge.on('qualification_extracted', async (data) => {
    console.log(`[Call ${callId}] Qualification extracted:`, data);

    try {
      const updates = [];
      const params = [];

      if (data.qualification_status) {
        updates.push('qualification_status = ?');
        params.push(data.qualification_status);
      }
      if (data.sentiment) {
        updates.push('sentiment = ?');
        params.push(data.sentiment);
      }
      if (data.disposition) {
        updates.push('disposition = ?');
        params.push(data.disposition);
      }
      if (data.callback_time) {
        updates.push('callback_time = ?');
        params.push(data.callback_time);
      }

      const answers = {
        motivation_to_sell: data.motivation_to_sell,
        timeline: data.timeline,
        price_expectations: data.price_expectations
      };
      updates.push('answers = ?');
      params.push(JSON.stringify(answers));

      if (updates.length > 0) {
        params.push(callId);
        db.prepare(`UPDATE calls SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      }

      broadcastToMonitorsIfAvailable({
        type: 'qualification_extracted',
        data: {
          callId,
          qualification_status: data.qualification_status,
          sentiment: data.sentiment,
          disposition: data.disposition,
          callback_time: data.callback_time,
          answers: [
            { question: 'Motivation to Sell', answer: data.motivation_to_sell },
            { question: 'Timeline', answer: data.timeline },
            { question: 'Price Expectations', answer: data.price_expectations }
          ].filter(a => a.answer),
          motivation_to_sell: data.motivation_to_sell
        }
      });
    } catch (error) {
      console.error(`[Call ${callId}] Failed to save qualification data:`, error);
    }
  });

  // Handle bridge closed
  bridge.on('closed', async (stats) => {
    console.log(`[Call ${callId}] Bridge closed. Stats:`, stats);

    try {
      db.prepare(`
        UPDATE calls
        SET transcript = ?,
            duration_seconds = ?,
            status = 'completed',
            ended_at = datetime('now')
        WHERE id = ?
      `).run(stats.transcript, stats.durationSeconds, callId);

      const finalCall = db.prepare(`
        SELECT qualification_status, sentiment, disposition, answers, ai_summary, callback_time
        FROM calls WHERE id = ?
      `).get(callId);

      let parsedAnswers = [];
      if (finalCall?.answers) {
        try {
          const answersObj = JSON.parse(finalCall.answers);
          parsedAnswers = [
            { question: 'Motivation to Sell', answer: answersObj.motivation_to_sell },
            { question: 'Timeline', answer: answersObj.timeline },
            { question: 'Price Expectations', answer: answersObj.price_expectations }
          ].filter(a => a.answer);
        } catch (e) {
          console.error(`[Call ${callId}] Error parsing answers:`, e);
        }
      }

      broadcastToMonitorsIfAvailable({
        type: 'call_ended',
        data: {
          callId,
          stats,
          extractedData: finalCall ? {
            qualification_status: finalCall.qualification_status,
            sentiment: finalCall.sentiment,
            disposition: finalCall.disposition,
            answers: parsedAnswers,
            summary: finalCall.ai_summary,
            callback_time: finalCall.callback_time
          } : null
        }
      });
    } catch (error) {
      console.error(`[Call ${callId}] Failed to save final call data:`, error);
    }
  });

  // Handle errors
  bridge.on('error', ({ source, error }) => {
    console.error(`[Call ${callId}] Error from ${source}:`, error);

    broadcastToMonitorsIfAvailable({
      type: 'call_error',
      data: { callId, source, error: error.message || error }
    });
  });
}

/**
 * Cleanup bridge on disconnect
 */
function cleanupBridge(streamState) {
  if (streamState.bridge) {
    try {
      streamState.bridge.close();
    } catch (error) {
      console.error('[SignalWire WS] Error closing bridge:', error);
    }
    streamState.bridge = null;
  }
}

/**
 * Broadcast to monitoring clients if the function is available
 */
function broadcastToMonitorsIfAvailable(message) {
  console.log(`[SignalWire WS] Broadcasting: ${message.type}`);
  import('../index.js').then(mod => {
    if (mod.broadcastToMonitors) {
      mod.broadcastToMonitors(message);
      console.log(`[SignalWire WS] Broadcast sent successfully`);
    } else {
      console.log(`[SignalWire WS] broadcastToMonitors not available`);
    }
  }).catch((err) => {
    console.log(`[SignalWire WS] Broadcast failed:`, err.message);
  });
}

/**
 * Get current SignalWire stream statistics
 */
export function getSignalWireStreamStats() {
  const bridges = audioBridgeManager.getActiveBridges();
  return {
    activeStreams: bridges.filter(b => b.signalWireWs).length,
    totalBridges: bridges.length,
    bridges: audioBridgeManager.getAllStats()
  };
}

export default handleSignalWireStreamConnection;
