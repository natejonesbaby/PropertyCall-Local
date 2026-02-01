/**
 * Telephony Provider Interface
 *
 * This interface defines the contract that all telephony providers must implement.
 * It abstracts the telephony operations so the application can support multiple
 * providers (e.g., Telnyx, Twilio, Vonage) without changing the core calling logic.
 *
 * @module providers/telephony-provider.interface
 */

/**
 * Configuration options for Answering Machine Detection (AMD)
 */
export interface AMDConfig {
  /** Whether AMD is enabled */
  enabled: boolean;
  /** Detection mode: 'detect' | 'detect_beep' | 'async' */
  mode?: 'detect' | 'detect_beep' | 'async';
  /** Maximum time in milliseconds to wait for AMD detection */
  timeoutMs?: number;
  /** Silence threshold for machine detection */
  silenceThresholdMs?: number;
  /** Whether to wait for beep before playing message */
  waitForBeep?: boolean;
}

/**
 * Parameters for initiating an outbound call
 */
export interface InitiateCallParams {
  /** The phone number to call (E.164 format, e.g., +12025551234) */
  to: string;
  /** The caller ID phone number (E.164 format) */
  from: string;
  /** Optional connection/application ID for the provider */
  connectionId?: string;
  /** URL to receive call event webhooks */
  webhookUrl?: string;
  /** HTTP method for webhook delivery */
  webhookMethod?: 'POST' | 'GET';
  /** Whether to enable call recording */
  record?: boolean;
  /** AMD configuration options */
  amd?: AMDConfig;
  /** Custom metadata to attach to the call */
  metadata?: Record<string, string>;
  /** Timeout in seconds before the call is considered unanswered */
  timeoutSecs?: number;
}

/**
 * Result of initiating a call
 */
export interface InitiateCallResult {
  /** Whether the call was successfully initiated */
  success: boolean;
  /** Provider-specific call control ID */
  callControlId?: string;
  /** Provider-specific call session ID */
  callSessionId?: string;
  /** The current call status */
  status: CallStatus;
  /** Error message if the call failed to initiate */
  error?: string;
  /** Error code from the provider */
  errorCode?: string;
  /** Raw response from the provider (for debugging) */
  rawResponse?: unknown;
}

/**
 * Possible call status values
 */
export type CallStatus =
  | 'initiated'    // Call request sent to provider
  | 'ringing'      // Call is ringing at destination
  | 'answered'     // Call was answered by human
  | 'in_progress'  // Active call in progress
  | 'completed'    // Call ended normally
  | 'failed'       // Call failed to connect
  | 'busy'         // Destination was busy
  | 'no_answer'    // No answer within timeout
  | 'voicemail'    // AMD detected voicemail/machine
  | 'cancelled';   // Call was cancelled before answer

/**
 * Parameters for ending a call
 */
export interface EndCallParams {
  /** Provider-specific call control ID */
  callControlId: string;
  /** Reason for ending the call */
  reason?: 'normal' | 'busy' | 'rejected' | 'error';
}

/**
 * Result of ending a call
 */
export interface EndCallResult {
  /** Whether the call was successfully ended */
  success: boolean;
  /** Final call status */
  status: CallStatus;
  /** Error message if the operation failed */
  error?: string;
}

/**
 * Parameters for getting call status
 */
export interface GetCallStatusParams {
  /** Provider-specific call control ID */
  callControlId: string;
}

/**
 * Result of getting call status
 */
export interface GetCallStatusResult {
  /** Whether the status query was successful */
  success: boolean;
  /** Current call status */
  status: CallStatus;
  /** Call duration in seconds (if call has started) */
  durationSecs?: number;
  /** AMD detection result */
  amdResult?: 'human' | 'machine' | 'unknown' | 'not_detected';
  /** Timestamp when the call was answered */
  answeredAt?: Date;
  /** Timestamp when the call ended */
  endedAt?: Date;
  /** Error message if the query failed */
  error?: string;
}

/**
 * Parameters for getting call recording
 */
export interface GetRecordingParams {
  /** Provider-specific call control ID or session ID */
  callControlId?: string;
  /** Provider-specific recording ID (if different from call ID) */
  recordingId?: string;
}

/**
 * Result of getting call recording
 */
