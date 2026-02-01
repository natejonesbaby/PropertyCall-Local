/**
 * Unified Recording Model
 *
 * This module provides a common interface for handling call recordings across
 * different telephony providers. It abstracts the different URL formats,
 * authentication methods, and metadata structures between providers.
 *
 * @module providers/recording.model
 */

// ============================================================================
// Recording Interface and Types
// ============================================================================

/**
 * Recording format types supported across providers
 */
export type RecordingFormat = 'mp3' | 'wav' | 'ogg' | 'flac' | 'webm' | 'unknown';

/**
 * Recording status values
 */
export type RecordingStatus = 'processing' | 'ready' | 'failed' | 'expired' | 'deleted' | 'unknown';

/**
 * Unified Recording interface
 *
 * This interface normalizes recording data from different telephony providers
 * into a consistent structure that the application can work with.
 */
export interface Recording {
  /** Unique recording identifier (provider-specific) */
  id: string;

  /** Call ID this recording belongs to (our internal ID) */
  callId?: number;

  /** Provider-specific call control ID or session ID */
  providerCallId?: string;

  /** Primary URL to access the recording */
  url: string;

  /** Alternative URLs (different formats, public/private) */
  alternativeUrls?: {
    /** Public URL (no auth required) */
    public?: string;
    /** Private URL (requires auth) */
    private?: string;
    /** URLs for different formats */
    byFormat?: Record<RecordingFormat, string>;
  };

  /** Duration of the recording in seconds */
  durationSeconds: number;

  /** Recording file format */
  format: RecordingFormat;

  /** File size in bytes (if known) */
  sizeBytes?: number;

  /** Recording status */
  status: RecordingStatus;

  /** Recording channels (mono=1, stereo=2) */
  channels?: 1 | 2;

  /** Sample rate in Hz */
  sampleRate?: number;

  /** Bitrate in kbps (for compressed formats) */
  bitrate?: number;

  /** When the recording was created */
  createdAt?: Date;

  /** When the recording will expire (if applicable) */
  expiresAt?: Date;

  /** Provider name that created this recording */
  provider: 'telnyx' | 'signalwire' | 'twilio' | 'unknown';

  /** Whether the URL requires authentication to access */
  requiresAuth: boolean;

  /** Authentication method required (if any) */
  authMethod?: 'none' | 'api_key' | 'bearer_token' | 'basic_auth' | 'signed_url';

  /** Raw provider response (for debugging) */
  rawData?: unknown;
}

/**
 * Options for fetching a recording URL
 */
export interface GetRecordingUrlOptions {
  /** Preferred format */
  format?: RecordingFormat;
  /** Prefer public (no auth) URL if available */
  preferPublic?: boolean;
  /** Include authentication headers in response */
  includeAuth?: boolean;
}

/**
 * Result of fetching a recording URL
 */
export interface GetRecordingUrlResult {
  /** The recording URL */
  url: string;
  /** Format of the recording at this URL */
  format: RecordingFormat;
  /** Headers to include when fetching (for auth) */
  headers?: Record<string, string>;
  /** Whether the URL is temporary and will expire */
  isTemporary: boolean;
  /** When the URL expires (if temporary) */
  expiresAt?: Date;
}

// ============================================================================
// Telnyx Recording Types and Mapping
// ============================================================================

/**
 * Telnyx call.recording.saved webhook payload structure
 */
export interface TelnyxRecordingPayload {
  recording_urls?: {
    mp3?: string;
    wav?: string;
  };
  public_recording_urls?: {
    mp3?: string;
    wav?: string;
  };
  call_control_id?: string;
  call_session_id?: string;
  call_leg_id?: string;
  recording_duration?: number;
  recording_format?: string;
  recording_size?: number;
  start_time?: string;
  end_time?: string;
  channels?: string; // 'single' or 'dual'
}

/**
 * Map Telnyx recording format string to our RecordingFormat
 */
function mapTelnyxFormat(format: string | undefined): RecordingFormat {
  if (!format) return 'unknown';
  const normalizedFormat = format.toLowerCase().trim();
  switch (normalizedFormat) {
    case 'mp3':
      return 'mp3';
    case 'wav':
      return 'wav';
    case 'ogg':
      return 'ogg';
    default:
      return 'unknown';
  }
}

/**
 * Map Telnyx channels string to number
 */
function mapTelnyxChannels(channels: string | undefined): 1 | 2 {
  if (channels === 'dual') return 2;
  return 1; // Default to mono
}

