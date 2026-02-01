/**
 * Audio Bridge Service
 *
 * This service manages the bidirectional audio streaming between:
 * - Telnyx/SignalWire (telephony providers) - sends/receives G.711/mu-law audio
 * - Deepgram Voice Agent - sends/receives AI conversation audio
 *
 * Architecture:
 * 1. Telnyx/SignalWire sends audio via WebSocket to our server
 * 2. We forward that audio to Deepgram Voice Agent WebSocket
 * 3. Deepgram processes with STT, LLM, and TTS
 * 4. Deepgram sends response audio back to us
 * 5. We forward that audio back to the telephony provider/caller
 */

import WebSocket from 'ws';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { db } from '../db/setup.js';

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

// Append service-specific log to call record in database
function appendCallLog(callId, service, message) {
  if (!callId) return;
  const timestamp = new Date().toISOString();
  const logLine = `${timestamp} ${message}`;

  // Map service to column name
  const columnMap = {
    'deepgram': 'deepgram_log',
    'signalwire': 'signalwire_log',
    'telnyx': 'telnyx_log',
    'fub': 'fub_log'
  };
  const column = columnMap[service] || 'debug_log';

  try {
    // Get existing log and append
    const row = db.prepare(`SELECT ${column} FROM calls WHERE id = ?`).get(callId);
    const existingLog = row?.[column] || '';
    const newLog = existingLog ? `${existingLog}\n${logLine}` : logLine;
    db.prepare(`UPDATE calls SET ${column} = ? WHERE id = ?`).run(newLog, callId);
  } catch (e) {
    console.error(`Failed to append ${service} log to call:`, e.message);
  }
}

// Helper for Deepgram logs
function appendDeepgramLog(callId, message) {
  appendCallLog(callId, 'deepgram', message);
}

// Audio format constants
const TELNYX_SAMPLE_RATE = 8000;  // G.711 ulaw at 8kHz
const SIGNALWIRE_SAMPLE_RATE = 8000;  // mu-law at 8kHz (standard telephony)
const DEEPGRAM_SAMPLE_RATE = 8000;  // mu-law at 8kHz

/**
 * AudioBridge manages a single call's audio streaming between Telnyx and Deepgram
 */
class AudioBridge extends EventEmitter {
  constructor(options = {}) {
    super();

    this.callId = options.callId || crypto.randomUUID();
    this.deepgramApiKey = options.deepgramApiKey;
    this.openaiApiKey = options.openaiApiKey;
    this.systemPrompt = options.systemPrompt || '';
    this.greetingMessage = options.greetingMessage || '';
    this.leadInfo = options.leadInfo || {};
    this.voice = options.voice || 'aura-asteria-en';  // Deepgram Aura-2 voice selection
    this.llmModel = options.llmModel || 'gpt-4.1-mini';  // LLM model for Deepgram Voice Agent
    this.telnyxWs = null;
    this.signalWireWs = null;  // SignalWire WebSocket connection
    this.streamSid = null;  // SignalWire stream SID
    this.deepgramWs = null;
    this.isActive = false;
    this.sessionId = null;

    // Transcript accumulation
    this.transcript = [];
    this.currentUtterance = '';

    // Statistics
    this.stats = {
      audioPacketsFromTelnyx: 0,
      audioPacketsFromSignalWire: 0,
      audioPacketsToDeepgram: 0,
      audioPacketsFromDeepgram: 0,
      audioPacketsToTelnyx: 0,
      audioPacketsToSignalWire: 0,
      startTime: null,
      endTime: null
    };

    // Live monitoring listeners - WebSocket connections that receive audio
    this.monitorListeners = new Set();
  }

  /**
   * Add a monitoring listener WebSocket connection
   * This allows admins to listen in on active calls
   */
  addMonitorListener(ws) {
    this.monitorListeners.add(ws);
    console.log(`[AudioBridge ${this.callId}] Monitor listener added. Total: ${this.monitorListeners.size}`);

    // Send initial status
    ws.send(JSON.stringify({
      type: 'listening_started',
      callId: this.callId,
      sessionId: this.sessionId,
      timestamp: new Date().toISOString()
    }));

    // Handle disconnect
    ws.on('close', () => {
      this.monitorListeners.delete(ws);
      console.log(`[AudioBridge ${this.callId}] Monitor listener removed. Total: ${this.monitorListeners.size}`);
    });

    ws.on('error', () => {
      this.monitorListeners.delete(ws);
    });
  }

