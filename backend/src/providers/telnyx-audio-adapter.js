/**
 * Telnyx Audio Adapter
 *
 * Implements the audio adapter interface for Telnyx telephony provider.
 * Handles WebSocket audio streaming between Telnyx and the AI agent.
 *
 * @module providers/telnyx-audio-adapter
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';

// Audio format constants for Telnyx
const TELNYX_ENCODING = 'mulaw';
const TELNYX_SAMPLE_RATE = 8000;
const TELNYX_CHANNELS = 1;

/**
 * Telnyx Audio Adapter
 *
 * Manages audio streaming for Telnyx calls, implementing the AudioAdapter interface.
 */
class TelnyxAudioAdapter extends EventEmitter {
  /**
   * Create a new TelnyxAudioAdapter
   * @param {Object} options - Configuration options
   * @param {string} options.callId - Unique identifier for this call
   * @param {boolean} options.debug - Enable debug logging
   */
  constructor(options = {}) {
    super();

    this.name = 'telnyx';
    this.version = '1.0.0';
    this.callId = options.callId || 'unknown';
    this.debug = options.debug || false;

    // WebSocket connection
    this.ws = null;
    this.streamSid = null;

    // Audio configuration
    this.audioConfig = {
      encoding: TELNYX_ENCODING,
      sampleRate: TELNYX_SAMPLE_RATE,
      channels: TELNYX_CHANNELS
    };

    // Connection state
    this._state = 'disconnected';
    this._isStreaming = false;

    // Statistics
    this.stats = {
      packetsFromProvider: 0,
      packetsToAgent: 0,
      packetsFromAgent: 0,
      packetsToProvider: 0,
      bytesFromProvider: 0,
      bytesToProvider: 0,
      startTime: null,
      endTime: null,
      state: 'disconnected'
    };

    // Log initialization
    this._log('TelnyxAudioAdapter initialized', { callId: this.callId });
  }

  /**
   * Get current connection state
   */
  get state() {
    return this._state;
  }

  /**
   * Get whether adapter is actively streaming
   */
  get isStreaming() {
    return this._isStreaming;
  }

  /**
   * Initialize the adapter
   */
  async initialize(options = {}) {
    this._log('Initializing TelnyxAudioAdapter', options);

    if (options.callId) {
      this.callId = options.callId;
    }

    // If WebSocket URL provided, connect immediately
    if (options.wsUrl) {
      await this.connect(options.wsUrl);
    }
  }

  /**
   * Connect to Telnyx WebSocket
   */
  async connect(wsUrl) {
    this._log('Connecting to Telnyx WebSocket', { wsUrl });
    this.setState('connecting');

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsUrl);

        this.ws.on('open', () => {
          this._log('Telnyx WebSocket connected');
          this.setState('connected');
          this.emit('connected', { callId: this.callId });
          resolve();
        });

        this.ws.on('message', (data) => {
          this._handleMessage(data);
        });

        this.ws.on('error', (error) => {
          this._log('Telnyx WebSocket error', error);
          this.emit('error', { source: 'telnyx', error });
          if (this.state === 'connecting') {
            reject(error);
          }
        });

        this.ws.on('close', () => {
          this._log('Telnyx WebSocket closed');
          this.setState('disconnected');
          this.emit('disconnected', { callId: this.callId });
        });

        // Connection timeout
        setTimeout(() => {
          if (this.state === 'connecting') {
            reject(new Error('Telnyx WebSocket connection timeout'));
          }
        }, 10000);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from Telnyx
   */
  async disconnect() {
    this._log('Disconnecting Telnyx WebSocket');

    this._isStreaming = false;
    this.setState('closing');

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }

    this.ws = null;
    this.streamSid = null;
    this.stats.endTime = new Date();
    this.setState('disconnected');