export interface GetRecordingResult {
  /** Whether the recording was found */
  success: boolean;
  /** URL to access the recording */
  recordingUrl?: string;
  /** Duration of the recording in seconds */
  durationSecs?: number;
  /** Recording file format (e.g., 'mp3', 'wav') */
  format?: string;
  /** Size of the recording file in bytes */
  sizeBytes?: number;
  /** When the recording will expire (if applicable) */
  expiresAt?: Date;
  /** Status of the recording */
  recordingStatus?: 'processing' | 'ready' | 'failed' | 'expired';
  /** Error message if the recording is not available */
  error?: string;
}

/**
 * Result of configuring AMD
 */
export interface ConfigureAMDResult {
  /** Whether AMD was successfully configured */
  success: boolean;
  /** The applied AMD configuration */
  config?: AMDConfig;
  /** Error message if configuration failed */
  error?: string;
}

/**
 * Provider health check result
 */
export interface HealthCheckResult {
  /** Whether the provider is healthy */
  healthy: boolean;
  /** Provider name */
  provider: string;
  /** Response time in milliseconds */
  responseTimeMs?: number;
  /** Additional status details */
  details?: Record<string, unknown>;
  /** Error message if unhealthy */
  error?: string;
}

/**
 * Audio streaming configuration for bridging calls
 */
export interface AudioStreamConfig {
  /** WebSocket URL for receiving audio from the provider */
  receiveUrl?: string;
  /** WebSocket URL for sending audio to the provider */
  sendUrl?: string;
  /** Audio encoding format */
  encoding: 'g711_ulaw' | 'g711_alaw' | 'linear16' | 'opus';
  /** Sample rate in Hz */
  sampleRate: 8000 | 16000 | 24000 | 48000;
  /** Number of audio channels */
  channels: 1 | 2;
}

import { ProviderCapabilities } from './provider-capabilities.model.js';

/**
 * Telephony Provider Interface
 *
 * All telephony providers (Telnyx, Twilio, etc.) must implement this interface
 * to be compatible with the Property Call application.
 */
export interface TelephonyProvider {
  /**
   * Provider name identifier
   */
  readonly name: string;

  /**
   * Provider version
   */
  readonly version: string;

  /**
   * Get the capabilities of this provider
   *
   * Returns a capabilities object that indicates which features are supported.
   * This allows the application to adapt behavior based on provider capabilities.
   *
   * @returns The provider's capabilities
   */
  getCapabilities(): ProviderCapabilities;

  /**
   * Initialize the provider with API credentials
   * @param apiKey - The API key for authentication
   * @param options - Additional provider-specific options
   * @returns Promise that resolves when initialization is complete
   */
  initialize(apiKey: string, options?: Record<string, unknown>): Promise<void>;

  /**
   * Initiate an outbound call
   * @param params - Call parameters including destination, caller ID, and options
   * @returns Promise with the call initiation result
   */
  initiateCall(params: InitiateCallParams): Promise<InitiateCallResult>;

  /**
   * End an active call
   * @param params - Parameters identifying the call to end
   * @returns Promise with the call ending result
   */
  endCall(params: EndCallParams): Promise<EndCallResult>;

  /**
   * Get the current status of a call
   * @param params - Parameters identifying the call
   * @returns Promise with the call status
   */
  getCallStatus(params: GetCallStatusParams): Promise<GetCallStatusResult>;

  /**
   * Get the recording URL for a completed call
   * @param params - Parameters identifying the call or recording
   * @returns Promise with the recording information
   */
  getRecording(params: GetRecordingParams): Promise<GetRecordingResult>;

  /**
   * Configure Answering Machine Detection for calls
   * @param config - AMD configuration options
   * @returns Promise with the configuration result
   */
  configureAMD(config: AMDConfig): Promise<ConfigureAMDResult>;

  /**
   * Check the health/connectivity of the provider
   * @returns Promise with the health check result
   */
  healthCheck(): Promise<HealthCheckResult>;

  /**
   * Get audio streaming configuration for a call
   * Used for bridging audio to/from the voice AI agent
   * @param callControlId - The call to get streaming config for
   * @returns Promise with the audio stream configuration
   */
  getAudioStreamConfig?(callControlId: string): Promise<AudioStreamConfig>;

  /**
   * Handle incoming webhook events from the provider
   * @param event - The webhook event payload
   * @returns Promise that resolves when the event is processed
   */
  handleWebhookEvent?(event: unknown): Promise<void>;

  /**
   * Cleanup and disconnect from the provider
   * @returns Promise that resolves when cleanup is complete
   */
  disconnect?(): Promise<void>;
}

/**
 * Factory function type for creating telephony provider instances
 */
export type TelephonyProviderFactory = (
  apiKey: string,
  options?: Record<string, unknown>
) => Promise<TelephonyProvider>;