/**
 * Map Telnyx recording webhook payload to unified Recording interface
 *
 * @param payload - The Telnyx recording webhook payload
 * @param callId - Optional internal call ID
 * @returns Unified Recording object
 */
export function mapTelnyxRecordingToRecording(
  payload: TelnyxRecordingPayload,
  callId?: number
): Recording {
  // Determine the primary URL (prefer public mp3)
  const publicMp3 = payload.public_recording_urls?.mp3;
  const privateMp3 = payload.recording_urls?.mp3;
  const publicWav = payload.public_recording_urls?.wav;
  const privateWav = payload.recording_urls?.wav;

  const primaryUrl = publicMp3 || privateMp3 || publicWav || privateWav;

  if (!primaryUrl) {
    throw new RecordingError(
      'No recording URL found in Telnyx payload',
      RecordingErrorCode.NO_URL
    );
  }

  // Determine format from primary URL
  let format: RecordingFormat = 'unknown';
  if (primaryUrl === publicMp3 || primaryUrl === privateMp3) {
    format = 'mp3';
  } else if (primaryUrl === publicWav || primaryUrl === privateWav) {
    format = 'wav';
  } else if (payload.recording_format) {
    format = mapTelnyxFormat(payload.recording_format);
  }

  // Build alternative URLs map
  const byFormat: Record<string, string> = {};
  if (publicMp3 || privateMp3) {
    byFormat['mp3'] = publicMp3 || privateMp3!;
  }
  if (publicWav || privateWav) {
    byFormat['wav'] = publicWav || privateWav!;
  }

  // Generate a recording ID from call session ID or URL
  const recordingId = payload.call_session_id ||
    primaryUrl.split('/').pop()?.replace(/\.\w+$/, '') ||
    `telnyx-${Date.now()}`;

  const recording: Recording = {
    id: recordingId,
    callId,
    providerCallId: payload.call_control_id || payload.call_session_id,
    url: primaryUrl,
    alternativeUrls: {
      public: publicMp3 || publicWav,
      private: privateMp3 || privateWav,
      byFormat: Object.keys(byFormat).length > 0 ? byFormat as Record<RecordingFormat, string> : undefined,
    },
    durationSeconds: payload.recording_duration || 0,
    format,
    sizeBytes: payload.recording_size,
    status: 'ready', // Telnyx only sends webhook when recording is ready
    channels: mapTelnyxChannels(payload.channels),
    provider: 'telnyx',
    requiresAuth: !publicMp3 && !publicWav, // If we're using a private URL, auth is required
    authMethod: (publicMp3 || publicWav) ? 'none' : 'api_key',
    rawData: payload,
  };

  // Parse timestamps if available
  if (payload.start_time) {
    recording.createdAt = new Date(payload.start_time);
  }

  return recording;
}

// ============================================================================
// SignalWire Recording Types and Mapping
// ============================================================================

/**
 * SignalWire recording callback payload structure
 * Based on SignalWire's REST API / Callback format
 */
export interface SignalWireRecordingPayload {
  RecordingSid?: string;
  RecordingUrl?: string;
  RecordingDuration?: string | number;
  RecordingStatus?: string;
  RecordingChannels?: string | number;
  RecordingSource?: string;
  RecordingStartTime?: string;
  CallSid?: string;
  AccountSid?: string;
  // Alternative field names (different API versions)
  recording_url?: string;
  recording_sid?: string;
  duration?: string | number;
  status?: string;
  channels?: string | number;
  call_sid?: string;
}

/**
 * Map SignalWire recording status to our RecordingStatus
 */
function mapSignalWireStatus(status: string | undefined): RecordingStatus {
  if (!status) return 'unknown';
  const normalizedStatus = status.toLowerCase().trim();
  switch (normalizedStatus) {
    case 'completed':
    case 'complete':
      return 'ready';
    case 'processing':
    case 'in-progress':
      return 'processing';
    case 'failed':
      return 'failed';
    case 'deleted':
      return 'deleted';
    default:
      return 'unknown';
  }
}

/**
 * Determine recording format from SignalWire URL
 * SignalWire URLs typically end with the format as query parameter or extension
 */
function detectSignalWireFormat(url: string): RecordingFormat {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('.mp3') || lowerUrl.includes('format=mp3')) {
    return 'mp3';
  }
  if (lowerUrl.includes('.wav') || lowerUrl.includes('format=wav')) {
    return 'wav';
  }
  // SignalWire defaults to wav
  return 'wav';
}