    this._log('Telnyx WebSocket disconnected');
  }

  /**
   * Start streaming audio
   */
  async startStreaming() {
    this._log('Starting audio streaming');
    this._isStreaming = true;
    this.stats.startTime = new Date();
    this.setState('streaming');
    this.emit('stream_started', { callId: this.callId });
  }

  /**
   * Stop streaming audio
   */
  async stopStreaming() {
    this._log('Stopping audio streaming');
    this._isStreaming = false;
    this.stats.endTime = new Date();
    this.setState('connected');
    this.emit('stream_stopped', { callId: this.callId });
  }

  /**
   * Send audio to Telnyx (caller hears this)
   */
  async sendAudioToProvider(audioBuffer) {
    if (!this.isReady() || !this.streamSid) {
      this._log('Cannot send audio: not ready or no streamSid');
      return;
    }

    try {
      // Telnyx expects media messages in specific format
      const mediaMessage = {
        event: 'media',
        streamSid: this.streamSid,
        media: {
          payload: audioBuffer.toString('base64')
        }
      };

      this.ws.send(JSON.stringify(mediaMessage));
      this.stats.packetsToProvider++;
      this.stats.bytesToProvider += audioBuffer.length;

      this.emit('audio_to_provider', {
        size: audioBuffer.length,
        timestamp: new Date()
      });
    } catch (error) {
      this._log('Error sending audio to Telnyx', error);
      this.emit('error', { source: 'telnyx', action: 'send_audio', error });
    }
  }

  /**
   * Handle incoming messages from Telnyx
   */
  _handleMessage(data) {
    try {
      const message = JSON.parse(data.toString());

      switch (message.event) {
        case 'start':
          this._handleStreamStart(message);
          break;

        case 'media':
          this._handleMedia(message);
          break;

        case 'stop':
          this._handleStreamStop(message);
          break;

        default:
          // Other events logged but not processed
          this._log('Telnyx event', { event: message.event });
      }
    } catch (error) {
      // If not JSON, might be binary data (shouldn't happen with Telnyx)
      this._log('Error parsing Telnyx message', error);
    }
  }

  /**
   * Handle stream started event
   */
  _handleStreamStart(message) {
    this.streamSid = message.streamSid;
    this._log('Telnyx stream started', { streamSid: this.streamSid });
    this.emit('stream_started', { callId: this.callId, streamSid: this.streamSid });
  }

  /**
   * Handle media (audio) event
   */
  _handleMedia(message) {
    if (!this._isStreaming) {
      return;
    }

    try {
      // Telnyx sends base64 encoded audio in media.payload
      const audioBuffer = Buffer.from(message.media.payload, 'base64');

      this.stats.packetsFromProvider++;
      this.stats.bytesFromProvider += audioBuffer.length;

      const metadata = {
        size: audioBuffer.length,
        timestamp: new Date(),
        source: 'caller'
      };

      this.emit('audio_from_provider', {
        audioBuffer,
        metadata
      });
    } catch (error) {
      this._log('Error handling media from Telnyx', error);
    }
  }

  /**
   * Handle stream stopped event
   */
  _handleStreamStop(message) {
    this._log('Telnyx stream stopped');
    this._isStreaming = false;
    this.stats.endTime = new Date();
    this.setState('connected');
    this.emit('stream_stopped', { callId: this.callId });
  }

  /**
   * Receive audio from provider (called externally)
   */
  receiveAudioFromProvider(audioBuffer, metadata = {}) {
    if (!this._isStreaming) {
      return;
    }

    this.stats.packetsFromProvider++;
    this.stats.bytesFromProvider += audioBuffer.length;

    const enhancedMetadata = {
      size: audioBuffer.length,
      timestamp: new Date(),
      source: 'caller',
      ...metadata
    };

    this.emit('audio_from_provider', {
      audioBuffer,
      metadata: enhancedMetadata
    });
  }

  /**
   * Get current statistics
   */
  getStats() {
    return {
      ...this.stats,
      state: this.state,
      isStreaming: this.isStreaming
    };
  }

  /**
   * Get current state
   */
  getState() {
    return this.state;
  }

  /**
   * Set connection state
   */
  setState(newState) {
    const oldState = this.state;
    this._state = newState;
    this.stats.state = newState;

    if (oldState !== newState) {
      this._log('State changed', { from: oldState, to: newState });
      this.emit('state_changed', { oldState, newState });
    }
  }

  /**
   * Check if adapter is ready
   */
  isReady() {
    return this.state === 'connected' || this.state === 'streaming';
  }

  /**
   * Set WebSocket connection (if established externally)
   */
  setWebSocket(ws, streamId = null) {
    this._log('Setting WebSocket externally', { hasStreamId: !!streamId });

    this.ws = ws;
    if (streamId) {
      this.streamSid = streamId;
    }

    this.setState('connected');

    // Set up message handlers
    ws.on('message', (data) => {
      this._handleMessage(data);
    });

    ws.on('close', () => {
      this._log('Telnyx WebSocket closed (external)');
      this.setState('disconnected');
      this.emit('disconnected', { callId: this.callId });
    });

    ws.on('error', (error) => {
      this._log('Telnyx WebSocket error (external)', error);
      this.emit('error', { source: 'telnyx', error });
    });
  }

  /**
   * Internal logging
   */
  _log(message, data = null) {
    if (this.debug) {
      console.log(`[TelnyxAudioAdapter ${this.callId}] ${message}`, data || '');
    }
  }
}

export default TelnyxAudioAdapter;
export { TelnyxAudioAdapter };
