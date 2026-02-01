/**
 * SignalWire Audio Adapter
 *
 * Implements the audio adapter interface for SignalWire telephony provider.
 * Handles WebSocket audio streaming between SignalWire and the AI agent.
 *
 * @module providers/signalwire-audio-adapter
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';

// Audio format constants for SignalWire
const SIGNALWIRE_ENCODING = 'mulaw';
const SIGNALWIRE_SAMPLE_RATE = 8000;
const SIGNALWIRE_CHANNELS = 1;

/**
 * SignalWire Audio Adapter
 *
 * Manages audio streaming for SignalWire calls, implementing the AudioAdapter interface.
 */
class SignalWireAudioAdapter extends EventEmitter {
  /**
   * Create a new SignalWireAudioAdapter
   * @param {Object} options - Configuration options
   * @param {string} options.callId - Unique identifier for this call
   * @param {boolean} options.debug - Enable debug logging
   */
  constructor(options = {}) {
    super();

    this.name = 'signalwire';
    this.version = '1.0.0';
    this.callId = options.callId || 'unknown';
    this.debug = options.debug || false;

    // WebSocket connection
    this.ws = null;
    this.streamSid = null;

    // Audio configuration
    this.audioConfig = {
      encoding: SIGNALWIRE_ENCODING,
      sampleRate: SIGNALWIRE_SAMPLE_RATE,
      channels: SIGNALWIRE_CHANNELS
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
    this._log('SignalWireAudioAdapter initialized', { callId: this.callId });
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
    this._log('Initializing SignalWireAudioAdapter', options);

    if (options.callId) {
      this.callId = options.callId;
    }

    // If WebSocket URL provided, connect immediately
    if (options.wsUrl) {
      await this.connect(options.wsUrl);
    }
  }

  /**
   * Connect to SignalWire WebSocket
   */
  async connect(wsUrl) {
    this._log('Connecting to SignalWire WebSocket', { wsUrl });
    this.setState('connecting');

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsUrl);

        this.ws.on('open', () => {
          this._log('SignalWire WebSocket connected');
          this.setState('connected');
          this.emit('connected', { callId: this.callId });
          resolve();
        });

        this.ws.on('message', (data) => {
          this._handleMessage(data);
        });

        this.ws.on('error', (error) => {
          this._log('SignalWire WebSocket error', error);
          this.emit('error', { source: 'signalwire', error });
          if (this.state === 'connecting') {
            reject(error);
          }
        });

        this.ws.on('close', () => {
          this._log('SignalWire WebSocket closed');
          this.setState('disconnected');
          this.emit('disconnected', { callId: this.callId });
        });

        // Connection timeout
        setTimeout(() => {
          if (this.state === 'connecting') {
            reject(new Error('SignalWire WebSocket connection timeout'));
          }
        }, 10000);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from SignalWire
   */
  async disconnect() {
    this._log('Disconnecting SignalWire WebSocket');

    this._isStreaming = false;
    this.setState('closing');

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }

    this.ws = null;
    this.streamSid = null;
    this.stats.endTime = new Date();
    this.setState('disconnected');

    this._log('SignalWire WebSocket disconnected');
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
   * Send audio to SignalWire (caller hears this)
   */
  async sendAudioToProvider(audioBuffer) {
    if (!this.isReady() || !this.streamSid) {
      this._log('Cannot send audio: not ready or no streamSid');
      return;
    }

    try {
      // SignalWire expects media messages in specific format
      const mediaMessage = {
        event: 'media',
        streamSid: this.streamSid,
        media: {
          track: 'outbound',
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
      this._log('Error sending audio to SignalWire', error);
      this.emit('error', { source: 'signalwire', action: 'send_audio', error });
    }
  }

  /**
   * Handle incoming messages from SignalWire
   */
  _handleMessage(data) {
    try {
      const message = JSON.parse(data.toString());

      switch (message.event) {
        case 'connected':
          this._handleConnected(message);
          break;

        case 'start':
          this._handleStreamStart(message);
          break;

        case 'media':
          this._handleMedia(message);
          break;

        case 'stop':
          this._handleStreamStop(message);
          break;

        case 'dtmf':
          this._handleDTMF(message);
          break;

        case 'clear':
          this._handleClear(message);
          break;

        default:
          // Other events logged but not processed
          this._log('SignalWire event', { event: message.event });
      }
    } catch (error) {
      // If not JSON, might be binary data (shouldn't happen with SignalWire)
      this._log('Error parsing SignalWire message', error);
    }
  }

  /**
   * Handle connected event
   */
  _handleConnected(message) {
    this._log('SignalWire WebSocket connected');
  }

  /**
   * Handle stream started event
   */
  _handleStreamStart(message) {
    this.streamSid = message.start.streamSid;
    this._log('SignalWire stream started', { streamSid: this.streamSid });
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
      // SignalWire sends base64 encoded mu-law audio in media.payload
      // Only process inbound track (audio from the caller)
      if (message.media.track === 'inbound') {
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
      }
    } catch (error) {
      this._log('Error handling media from SignalWire', error);
    }
  }

  /**
   * Handle stream stopped event
   */
  _handleStreamStop(message) {
    this._log('SignalWire stream stopped');
    this._isStreaming = false;
    this.stats.endTime = new Date();
    this.setState('connected');
    this.emit('stream_stopped', { callId: this.callId });
  }

  /**
   * Handle DTMF event
   */
  _handleDTMF(message) {
    this._log('SignalWire DTMF detected', { digit: message.dtmf.digit });
    this.emit('dtmf_detected', message.dtmf);
  }

  /**
   * Handle clear buffer event
   */
  _handleClear(message) {
    this._log('SignalWire clear buffer requested');
    this.emit('clear_requested');
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
   * Clear audio buffer
   */
  clearAudioBuffer() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.streamSid) {
      const clearMessage = {
        event: 'clear',
        streamSid: this.streamSid
      };
      this.ws.send(JSON.stringify(clearMessage));
    }
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
      this._log('SignalWire WebSocket closed (external)');
      this.setState('disconnected');
      this.emit('disconnected', { callId: this.callId });
    });

    ws.on('error', (error) => {
      this._log('SignalWire WebSocket error (external)', error);
      this.emit('error', { source: 'signalwire', error });
    });
  }

  /**
   * Internal logging
   */
  _log(message, data = null) {
    if (this.debug) {
      console.log(`[SignalWireAudioAdapter ${this.callId}] ${message}`, data || '');
    }
  }
}

export default SignalWireAudioAdapter;
export { SignalWireAudioAdapter };
