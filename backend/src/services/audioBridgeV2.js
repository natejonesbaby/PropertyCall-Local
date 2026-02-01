/**
 * Audio Bridge Service (V2 - with Audio Adapters)
 *
 * This service manages the bidirectional audio streaming between:
 * - Telnyx/SignalWire (telephony providers) via audio adapters - sends/receives G.711/mu-law audio
 * - Deepgram Voice Agent - sends/receives AI conversation audio
 *
 * Architecture:
 * 1. Telnyx/SignalWire sends audio via WebSocket to our server
 * 2. Audio adapter receives and normalizes the audio
 * 3. We forward that audio to Deepgram Voice Agent WebSocket
 * 4. Deepgram processes with STT, LLM, and TTS
 * 5. Deepgram sends response audio back to us
 * 6. We forward that audio back to the telephony provider via audio adapter
 *
 * This version uses the new AudioAdapter interface for provider-agnostic audio handling.
 */

import WebSocket from 'ws';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { createAudioAdapter } from '../providers/audio-adapter-factory.js';
import {
  convertProviderAudioToDeepgram,
  convertDeepgramAudioToProvider,
  getAudioFormatInfo
} from '../utils/audio-format-converter.js';

// Audio format constants
const PROVIDERS_SAMPLE_RATE = 8000;  // G.711 ulaw at 8kHz for both Telnyx and SignalWire
const DEEPGRAM_SAMPLE_RATE = 16000;  // Linear16 at 16kHz

/**
 * Connection states for AudioBridge
 */
const BridgeState = {
  DISCONNECTED: 'disconnected',       // No connections established
  CONNECTING_PROVIDER: 'connecting_provider',  // Connecting to provider
  CONNECTING_DEEPGRAM: 'connecting_deepgram',  // Connecting to Deepgram
  CONNECTED: 'connected',              // Both connections established, ready to stream
  STREAMING: 'streaming',              // Actively streaming audio
  CLOSING: 'closing',                  // Gracefully closing connections
  ERROR: 'error',                      // Error state
  RECONNECTING: 'reconnecting'         // Attempting to reconnect
};

/**
 * Connection event types for logging
 */
const ConnectionEventType = {
  BRIDGE_CREATED: 'bridge_created',
  BRIDGE_CLOSED: 'bridge_closed',
  PROVIDER_CONNECTING: 'provider_connecting',
  PROVIDER_CONNECTED: 'provider_connected',
  PROVIDER_DISCONNECTED: 'provider_disconnected',
  PROVIDER_RECONNECTING: 'provider_reconnecting',
  DEEPGRAM_CONNECTING: 'deepgram_connecting',
  DEEPGRAM_CONNECTED: 'deepgram_connected',
  DEEPGRAM_DISCONNECTED: 'deepgram_disconnected',
  DEEPGRAM_RECONNECTING: 'deepgram_reconnecting',
  STREAMING_STARTED: 'streaming_started',
  STREAMING_STOPPED: 'streaming_stopped',
  STATE_CHANGED: 'state_changed',
  ERROR: 'error',
  CLEANUP_STARTED: 'cleanup_started',
  CLEANUP_COMPLETED: 'cleanup_completed'
};

/**
 * AudioBridge manages a single call's audio streaming between providers and Deepgram
 */
class AudioBridge extends EventEmitter {
  constructor(options = {}) {
    super();

    this.callId = options.callId || crypto.randomUUID();
    this.provider = options.provider || 'telnyx';  // 'telnyx' or 'signalwire'
    this.deepgramApiKey = options.deepgramApiKey;
    this.openaiApiKey = options.openaiApiKey;
    this.systemPrompt = options.systemPrompt || '';
    this.greetingMessage = options.greetingMessage || '';
    this.leadInfo = options.leadInfo || {};
    this.voice = options.voice || 'aura-asteria-en';  // Deepgram Aura-2 voice selection

    // Allow WebSocket class injection for testing
    this.WebSocketClass = options.WebSocketClass || WebSocket;

    // Audio adapter for provider
    this.audioAdapter = null;

    // Deepgram connection
    this.deepgramWs = null;
    this.isActive = false;
    this.sessionId = null;

    // Connection state tracking
    this._state = BridgeState.DISCONNECTED;
    this.connectionState = {
      provider: false,    // true when provider WebSocket is connected
      deepgram: false     // true when Deepgram WebSocket is connected
    };

    // Reconnection configuration
    this.maxReconnectAttempts = 3;
    this.reconnectDelay = 1000;  // 1 second
    this.reconnectAttempts = {
      provider: 0,
      deepgram: 0
    };

    // Connection event log for debugging
    this.connectionLog = [];
    this.maxLogEntries = 100;  // Keep last 100 connection events

    // Transcript accumulation
    this.transcript = [];
    this.currentUtterance = '';

    // Statistics
    this.stats = {
      audioPacketsFromProvider: 0,
      audioPacketsToDeepgram: 0,
      audioPacketsFromDeepgram: 0,
      audioPacketsToProvider: 0,
      startTime: null,
      endTime: null,
      disconnectCount: 0,
      reconnectCount: 0
    };

    // Live monitoring listeners - WebSocket connections that receive audio
    this.monitorListeners = new Set();

    // Initialize audio adapter
    this._initializeAudioAdapter();

    // Log bridge creation
    this._logConnectionEvent(ConnectionEventType.BRIDGE_CREATED, {
      provider: this.provider,
      voice: this.voice
    });
  }