/**
 * Map SignalWire recording callback payload to unified Recording interface
 *
 * @param payload - The SignalWire recording callback payload
 * @param callId - Optional internal call ID
 * @returns Unified Recording object
 */
export function mapSignalWireRecordingToRecording(
  payload: SignalWireRecordingPayload,
  callId?: number
): Recording {
  // Handle both naming conventions
  const recordingUrl = payload.RecordingUrl || payload.recording_url;
  const recordingSid = payload.RecordingSid || payload.recording_sid;
  const duration = payload.RecordingDuration || payload.duration;
  const status = payload.RecordingStatus || payload.status;
  const channels = payload.RecordingChannels || payload.channels;
  const callSid = payload.CallSid || payload.call_sid;

  if (!recordingUrl) {
    throw new RecordingError(
      'No recording URL found in SignalWire payload',
      RecordingErrorCode.NO_URL
    );
  }

  // Parse duration (can be string or number)
  const durationSeconds = typeof duration === 'string'
    ? parseInt(duration, 10) || 0
    : duration || 0;

  // Parse channels (can be string or number)
  const channelCount = typeof channels === 'string'
    ? parseInt(channels, 10) || 1
    : channels || 1;

  const format = detectSignalWireFormat(recordingUrl);

  // Generate alternative URLs with different formats
  const baseUrl = recordingUrl.replace(/\.\w+$/, '').replace(/\?.*$/, '');
  const byFormat: Record<string, string> = {
    'mp3': `${baseUrl}.mp3`,
    'wav': `${baseUrl}.wav`,
  };

  const recording: Recording = {
    id: recordingSid || `signalwire-${Date.now()}`,
    callId,
    providerCallId: callSid,
    url: recordingUrl,
    alternativeUrls: {
      byFormat: byFormat as Record<RecordingFormat, string>,
    },
    durationSeconds,
    format,
    status: mapSignalWireStatus(status),
    channels: channelCount === 2 ? 2 : 1,
    provider: 'signalwire',
    // SignalWire recordings typically require Basic Auth with Account SID and Auth Token
    requiresAuth: true,
    authMethod: 'basic_auth',
    rawData: payload,
  };

  if (payload.RecordingStartTime) {
    recording.createdAt = new Date(payload.RecordingStartTime);
  }

  return recording;
}

// ============================================================================
// Unified Recording URL Handling
// ============================================================================

/**
 * Get a recording URL from a Recording object with the specified options
 *
 * This function abstracts the different URL formats and authentication
 * methods between providers, returning a consistent result.
 *
 * @param recording - The unified Recording object
 * @param options - Options for URL selection
 * @returns GetRecordingUrlResult with URL and metadata
 */
export function getRecordingUrl(
  recording: Recording,
  options: GetRecordingUrlOptions = {}
): GetRecordingUrlResult {
  const { format, preferPublic = true, includeAuth = false } = options;

  let selectedUrl = recording.url;
  let selectedFormat = recording.format;

  // If a specific format is requested, try to find it
  if (format && recording.alternativeUrls?.byFormat?.[format]) {
    selectedUrl = recording.alternativeUrls.byFormat[format];
    selectedFormat = format;
  }

  // If public URL is preferred and available, use it
  if (preferPublic && recording.alternativeUrls?.public) {
    selectedUrl = recording.alternativeUrls.public;
    // Try to maintain requested format if available
    if (format && recording.alternativeUrls?.byFormat?.[format]) {
      // Check if the public URL supports this format
      const publicBase = recording.alternativeUrls.public.replace(/\.\w+$/, '');
      if (recording.alternativeUrls.byFormat[format].startsWith(publicBase)) {
        selectedUrl = recording.alternativeUrls.byFormat[format];
        selectedFormat = format;
      }
    }
  }

  // Build headers if authentication is required and requested
  const headers: Record<string, string> = {};
  if (includeAuth && recording.requiresAuth) {
    // Note: Actual auth credentials should be passed separately
    // This is a placeholder showing what headers would be needed
    switch (recording.authMethod) {
      case 'api_key':
        headers['Authorization'] = 'Bearer ${API_KEY}';
        break;
      case 'bearer_token':
        headers['Authorization'] = 'Bearer ${TOKEN}';
        break;
      case 'basic_auth':
        headers['Authorization'] = 'Basic ${BASE64_CREDENTIALS}';
        break;
    }
  }

  return {
    url: selectedUrl,
    format: selectedFormat,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    isTemporary: recording.expiresAt !== undefined,
    expiresAt: recording.expiresAt,
  };
}