  /**
   * Remove a monitoring listener
   */
  removeMonitorListener(ws) {
    this.monitorListeners.delete(ws);
    console.log(`[AudioBridge ${this.callId}] Monitor listener removed. Total: ${this.monitorListeners.size}`);
  }

  /**
   * Forward audio to all monitoring listeners
   * Audio is sent as base64 encoded for browser compatibility
   */
  forwardAudioToMonitors(audioBuffer, source) {
    if (this.monitorListeners.size === 0) return;

    // Convert mulaw audio to base64 for transport
    const base64Audio = audioBuffer.toString('base64');
    const message = JSON.stringify({
      type: 'audio',
      source: source, // 'caller' or 'agent'
      audio: base64Audio,
      timestamp: Date.now(),
      sampleRate: TELNYX_SAMPLE_RATE
    });

    for (const listener of this.monitorListeners) {
      if (listener.readyState === 1) { // WebSocket.OPEN
        listener.send(message);
      }
    }
  }

  /**
   * Get count of active listeners
   */
  getListenerCount() {
    return this.monitorListeners.size;
  }

  /**
   * Initialize Deepgram Voice Agent WebSocket connection
   */
  async connectToDeepgram() {
    return new Promise((resolve, reject) => {
      // Use environment variable for testing with mock server, default to production URL
      const wsUrl = process.env.DEEPGRAM_AGENT_WS_URL || 'wss://agent.deepgram.com/v1/agent/converse';

      debugLog(`[AudioBridge ${this.callId}] Connecting to Deepgram at: ${wsUrl}`);
      debugLog(`[AudioBridge ${this.callId}] API Key present: ${!!this.deepgramApiKey}, length: ${this.deepgramApiKey?.length || 0}`);

      this.deepgramWs = new WebSocket(wsUrl, {
        headers: {
          'Authorization': `Token ${this.deepgramApiKey}`
        }
      });

      this.deepgramWs.on('open', () => {
        debugLog(`[AudioBridge ${this.callId}] Connected to Deepgram Voice Agent - SUCCESS`);
        appendDeepgramLog(this.callId, 'Connected to Deepgram Voice Agent - SUCCESS');

        // Configure the voice agent
        this.configureDeepgramAgent();
        resolve();
      });

      this.deepgramWs.on('message', (data) => {
        debugLog(`[AudioBridge ${this.callId}] Received message from Deepgram, buffer: ${Buffer.isBuffer(data)}, length: ${data.length}`);
        // Log the raw message content for debugging - try to decode as text
        try {
          const dataStr = data.toString('utf8');
          // Check if it looks like JSON (starts with { or [)
          if (dataStr.charAt(0) === '{' || dataStr.charAt(0) === '[') {
            debugLog(`[AudioBridge ${this.callId}] Deepgram JSON message: ${dataStr}`);
            appendDeepgramLog(this.callId, `Deepgram response: ${dataStr}`);
          } else {
            // It's binary audio data, just note that
            appendDeepgramLog(this.callId, `Deepgram audio: ${data.length} bytes`);
          }
        } catch (e) {
          // Binary data that can't be decoded
          appendDeepgramLog(this.callId, `Deepgram binary: ${data.length} bytes`);
        }
        this.handleDeepgramMessage(data);
      });

      this.deepgramWs.on('error', (error) => {
        debugLog(`[AudioBridge ${this.callId}] Deepgram WebSocket ERROR: ${error.message}`);
        appendDeepgramLog(this.callId, `Deepgram WebSocket ERROR: ${error.message}`);
        this.emit('error', { source: 'deepgram', error });
        // Only reject if we're still connecting and haven't opened yet
        if (this.deepgramWs.readyState !== WebSocket.OPEN) {
          reject(error);
        }
      });

      this.deepgramWs.on('close', (code, reason) => {
        const reasonStr = reason ? reason.toString() : '';
        debugLog(`[AudioBridge ${this.callId}] Deepgram WebSocket closed: ${code} - ${reasonStr}`);
        appendDeepgramLog(this.callId, `Deepgram WebSocket CLOSED: code=${code}, reason=${reasonStr}`);
        this.emit('deepgram_disconnected', { code, reason: reasonStr });
      });

      this.deepgramWs.on('unexpected-response', (req, res) => {
        debugLog(`[AudioBridge ${this.callId}] Deepgram unexpected response - Status: ${res.statusCode}`);
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          debugLog(`[AudioBridge ${this.callId}] Deepgram response body: ${body}`);
        });
      });

      // Timeout for connection
      setTimeout(() => {
        if (this.deepgramWs.readyState !== WebSocket.OPEN) {
          debugLog(`[AudioBridge ${this.callId}] Deepgram connection TIMEOUT`);
          reject(new Error('Deepgram connection timeout'));
        }
      }, 10000);
    });
  }

  /**
   * Configure Deepgram Voice Agent settings
   */
  configureDeepgramAgent() {
    // Prepare lead context for the system prompt
    const leadContext = this.leadInfo.firstName
      ? `You are calling ${this.leadInfo.firstName} ${this.leadInfo.lastName || ''} regarding the property at ${this.leadInfo.propertyAddress || 'their property'}.`
      : '';

    const config = {
      type: 'Settings',
      audio: {
        input: {
          encoding: 'mulaw',
          sample_rate: SIGNALWIRE_SAMPLE_RATE
        },
        output: {
          encoding: 'mulaw',
          sample_rate: SIGNALWIRE_SAMPLE_RATE,
          container: 'none'
        }
      },
      agent: {
        listen: {
          provider: {
            type: 'deepgram',
            model: 'nova-2'
          }
        },
        think: {
          provider: {
            type: 'open_ai',
            model: this.llmModel
          },
          prompt: `${this.systemPrompt}\n\n${leadContext}`.trim(),
          functions: this.getAgentFunctions()
        },
        speak: {
          provider: {
            type: 'deepgram',
            model: this.voice
          }
        }
      }
    };

    // Add greeting if provided
    if (this.greetingMessage) {
      config.agent.greeting = this.greetingMessage;
    }

    const configJson = JSON.stringify(config, null, 2);
    debugLog(`[AudioBridge ${this.callId}] Sending config to Deepgram: ${configJson}`);
    appendDeepgramLog(this.callId, `Sent config to Deepgram:\n${configJson}`);
    this.sendToDeepgram(config);
    debugLog(`[AudioBridge ${this.callId}] Sent configuration to Deepgram`);
  }

  /**
   * Define function calls for data extraction
   */
  getAgentFunctions() {
    return [
      {
        name: 'extract_qualification_data',
        description: 'Call this function when you have gathered enough information to determine if the lead is qualified or not.',
        parameters: {
          type: 'object',
          properties: {
            qualification_status: {
              type: 'string',
              enum: ['Qualified', 'Not Qualified', "Couldn't Reach"],
              description: 'The qualification status of the lead'
            },
            sentiment: {
              type: 'string',
              enum: ['Very Motivated', 'Somewhat Motivated', 'Neutral', 'Reluctant', 'Not Interested'],
              description: 'The seller sentiment level'
            },
            disposition: {
              type: 'string',
              enum: ['Callback Scheduled', 'Not Interested', 'Wrong Number', 'Already Sold', 'Voicemail Left', 'No Answer', 'Disqualified'],
              description: 'The call disposition'
            },
            motivation_to_sell: {
              type: 'string',
              description: 'Summary of their motivation to sell'
            },
            timeline: {
              type: 'string',
              description: 'When they want to sell'
            },
            price_expectations: {
              type: 'string',
              description: 'Their price expectations if mentioned'
            },
            callback_time: {
              type: 'string',
              description: 'Scheduled callback time if applicable (ISO format)'
            }
          },
          required: ['qualification_status', 'sentiment', 'disposition']
        }
      },
      {
        name: 'end_call',
        description: 'Call this function when the conversation should end (lead not interested, wrong number, etc.)',
        parameters: {
          type: 'object',
          properties: {
            reason: {
              type: 'string',
              description: 'Reason for ending the call'
            }
          },
          required: ['reason']
        }
      }
    ];
  }

  /**
   * Handle messages from Deepgram
   */
  handleDeepgramMessage(data) {
    try {
      // In Node.js ws library, all messages come as Buffers
      // Try to parse as JSON first, if it fails it's binary audio
      const dataStr = data.toString();

      // Check if it starts with '{' which indicates JSON
      if (dataStr.startsWith('{')) {
        try {
          const message = JSON.parse(dataStr);
          this.processDeepgramEvent(message);
          return;
        } catch (e) {
          // Not valid JSON, treat as audio
        }
      }

      // Binary audio data from Deepgram TTS
      this.stats.audioPacketsFromDeepgram++;
      // Forward to whichever telephony provider is connected
      this.forwardAudioToTelnyx(data);
      this.forwardAudioToSignalWire(data);
      // Also forward to monitoring listeners (agent audio)
      this.forwardAudioToMonitors(data, 'agent');
      this.emit('deepgram_audio', { size: data.length });
      this.emit('agent_audio', { audioBuffer: data });
    } catch (error) {
      console.error(`[AudioBridge ${this.callId}] Error processing Deepgram message:`, error);
    }
  }

  /**
   * Process Deepgram event messages
   */
  processDeepgramEvent(message) {
    const eventType = message.type;

    switch (eventType) {
      case 'Welcome':
        this.sessionId = message.session_id;
        console.log(`[AudioBridge ${this.callId}] Deepgram session started: ${this.sessionId}`);
        this.emit('session_started', { sessionId: this.sessionId });
        break;

      case 'UserStartedSpeaking':
        console.log(`[AudioBridge ${this.callId}] Emitting user_speaking: started`);
        this.emit('user_speaking', { started: true });
        break;

      case 'UserStoppedSpeaking':
        this.emit('user_speaking', { started: false });
        break;

      case 'ConversationText':
        // Transcript update
        const role = message.role; // 'user' or 'assistant'
        const content = message.content;
        this.transcript.push({ role, content, timestamp: new Date().toISOString() });
        this.emit('transcript_update', { role, content });
        break;

      case 'AgentThinking':
        console.log(`[AudioBridge ${this.callId}] Emitting agent_thinking`);
        this.emit('agent_thinking', { content: message.content });
        break;

      case 'AgentStartedSpeaking':
        console.log(`[AudioBridge ${this.callId}] Emitting agent_speaking: started`);
        this.emit('agent_speaking', { started: true });
        break;

      case 'AgentAudioDone':
        this.emit('agent_speaking', { started: false });
        break;

      case 'FunctionCallRequest':
        // Handle function calls from the AI
        this.handleFunctionCall(message);
        break;

      case 'Error':
        console.error(`[AudioBridge ${this.callId}] Deepgram error:`, message);
        this.emit('error', { source: 'deepgram', error: message });
        break;

      case 'CloseStream':
        console.log(`[AudioBridge ${this.callId}] Deepgram requested stream close`);
        this.emit('stream_close_requested');
        break;

      default:
        // Log unknown events for debugging
        console.log(`[AudioBridge ${this.callId}] Deepgram event: ${eventType}`, message);
    }
  }

  /**
   * Handle function calls from Deepgram AI
   */
  handleFunctionCall(message) {
    const functionName = message.function_name;
    const functionArgs = message.input;
    const callId = message.function_call_id;

    console.log(`[AudioBridge ${this.callId}] Function call: ${functionName}`, functionArgs);

    switch (functionName) {
      case 'extract_qualification_data':
        // Emit the extracted data
        this.emit('qualification_extracted', functionArgs);
        // Acknowledge the function call
        this.sendFunctionResult(callId, { success: true });
        break;

      case 'end_call':
        this.emit('call_end_requested', { reason: functionArgs.reason });
        this.sendFunctionResult(callId, { success: true });
        break;

      default:
        console.log(`[AudioBridge ${this.callId}] Unknown function: ${functionName}`);
        this.sendFunctionResult(callId, { error: 'Unknown function' });
    }
  }

  /**
   * Send function result back to Deepgram
   */
  sendFunctionResult(callId, result) {
    this.sendToDeepgram({
      type: 'FunctionCallResponse',
      function_call_id: callId,
      output: JSON.stringify(result)
    });
  }

  /**
   * Set the Telnyx WebSocket for audio streaming
   */
  setTelnyxWebSocket(ws) {
    this.telnyxWs = ws;
    this.isActive = true;
    this.stats.startTime = new Date();

    ws.on('message', (data) => {
      try {
        // Check if it's a Telnyx media message
        const message = JSON.parse(data.toString());

        if (message.event === 'media') {
          // Telnyx sends base64 encoded audio in media.payload
          const audioBuffer = Buffer.from(message.media.payload, 'base64');
          this.stats.audioPacketsFromTelnyx++;
          this.forwardAudioToDeepgram(audioBuffer);
          // Also forward to monitoring listeners (caller audio)
          this.forwardAudioToMonitors(audioBuffer, 'caller');
          this.emit('telnyx_audio', { size: audioBuffer.length });
        } else if (message.event === 'start') {
          console.log(`[AudioBridge ${this.callId}] Telnyx media stream started`);
          this.emit('telnyx_stream_started', message);
        } else if (message.event === 'stop') {
          console.log(`[AudioBridge ${this.callId}] Telnyx media stream stopped`);
          this.emit('telnyx_stream_stopped', message);
        }
      } catch (error) {
        // If it's not JSON, it might be raw audio (shouldn't happen with Telnyx)
        console.error(`[AudioBridge ${this.callId}] Error processing Telnyx message:`, error.message);
      }
    });

    ws.on('close', () => {
      console.log(`[AudioBridge ${this.callId}] Telnyx WebSocket closed`);
      this.isActive = false;
      this.stats.endTime = new Date();
      this.emit('telnyx_disconnected');
    });

    ws.on('error', (error) => {
      console.error(`[AudioBridge ${this.callId}] Telnyx WebSocket error:`, error.message);
      this.emit('error', { source: 'telnyx', error });
    });
  }

  /**
   * Forward audio from Telnyx to Deepgram
   * Audio must be sent as binary frames, not text frames
   */
  forwardAudioToDeepgram(audioBuffer) {
    if (this.deepgramWs && this.deepgramWs.readyState === WebSocket.OPEN) {
      // Explicitly send as binary frame
      this.deepgramWs.send(audioBuffer, { binary: true });
      this.stats.audioPacketsToDeepgram++;
    }
  }

  /**
   * Set the SignalWire WebSocket for audio streaming
   * NOTE: Message handling (incoming audio) is done in signalwireStream.js handleMedia()
   * This method only stores the WebSocket reference for outbound audio (Deepgram -> SignalWire)
   */
  setSignalWireWebSocket(ws, streamSid) {
    this.signalWireWs = ws;
    this.streamSid = streamSid;
    this.isActive = true;
    this.stats.startTime = new Date();

    debugLog(`[AudioBridge ${this.callId}] SignalWire WebSocket set with streamSid: ${streamSid}`);

    // Only set up close/error handlers - message handling is in signalwireStream.js
    ws.on('close', () => {
      console.log(`[AudioBridge ${this.callId}] SignalWire WebSocket closed`);
      this.isActive = false;
      this.stats.endTime = new Date();
      this.emit('signalwire_disconnected');
    });

    ws.on('error', (error) => {
      console.error(`[AudioBridge ${this.callId}] SignalWire WebSocket error:`, error.message);
      this.emit('error', { source: 'signalwire', error });
    });
  }

  /**
   * Forward audio from Deepgram to SignalWire
   */
  forwardAudioToSignalWire(audioBuffer) {
    // Log why we can't send if conditions not met
    if (!this.signalWireWs) {
      if (this.stats.audioPacketsFromDeepgram <= 5) {
        debugLog(`[AudioBridge ${this.callId}] Cannot forward to SignalWire: no WebSocket`);
        appendDeepgramLog(this.callId, `Cannot forward to SignalWire: no WebSocket`);
      }
      return;
    }
    if (this.signalWireWs.readyState !== WebSocket.OPEN) {
      if (this.stats.audioPacketsFromDeepgram <= 5) {
        debugLog(`[AudioBridge ${this.callId}] Cannot forward to SignalWire: WebSocket not open (state: ${this.signalWireWs.readyState})`);
        appendDeepgramLog(this.callId, `Cannot forward to SignalWire: WebSocket not open`);
      }
      return;
    }
    if (!this.streamSid) {
      if (this.stats.audioPacketsFromDeepgram <= 5) {
        debugLog(`[AudioBridge ${this.callId}] Cannot forward to SignalWire: no streamSid`);
        appendDeepgramLog(this.callId, `Cannot forward to SignalWire: no streamSid`);
      }
      return;
    }

    // SignalWire expects media messages in a specific format
    const mediaMessage = {
      event: 'media',
      streamSid: this.streamSid,
      media: {
        payload: audioBuffer.toString('base64')
      }
    };
    this.signalWireWs.send(JSON.stringify(mediaMessage));
    this.stats.audioPacketsToSignalWire++;

    // Log audio packets sent to SignalWire (first 10 and every 100th)
    if (this.stats.audioPacketsToSignalWire <= 10 || this.stats.audioPacketsToSignalWire % 100 === 0) {
      debugLog(`[AudioBridge ${this.callId}] Sent audio to SignalWire: ${audioBuffer.length} bytes (packet #${this.stats.audioPacketsToSignalWire})`);
    }
  }

  /**
   * Clear audio buffer (for SignalWire)
   */
  clearAudioBuffer() {
    if (this.signalWireWs && this.signalWireWs.readyState === WebSocket.OPEN && this.streamSid) {
      const clearMessage = {
        event: 'clear',
        streamSid: this.streamSid
      };
      this.signalWireWs.send(JSON.stringify(clearMessage));
    }
  }

  /**
   * Send audio to Deepgram (used by SignalWire handler)
   */
  async sendAudioToDeepgram(audioBuffer) {
    return this.forwardAudioToDeepgram(audioBuffer);
  }


  /**
   * Forward audio from Deepgram to Telnyx
   */
  forwardAudioToTelnyx(audioBuffer) {
    if (this.telnyxWs && this.telnyxWs.readyState === WebSocket.OPEN) {
      // Telnyx expects media messages in a specific format
      const mediaMessage = {
        event: 'media',
        streamSid: this.streamSid,
        media: {
          payload: audioBuffer.toString('base64')
        }
      };
      this.telnyxWs.send(JSON.stringify(mediaMessage));
      this.stats.audioPacketsToTelnyx++;
    }
  }

  /**
   * Send a message to Deepgram
   */
  sendToDeepgram(message) {
    if (this.deepgramWs && this.deepgramWs.readyState === WebSocket.OPEN) {
      this.deepgramWs.send(JSON.stringify(message));
    }
  }

  /**
   * Send a keep-alive message to Deepgram
   */
  sendKeepAlive() {
    this.sendToDeepgram({ type: 'KeepAlive' });
  }

  /**
   * Get the full transcript
   */
  getTranscript() {
    return this.transcript.map(t => `${t.role}: ${t.content}`).join('\n');
  }

  /**
   * Get call statistics
   */
  getStats() {
    const duration = this.stats.endTime
      ? (this.stats.endTime - this.stats.startTime) / 1000
      : this.stats.startTime
        ? (new Date() - this.stats.startTime) / 1000
        : 0;

    return {
      ...this.stats,
      durationSeconds: Math.round(duration),
      transcript: this.getTranscript()
    };
  }

  /**
   * Close all connections
   */
  async close() {
    console.log(`[AudioBridge ${this.callId}] Closing audio bridge`);

    this.isActive = false;
    this.stats.endTime = new Date();

    // Send close signal to Deepgram
    if (this.deepgramWs && this.deepgramWs.readyState === WebSocket.OPEN) {
      this.sendToDeepgram({ type: 'CloseStream' });
      await new Promise(resolve => setTimeout(resolve, 100));
      this.deepgramWs.close();
    }

    // Close Telnyx connection
    if (this.telnyxWs && this.telnyxWs.readyState === WebSocket.OPEN) {
      this.telnyxWs.close();
    }

    this.emit('closed', this.getStats());
  }
}

/**
 * AudioBridgeManager manages multiple concurrent audio bridges
 */
class AudioBridgeManager {
  constructor() {
    this.bridges = new Map();
  }

  /**
   * Create a new audio bridge for a call
   */
  async createBridge(options) {
    const bridge = new AudioBridge(options);
    this.bridges.set(bridge.callId, bridge);

    // Clean up when bridge closes
    bridge.on('closed', () => {
      this.bridges.delete(bridge.callId);
    });

    return bridge;
  }

  /**
   * Get an existing bridge by call ID
   */
  getBridge(callId) {
    return this.bridges.get(callId);
  }

  /**
   * Get all active bridges
   */
  getActiveBridges() {
    return Array.from(this.bridges.values()).filter(b => b.isActive);
  }

  /**
   * Close all bridges
   */
  async closeAll() {
    for (const bridge of this.bridges.values()) {
      await bridge.close();
    }
  }

  /**
   * Get stats for all bridges
   */
  getAllStats() {
    return Array.from(this.bridges.entries()).map(([id, bridge]) => ({
      callId: id,
      ...bridge.getStats()
    }));
  }
}

// Create singleton manager
export const audioBridgeManager = new AudioBridgeManager();
export { AudioBridge };
export default audioBridgeManager;