  /**
   * Log connection event for monitoring and debugging
   * @private
   */
  _logConnectionEvent(eventType, data = {}) {
    const eventData = {
      type: eventType,
      callId: this.callId,
      provider: this.provider,
      timestamp: new Date().toISOString(),
      ...data
    };

    // Emit event for external listeners
    this.emit('connection_event', eventData);

    // Log to console if debug mode is enabled
    if (process.env.AUDIO_BRIDGE_DEBUG === 'true') {
      console.log(`[AudioBridge ${this.callId}] Connection Event:`, eventType, data);
    }
  }

  /**
   * Initialize the audio adapter for the provider
   */
  _initializeAudioAdapter() {
    this.audioAdapter = createAudioAdapter(this.provider, {
      callId: this.callId,
      debug: process.env.AUDIO_BRIDGE_DEBUG === 'true'
    });

    this._setupAudioAdapterListeners();
  }

  /**
   * Set up event listeners for the audio adapter
   * This is a separate method so it can be called when replacing the adapter in tests
   * @private
   */
  _setupAudioAdapterListeners() {
    // Set up audio adapter event handlers with enhanced connection management
    this.audioAdapter.on('connected', (data) => {
      console.log(`[AudioBridge ${this.callId}] Audio adapter connected`);
      this.connectionState.provider = true;
      this.reconnectAttempts.provider = 0;  // Reset reconnect counter
      this._logConnectionEvent(ConnectionEventType.PROVIDER_CONNECTED, data);
      this._updateBridgeState();

      // Notify that provider is ready
      this.emit('provider_connected', { callId: this.callId, provider: this.provider });
    });

    this.audioAdapter.on('disconnected', async (data) => {
      console.log(`[AudioBridge ${this.callId}] Audio adapter disconnected`);
      this.connectionState.provider = false;
      this.isActive = false;
      this.stats.disconnectCount++;
      this._logConnectionEvent(ConnectionEventType.PROVIDER_DISCONNECTED, data);

      // Attempt reconnection if within limits and not closing
      if (this._state !== BridgeState.CLOSING &&
          this._state !== BridgeState.DISCONNECTED &&
          this.reconnectAttempts.provider < this.maxReconnectAttempts) {

        this._logConnectionEvent(ConnectionEventType.PROVIDER_RECONNECTING, {
          attempt: this.reconnectAttempts.provider + 1,
          maxAttempts: this.maxReconnectAttempts
        });

        await this._handleProviderDisconnect();
      } else if (this._state !== BridgeState.CLOSING) {
        // Exceeded reconnect attempts or shouldn't reconnect
        console.error(`[AudioBridge ${this.callId}] Provider disconnect - cannot reconnect`);
        this._setState(BridgeState.ERROR);
        this.emit('provider_disconnected', {
          callId: this.callId,
          reason: 'Provider disconnected and reconnection failed',
          reconnectAttempts: this.reconnectAttempts.provider
        });
      }

      this._updateBridgeState();
    });

    this.audioAdapter.on('stream_started', (data) => {
      console.log(`[AudioBridge ${this.callId}] Audio streaming started`);
      this._logConnectionEvent(ConnectionEventType.STREAMING_STARTED, data);
      this._setState(BridgeState.STREAMING);
      this.isActive = true;
    });

    this.audioAdapter.on('stream_stopped', (data) => {
      console.log(`[AudioBridge ${this.callId}] Audio streaming stopped`);
      this._logConnectionEvent(ConnectionEventType.STREAMING_STOPPED, data);
      this._setState(BridgeState.CONNECTED);  // Still connected but not streaming
      this.isActive = false;
    });

    this.audioAdapter.on('audio_from_provider', (data) => {
      this._handleAudioFromProvider(data.audioBuffer, data.metadata);
    });

    this.audioAdapter.on('error', (data) => {
      console.error(`[AudioBridge ${this.callId}] Audio adapter error:`, data.error);
      this._logConnectionEvent(ConnectionEventType.ERROR, {
        source: this.provider,
        error: data.error
      });
      this.emit('error', { source: this.provider, error: data.error });
    });

    this.audioAdapter.on('state_changed', (data) => {
      console.log(`[AudioBridge ${this.callId}] Audio adapter state: ${data.oldState} -> ${data.newState}`);
      this._logConnectionEvent(ConnectionEventType.STATE_CHANGED, {
        component: 'audio_adapter',
        oldState: data.oldState,
        newState: data.newState
      });
    });
  }