/**
 * Map a provider-specific recording payload to unified Recording
 * Automatically detects the provider based on payload structure
 *
 * @param payload - Raw recording payload from webhook/API
 * @param provider - Provider name (optional, will be auto-detected)
 * @param callId - Optional internal call ID
 * @returns Unified Recording object
 */
export function mapProviderRecordingToRecording(
  payload: unknown,
  provider?: 'telnyx' | 'signalwire',
  callId?: number
): Recording {
  // Auto-detect provider if not specified
  if (!provider) {
    if (isTelnyxRecordingPayload(payload)) {
      provider = 'telnyx';
    } else if (isSignalWireRecordingPayload(payload)) {
      provider = 'signalwire';
    } else {
      throw new RecordingError(
        'Unable to detect provider from recording payload',
        RecordingErrorCode.UNKNOWN_PROVIDER
      );
    }
  }

  switch (provider) {
    case 'telnyx':
      return mapTelnyxRecordingToRecording(payload as TelnyxRecordingPayload, callId);
    case 'signalwire':
      return mapSignalWireRecordingToRecording(payload as SignalWireRecordingPayload, callId);
    default:
      throw new RecordingError(
        `Unsupported provider: ${provider}`,
        RecordingErrorCode.UNSUPPORTED_PROVIDER
      );
  }
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a payload looks like a Telnyx recording payload
 */
export function isTelnyxRecordingPayload(payload: unknown): payload is TelnyxRecordingPayload {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return (
    'recording_urls' in p ||
    'public_recording_urls' in p ||
    'call_control_id' in p ||
    'call_session_id' in p
  );
}

/**
 * Check if a payload looks like a SignalWire recording payload
 */
export function isSignalWireRecordingPayload(payload: unknown): payload is SignalWireRecordingPayload {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return (
    'RecordingSid' in p ||
    'RecordingUrl' in p ||
    'recording_sid' in p ||
    'recording_url' in p ||
    'CallSid' in p ||
    'call_sid' in p
  );
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a recording is ready for playback
 */
export function isRecordingReady(recording: Recording): boolean {
  return recording.status === 'ready' && !!recording.url;
}

/**
 * Check if a recording has expired
 */
export function isRecordingExpired(recording: Recording): boolean {
  if (recording.status === 'expired') return true;
  if (recording.expiresAt && recording.expiresAt < new Date()) return true;
  return false;
}

/**
 * Format recording duration as human-readable string
 */
export function formatRecordingDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m ${remainingSeconds}s`;
}

/**
 * Format recording size as human-readable string
 */
export function formatRecordingSize(bytes: number | undefined): string {
  if (bytes === undefined) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Describe a recording in human-readable format
 */
export function describeRecording(recording: Recording): string {
  const parts: string[] = [];

  parts.push(`Recording ${recording.id}`);
  parts.push(`[${recording.provider}]`);
  parts.push(`${recording.format.toUpperCase()}`);
  parts.push(formatRecordingDuration(recording.durationSeconds));

  if (recording.sizeBytes) {
    parts.push(formatRecordingSize(recording.sizeBytes));
  }

  parts.push(`(${recording.status})`);

  if (recording.requiresAuth) {
    parts.push(`[auth: ${recording.authMethod}]`);
  }

  return parts.join(' - ');
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Error codes for recording operations
 */
export enum RecordingErrorCode {
  /** No URL found in recording payload */
  NO_URL = 'NO_URL',
  /** Recording has expired */
  EXPIRED = 'EXPIRED',
  /** Recording is still processing */
  PROCESSING = 'PROCESSING',
  /** Recording failed */
  FAILED = 'FAILED',
  /** Unknown provider */
  UNKNOWN_PROVIDER = 'UNKNOWN_PROVIDER',
  /** Unsupported provider */
  UNSUPPORTED_PROVIDER = 'UNSUPPORTED_PROVIDER',
  /** Authentication required but not provided */
  AUTH_REQUIRED = 'AUTH_REQUIRED',
  /** Invalid recording payload */
  INVALID_PAYLOAD = 'INVALID_PAYLOAD',
  /** Network error fetching recording */
  NETWORK_ERROR = 'NETWORK_ERROR',
}

/**
 * Custom error class for recording-related errors
 */
export class RecordingError extends Error {
  code: RecordingErrorCode;

  constructor(message: string, code: RecordingErrorCode) {
    super(message);
    this.name = 'RecordingError';
    this.code = code;
  }
}
