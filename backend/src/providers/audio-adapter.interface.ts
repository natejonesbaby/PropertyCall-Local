/**
 * Audio Adapter Interface
 *
 * This interface defines the contract that all audio adapters must implement.
 * Audio adapters bridge the gap between telephony providers (Telnyx, SignalWire, etc.)
 * and the AI voice agent (Deepgram), handling:
 * - WebSocket connection management for audio streaming
 * - Audio format conversion (e.g., G.711 μ-law to Linear16)
 * - Bidirectional audio forwarding
 * - Event emission for call lifecycle and audio events
 *
 * @module providers/audio-adapter.interface
 */

import { EventEmitter } from 'events';

/**
 * Audio encoding formats supported by telephony providers
 */
export type AudioEncoding = 'g711_ulaw' | 'g711_alaw' | 'linear16' | 'opus' | 'mulaw';

/**
 * Audio sample rates in Hz
 */
export type AudioSampleRate = 8000 | 16000 | 24000 | 48000;

/**
 * Audio configuration for a provider
 */
export interface AudioConfig {
  /** Audio encoding format */
  encoding: AudioEncoding;
  /** Sample rate in Hz */
  sampleRate: AudioSampleRate;
  /** Number of audio channels (1 = mono, 2 = stereo) */
  channels: 1 | 2;
}

/**
 * Audio metadata for debugging
 */
export interface AudioMetadata {
  /** Size of the audio packet in bytes */
  size: number;
  /** Timestamp when the audio was received */
  timestamp: Date;
  /** Source of the audio */
  source: 'caller' | 'agent';
}

/**
 * Connection state of the audio adapter
 */
export type ConnectionState =
  | 'disconnected'  // Not connected
  | 'connecting'    // Establishing connection
  | 'connected'     // Connected and ready
  | 'streaming'     // Active audio streaming
  | 'closing'       // Gracefully closing
  | 'error';        // Error state

/**
 * Audio adapter statistics
 */
export interface AudioStats {
  /** Number of audio packets received from provider */
  packetsFromProvider: number;
  /** Number of audio packets sent to AI agent */
  packetsToAgent: number;
  /** Number of audio packets received from AI agent */
  packetsFromAgent: number;
  /** Number of audio packets sent to provider */
  packetsToProvider: number;
  /** Total bytes received from provider */
  bytesFromProvider: number;
  /** Total bytes sent to provider */
  bytesToProvider: number;
  /** Timestamp when streaming started */
  startTime?: Date;
  /** Timestamp when streaming ended */
  endTime?: Date;
  /** Current connection state */
  state: ConnectionState;
}

/**
 * Options for initializing the audio adapter
 */
export interface AudioAdapterOptions {
  /** Unique identifier for the call/session */
  callId: string;
  /** WebSocket URL for connecting to the provider */
  wsUrl?: string;
  /** Stream/session identifier if already established */
  streamId?: string;
  /** Audio configuration */
  audioConfig?: AudioConfig;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Events emitted by audio adapters
 */
export type AudioAdapterEvent =
  | 'connected'           // WebSocket connected to provider
  | 'disconnected'        // WebSocket disconnected from provider
  | 'stream_started'      // Audio streaming has started
  | 'stream_stopped'      // Audio streaming has stopped
  | 'audio_from_provider' // Audio packet received from provider
  | 'audio_to_provider'   // Audio packet sent to provider
  | 'audio_from_agent'    // Audio packet received from AI agent
  | 'audio_to_agent'      // Audio packet sent to AI agent
  | 'error'               // Error occurred
  | 'state_changed';      // Connection state changed

/**
 * Audio Adapter Interface
 *
 * All audio adapters (Telnyx, SignalWire, etc.) must implement this interface
 * to provide standardized audio streaming between telephony providers and the AI agent.
 */
export interface AudioAdapter extends EventEmitter {
  /**
   * Adapter name identifier (e.g., 'telnyx', 'signalwire')
   */
  readonly name: string;

  /**
   * Adapter version
   */
  readonly version: string;

  /**
   * Unique identifier for this adapter instance
   */
  readonly callId: string;

  /**
   * Current connection state
   */
  readonly state: ConnectionState;

  /**
   * Audio configuration being used
   */
  readonly audioConfig: AudioConfig;

  /**
   * Statistics about audio streaming
   */
  readonly stats: AudioStats;

  /**
   * Whether the adapter is actively streaming audio
   */
  readonly isStreaming: boolean;

  /**
   * Initialize the adapter and establish WebSocket connection
   *
   * @param options - Configuration options for the adapter
   * @returns Promise that resolves when connection is established
   */
  initialize(options: AudioAdapterOptions): Promise<void>;

  /**
   * Connect to the provider's WebSocket for audio streaming
   *
   * @param wsUrl - WebSocket URL to connect to
   * @returns Promise that resolves when connected
   */
  connect(wsUrl: string): Promise<void>;

  /**
   * Disconnect from the provider and cleanup resources
   *
   * @returns Promise that resolves when disconnection is complete
   */
  disconnect(): Promise<void>;

  /**
   * Start streaming audio (begin processing audio packets)
   *
   * @returns Promise that resolves when streaming starts
   */
  startStreaming(): Promise<void>;

  /**
   * Stop streaming audio (pause processing audio packets)
   *
   * @returns Promise that resolves when streaming stops
   */
  stopStreaming(): Promise<void>;

  /**
   * Send audio to the telephony provider (caller hears this)
   *
   * @param audioBuffer - Audio data to send (already in correct format)
   * @returns Promise that resolves when audio is sent
   */
  sendAudioToProvider(audioBuffer: Buffer): Promise<void>;

  /**
   * Receive audio from the telephony provider
   *
   * This method is called internally when audio packets arrive.
   * It emits 'audio_from_provider' events with the audio data.
   *
   * @param audioBuffer - Raw audio data received from provider
   * @param metadata - Optional metadata about the audio
   */
  receiveAudioFromProvider(audioBuffer: Buffer, metadata?: AudioMetadata): void;

  /**
   * Get the current audio statistics
   *
   * @returns Current streaming statistics
   */
  getStats(): AudioStats;

  /**
   * Get the current connection state
   *
   * @returns Current connection state
   */
  getState(): ConnectionState;

  /**
   * Update the connection state and emit state_changed event
   *
   * @param newState - The new connection state
   */
  setState(newState: ConnectionState): void;

  /**
   * Check if the adapter is ready to stream audio
   *
   * @returns true if adapter is connected and ready
   */
  isReady(): boolean;

  /**
   * Set the WebSocket connection (if established externally)
   *
   * Some providers establish WebSocket connections via webhooks.
   * This method allows setting an already-connected WebSocket.
   *
   * @param ws - The WebSocket connection
   * @param streamId - Optional stream/session identifier
   */
  setWebSocket(ws: any, streamId?: string): void;
}