  /**
   * Set a custom audio adapter (for testing or advanced use cases)
   * This removes existing listeners from the old adapter and sets up new ones
   * @param {AudioAdapter} adapter - The audio adapter to use
   */
  setAudioAdapter(adapter) {
    // Remove all listeners from old adapter if it exists
    if (this.audioAdapter) {
      this.audioAdapter.removeAllListeners();
    }

    // Set new adapter
    this.audioAdapter = adapter;

    // Set up event listeners on the new adapter
    this._setupAudioAdapterListeners();
  }

  /**
   * Handle audio received from the provider
   */
  _handleAudioFromProvider(audioBuffer, metadata) {
    this.stats.audioPacketsFromProvider++;

    // Convert provider audio (mulaw 8kHz) to Deepgram format (Linear16 16kHz)
    let convertedAudio;
    try {
      convertedAudio = convertProviderAudioToDeepgram(audioBuffer);

      if (process.env.AUDIO_BRIDGE_DEBUG === 'true') {
        const originalInfo = getAudioFormatInfo(audioBuffer, {
          encoding: 'mulaw',
          sampleRate: PROVIDERS_SAMPLE_RATE,
          channels: 1
        });
        const convertedInfo = getAudioFormatInfo(convertedAudio, {
          encoding: 'linear16',
          sampleRate: DEEPGRAM_SAMPLE_RATE,
          channels: 1
        });
        console.log(`[AudioBridge ${this.callId}] Audio conversion:`, {
          original: originalInfo,
          converted: convertedInfo
        });
      }
    } catch (error) {
      console.error(`[AudioBridge ${this.callId}] Audio conversion error:`, error);
      // If conversion fails, try sending original audio
      convertedAudio = audioBuffer;
    }

    // Forward to Deepgram (in correct format)
    this.forwardAudioToDeepgram(convertedAudio);

    // Forward to monitoring listeners (caller audio) - send original for monitoring
    this.forwardAudioToMonitors(audioBuffer, 'caller');

    // Emit event
    this.emit('provider_audio', {
      size: audioBuffer.length,
      source: this.provider
    });
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
      sampleRate: PROVIDERS_SAMPLE_RATE
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
    this._logConnectionEvent(ConnectionEventType.DEEPGRAM_CONNECTING);
    this._setState(BridgeState.CONNECTING_DEEPGRAM);

    return new Promise((resolve, reject) => {
      // Use environment variable for testing with mock server, default to production URL
      const wsUrl = process.env.DEEPGRAM_AGENT_WS_URL || 'wss://agent.deepgram.com/v1/agent/converse';

      this.deepgramWs = new this.WebSocketClass(wsUrl, {
        headers: {
          'Authorization': `Token ${this.deepgramApiKey}`
        }
      });

      this.deepgramWs.on('open', () => {
        console.log(`[AudioBridge ${this.callId}] Connected to Deepgram Voice Agent`);
        this.connectionState.deepgram = true;
        this.reconnectAttempts.deepgram = 0;  // Reset reconnect counter
        this._logConnectionEvent(ConnectionEventType.DEEPGRAM_CONNECTED);
        this._updateBridgeState();

        // Configure the voice agent
        this.configureDeepgramAgent();
        resolve();

        // Notify that Deepgram is ready
        this.emit('deepgram_connected', { callId: this.callId });
      });

      this.deepgramWs.on('message', (data) => {
        this.handleDeepgramMessage(data);
      });

      this.deepgramWs.on('error', (error) => {
        console.error(`[AudioBridge ${this.callId}] Deepgram WebSocket error:`, error.message);
        this._logConnectionEvent(ConnectionEventType.ERROR, {
          source: 'deepgram',
          error: error.message
        });
        this.emit('error', { source: 'deepgram', error });

        // Only reject if we're still connecting and haven't opened yet
        if (this.deepgramWs.readyState !== WebSocket.OPEN) {
          reject(error);
        }
      });

      this.deepgramWs.on('close', async (code, reason) => {
        console.log(`[AudioBridge ${this.callId}] Deepgram WebSocket closed: ${code} - ${reason}`);
        this.connectionState.deepgram = false;
        this.stats.disconnectCount++;
        this._logConnectionEvent(ConnectionEventType.DEEPGRAM_DISCONNECTED, { code, reason: reason.toString() });

        // Attempt reconnection if within limits and not closing
        if (this._state !== BridgeState.CLOSING &&
            this._state !== BridgeState.DISCONNECTED &&
            this.reconnectAttempts.deepgram < this.maxReconnectAttempts) {

          this._logConnectionEvent(ConnectionEventType.DEEPGRAM_RECONNECTING, {
            attempt: this.reconnectAttempts.deepgram + 1,
            maxAttempts: this.maxReconnectAttempts
          });

          await this._handleDeepgramDisconnect(code, reason);
        } else if (this._state !== BridgeState.CLOSING) {
          // Exceeded reconnect attempts or shouldn't reconnect
          console.error(`[AudioBridge ${this.callId}] Deepgram disconnect - cannot reconnect`);
          this._setState(BridgeState.ERROR);
          this.emit('deepgram_disconnected', {
            callId: this.callId,
            code,
            reason: reason.toString(),
            reconnectAttempts: this.reconnectAttempts.deepgram
          });
        }

        this._updateBridgeState();
      });

      // Timeout for connection
      setTimeout(() => {
        if (this.deepgramWs.readyState !== WebSocket.OPEN) {
          const timeoutError = new Error('Deepgram connection timeout');
          this._logConnectionEvent(ConnectionEventType.ERROR, {
            source: 'deepgram',
            error: 'Connection timeout'
          });
          this._setState(BridgeState.ERROR);
          reject(timeoutError);
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
      type: 'SettingsConfiguration',
      audio: {
        input: {
          encoding: 'linear16',  // Deepgram expects Linear16
          sample_rate: DEEPGRAM_SAMPLE_RATE  // 16kHz for best quality
        },
        output: {
          encoding: 'linear16',  // Deepgram sends Linear16
          sample_rate: DEEPGRAM_SAMPLE_RATE,
          container: 'none'
        }
      },
      agent: {
        listen: {
          model: 'nova-2'  // Deepgram's best STT model
        },
        think: {
          provider: {
            type: 'open_ai'
          },
          model: 'gpt-4o-mini',
          instructions: `${this.systemPrompt}\n\n${leadContext}`.trim(),
          functions: this.getAgentFunctions()
        },
        speak: {
          model: this.voice  // User-configured Deepgram Aura-2 voice
        }
      }
    };

    // Add greeting if provided
    if (this.greetingMessage) {
      config.agent.greeting = this.greetingMessage;
    }

    this.sendToDeepgram(config);
    console.log(`[AudioBridge ${this.callId}] Sent configuration to Deepgram`);
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

      // Binary audio data from Deepgram TTS (Linear16 16kHz)
      this.stats.audioPacketsFromDeepgram++;

      // Convert Deepgram audio (Linear16 16kHz) to provider format (mulaw 8kHz)
      let convertedAudio;
      try {
        convertedAudio = convertDeepgramAudioToProvider(data);

        if (process.env.AUDIO_BRIDGE_DEBUG === 'true') {
          const originalInfo = getAudioFormatInfo(data, {
            encoding: 'linear16',
            sampleRate: DEEPGRAM_SAMPLE_RATE,
            channels: 1
          });
          const convertedInfo = getAudioFormatInfo(convertedAudio, {
            encoding: 'mulaw',
            sampleRate: PROVIDERS_SAMPLE_RATE,
            channels: 1
          });
          console.log(`[AudioBridge ${this.callId}] Deepgram audio conversion:`, {
            original: originalInfo,
            converted: convertedInfo
          });
        }
      } catch (error) {
        console.error(`[AudioBridge ${this.callId}] Deepgram audio conversion error:`, error);
        // If conversion fails, try sending original audio
        convertedAudio = data;
      }

      // Forward to provider via audio adapter (in correct format)
      this.forwardAudioToProvider(convertedAudio);

      // Also forward to monitoring listeners (agent audio) - send original for monitoring
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
        this.emit('agent_thinking', { content: message.content });
        break;

      case 'AgentStartedSpeaking':
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
   * Set the provider WebSocket for audio streaming (legacy method)
   * This method is kept for backward compatibility
   */
  setProviderWebSocket(ws, streamSid = null) {
    console.log(`[AudioBridge ${this.callId}] Setting provider WebSocket (legacy method)`);
    this.audioAdapter.setWebSocket(ws, streamSid);
    this.isActive = true;
    this.stats.startTime = new Date();
  }

  /**
   * Forward audio from provider to Deepgram
   */
  forwardAudioToDeepgram(audioBuffer) {
    if (this.deepgramWs && this.deepgramWs.readyState === WebSocket.OPEN) {
      this.deepgramWs.send(audioBuffer);
      this.stats.audioPacketsToDeepgram++;
    }
  }

  /**
   * Forward audio from Deepgram to provider
   * Note: Audio should already be converted to provider format before calling this
   */
  async forwardAudioToProvider(audioBuffer) {
    if (this.audioAdapter && this.audioAdapter.isReady()) {
      await this.audioAdapter.sendAudioToProvider(audioBuffer);
      this.stats.audioPacketsToProvider++;
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
      transcript: this.getTranscript(),
      provider: this.provider,
      audioAdapterState: this.audioAdapter?.getState(),
      audioAdapterStats: this.audioAdapter?.getStats(),
      bridgeState: this._state,
      connectionState: { ...this.connectionState },
      reconnectAttempts: { ...this.reconnectAttempts }
    };
  }

  /**
   * Get current bridge state
   */
  getState() {
    return this._state;
  }

  /**
   * Check if bridge is connected (both provider and Deepgram)
   */
  isConnected() {
    return this.connectionState.provider && this.connectionState.deepgram;
  }

  /**
   * Get connection event log
   */
  getConnectionLog() {
    return [...this.connectionLog];
  }

  /**
   * Set bridge state and emit event
   * @private
   */
  _setState(newState) {
    const oldState = this._state;
    if (oldState !== newState) {
      this._state = newState;
      console.log(`[AudioBridge ${this.callId}] State: ${oldState} -> ${newState}`);
      this._logConnectionEvent(ConnectionEventType.STATE_CHANGED, {
        bridge: true,
        oldState,
        newState
      });
      this.emit('state_changed', { oldState, newState });
    }
  }

  /**
   * Update bridge state based on connection states
   * @private
   */
  _updateBridgeState() {
    const { provider, deepgram } = this.connectionState;

    if (this._state === BridgeState.CLOSING || this._state === BridgeState.ERROR) {
      // Don't change state if closing or in error
      return;
    }

    if (!provider && !deepgram) {
      this._setState(BridgeState.DISCONNECTED);
    } else if (provider && deepgram) {
      if (this.isActive) {
        this._setState(BridgeState.STREAMING);
      } else {
        this._setState(BridgeState.CONNECTED);
      }
    } else if (provider) {
      this._setState(BridgeState.CONNECTING_DEEPGRAM);
    } else if (deepgram) {
      this._setState(BridgeState.CONNECTING_PROVIDER);
    }
  }

  /**
   * Log connection event for debugging
   * @private
   */
  _logConnectionEvent(eventType, data = {}) {
    const event = {
      type: eventType,
      timestamp: new Date().toISOString(),
      data
    };

    this.connectionLog.push(event);

    // Keep only the last N events
    if (this.connectionLog.length > this.maxLogEntries) {
      this.connectionLog.shift();
    }

    // Also log to console for debugging
    if (process.env.AUDIO_BRIDGE_DEBUG === 'true') {
      console.log(`[AudioBridge ${this.callId}] Connection Event: ${eventType}`, data);
    }
  }

  /**
   * Handle provider disconnect with reconnection attempt
   * @private
   */
  async _handleProviderDisconnect() {
    this.reconnectAttempts.provider++;
    this.stats.reconnectCount++;
    this._setState(BridgeState.RECONNECTING);

    console.log(`[AudioBridge ${this.callId}] Attempting provider reconnection ${this.reconnectAttempts.provider}/${this.maxReconnectAttempts}`);

    // Wait before reconnecting (exponential backoff)
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts.provider - 1);
    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      // The audio adapter should handle reconnection internally
      // Just wait a bit and check if it's reconnected
      await new Promise(resolve => setTimeout(resolve, 2000));

      if (!this.connectionState.provider) {
        throw new Error('Provider reconnection failed');
      }

      console.log(`[AudioBridge ${this.callId}] Provider reconnected successfully`);
      this._updateBridgeState();
    } catch (error) {
      console.error(`[AudioBridge ${this.callId}] Provider reconnection error:`, error.message);
      this._logConnectionEvent(ConnectionEventType.ERROR, {
        source: 'provider_reconnect',
        error: error.message,
        attempt: this.reconnectAttempts.provider
      });
    }
  }

  /**
   * Handle Deepgram disconnect with reconnection attempt
   * @private
   */
  async _handleDeepgramDisconnect(code, reason) {
    this.reconnectAttempts.deepgram++;
    this.stats.reconnectCount++;
    this._setState(BridgeState.RECONNECTING);

    console.log(`[AudioBridge ${this.callId}] Attempting Deepgram reconnection ${this.reconnectAttempts.deepgram}/${this.maxReconnectAttempts}`);

    // Wait before reconnecting (exponential backoff)
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts.deepgram - 1);
    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      // Reconnect to Deepgram
      await this.connectToDeepgram();
      console.log(`[AudioBridge ${this.callId}] Deepgram reconnected successfully`);
      this._updateBridgeState();
    } catch (error) {
      console.error(`[AudioBridge ${this.callId}] Deepgram reconnection error:`, error.message);
      this._logConnectionEvent(ConnectionEventType.ERROR, {
        source: 'deepgram_reconnect',
        error: error.message,
        attempt: this.reconnectAttempts.deepgram
      });
    }
  }

  /**
   * Close all connections with graceful cleanup
   */
  async close() {
    console.log(`[AudioBridge ${this.callId}] Closing audio bridge`);
    this._logConnectionEvent(ConnectionEventType.CLEANUP_STARTED);
    this._setState(BridgeState.CLOSING);

    this.isActive = false;
    this.stats.endTime = new Date();

    // Clear any pending reconnection timers
    // (Note: In a production system, you'd want to track and clear these)

    // 1. Send close signal to Deepgram first (graceful shutdown)
    if (this.deepgramWs && this.deepgramWs.readyState === WebSocket.OPEN) {
      try {
        this.sendToDeepgram({ type: 'CloseStream' });
        console.log(`[AudioBridge ${this.callId}] Sent CloseStream to Deepgram`);

        // Give Deepgram time to acknowledge
        await new Promise(resolve => setTimeout(resolve, 200));

        // Close Deepgram WebSocket
        this.deepgramWs.close();
        this.connectionState.deepgram = false;
        console.log(`[AudioBridge ${this.callId}] Deepgram WebSocket closed`);
      } catch (error) {
        console.error(`[AudioBridge ${this.callId}] Error closing Deepgram:`, error.message);
        this._logConnectionEvent(ConnectionEventType.ERROR, {
          source: 'deepgram_close',
          error: error.message
        });
      }
    }

    // 2. Disconnect audio adapter
    if (this.audioAdapter) {
      try {
        await this.audioAdapter.disconnect();
        this.connectionState.provider = false;
        console.log(`[AudioBridge ${this.callId}] Audio adapter disconnected`);
      } catch (error) {
        console.error(`[AudioBridge ${this.callId}] Error disconnecting audio adapter:`, error.message);
        this._logConnectionEvent(ConnectionEventType.ERROR, {
          source: 'provider_close',
          error: error.message
        });
      }
    }

    // 3. Clear monitoring listeners
    this.monitorListeners.clear();

    // 4. Final state update
    this._setState(BridgeState.DISCONNECTED);
    this._logConnectionEvent(ConnectionEventType.CLEANUP_COMPLETED);
    this._logConnectionEvent(ConnectionEventType.BRIDGE_CLOSED, {
      stats: this.getStats()
    });

    // Emit closed event with final stats
    this.emit('closed', this.getStats());

    console.log(`[AudioBridge ${this.callId}] Audio bridge cleanup complete`);
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
export { AudioBridge, BridgeState, ConnectionEventType };
export default audioBridgeManager;
