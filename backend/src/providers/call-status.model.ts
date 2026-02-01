/**
 * Unified Call Status Model
 *
 * This module defines a common CallStatus enum and mapping functions that normalize
 * provider-specific call status values into a unified status model. This abstraction
 * allows the application to handle call statuses uniformly regardless of which
 * telephony provider (Telnyx, SignalWire) is being used.
 *
 * The CallStatus represents the current state of a call at any given moment,
 * while CallEventType (in call-event.model.ts) represents the type of event
 * that occurred.
 *
 * @module providers/call-status.model
 */

// ============================================================================
// Call Status Enum
// ============================================================================

/**
 * Unified call status values across all providers
 *
 * These represent the possible states a phone call can be in:
 * - queued: Call is queued and waiting to be initiated
 * - initiated: Call request sent to provider, dialing has begun
 * - ringing: Call is ringing at the destination
 * - in_progress: Call is active and connected (human or machine)
 * - completed: Call ended normally
 * - failed: Call failed to connect (error, invalid number, etc.)
 * - busy: Destination was busy
 * - no_answer: No answer within timeout period
 * - voicemail: AMD detected voicemail/answering machine
 * - cancelled: Call was cancelled before being answered
 */
export enum CallStatus {
  /** Call is queued and waiting to be initiated */
  QUEUED = 'queued',
  /** Call request sent to provider, dialing has begun */
  INITIATED = 'initiated',
  /** Call is ringing at the destination */
  RINGING = 'ringing',
  /** Call is active and connected */
  IN_PROGRESS = 'in_progress',
  /** Call ended normally */
  COMPLETED = 'completed',
  /** Call failed to connect */
  FAILED = 'failed',
  /** Destination was busy */
  BUSY = 'busy',
  /** No answer within timeout period */
  NO_ANSWER = 'no_answer',
  /** AMD detected voicemail/answering machine */
  VOICEMAIL = 'voicemail',
  /** Call was cancelled before being answered */
  CANCELLED = 'cancelled'
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Error codes for status mapping errors
 */
export enum StatusMappingErrorCode {
  /** Status value is not recognized by the provider mapper */
  UNKNOWN_STATUS = 'UNKNOWN_STATUS',
  /** Provider is not supported */
  UNKNOWN_PROVIDER = 'UNKNOWN_PROVIDER',
  /** Status value is null or undefined */
  MISSING_STATUS = 'MISSING_STATUS'
}

/**
 * Custom error class for status mapping errors
 */
export class StatusMappingError extends Error {
  public readonly code: StatusMappingErrorCode;
  public readonly provider: string;
  public readonly rawStatus: string | undefined;

  constructor(
    message: string,
    code: StatusMappingErrorCode,
    provider: string,
    rawStatus?: string
  ) {
    super(message);
    this.name = 'StatusMappingError';
    this.code = code;
    this.provider = provider;
    this.rawStatus = rawStatus;
  }
}

// ============================================================================
// Telnyx Status Mapping
// ============================================================================

/**
 * Known Telnyx call states/statuses
 *
 * Telnyx uses various event types and state values to indicate call status:
 * - Event types: call.initiated, call.ringing, call.answered, call.hangup, etc.
 * - State values: initiated, ringing, answered, machine, etc.
 * - Hangup causes: normal_clearing, user_busy, no_answer, etc.
 */
export const TELNYX_STATUS_MAP: Record<string, CallStatus> = {
  // Event type based statuses
  'call.initiated': CallStatus.INITIATED,
  'call.ringing': CallStatus.RINGING,
  'call.answered': CallStatus.IN_PROGRESS,
  'call.hangup': CallStatus.COMPLETED,
  'call.machine.detection.ended': CallStatus.IN_PROGRESS, // AMD result determines actual status
  'call.machine.greeting.ended': CallStatus.VOICEMAIL,
  'call.recording.saved': CallStatus.COMPLETED,
  'call.speak.started': CallStatus.IN_PROGRESS,
  'call.speak.ended': CallStatus.IN_PROGRESS,
  'call.playback.started': CallStatus.IN_PROGRESS,
  'call.playback.ended': CallStatus.IN_PROGRESS,
  'call.bridged': CallStatus.IN_PROGRESS,
  'call.gather.ended': CallStatus.IN_PROGRESS,
  'call.dtmf.received': CallStatus.IN_PROGRESS,
  'call.failed': CallStatus.FAILED,

  // State values
  'initiated': CallStatus.INITIATED,
  'ringing': CallStatus.RINGING,
  'answered': CallStatus.IN_PROGRESS,
  'active': CallStatus.IN_PROGRESS,
  'machine': CallStatus.VOICEMAIL,
  'human': CallStatus.IN_PROGRESS,
  'parked': CallStatus.IN_PROGRESS,

  // Hangup cause values (terminal states)
  'normal_clearing': CallStatus.COMPLETED,
  'normal_call_clearing': CallStatus.COMPLETED,
  'no_answer': CallStatus.NO_ANSWER,
  'no_user_response': CallStatus.NO_ANSWER,
  'user_busy': CallStatus.BUSY,
  'busy': CallStatus.BUSY,
  'call_rejected': CallStatus.FAILED,
  'rejected': CallStatus.FAILED,
  'originator_cancel': CallStatus.CANCELLED,
  'cancelled': CallStatus.CANCELLED,
  'unallocated_number': CallStatus.FAILED,
  'invalid_number_format': CallStatus.FAILED,
  'network_out_of_order': CallStatus.FAILED,
  'normal_temporary_failure': CallStatus.FAILED,
  'recovery_on_timer_expiry': CallStatus.NO_ANSWER,
  'destination_out_of_order': CallStatus.FAILED,

  // AMD result values
  'machine_detected': CallStatus.VOICEMAIL,
  'unknown': CallStatus.IN_PROGRESS,
  'not_detected': CallStatus.IN_PROGRESS
};

/**
 * Map a Telnyx status value to a unified CallStatus
 *
 * @param telnyxStatus - The Telnyx status string (event_type, state, or hangup_cause)
 * @param options - Optional configuration for error handling
 * @param options.throwOnUnknown - If true, throws error for unknown statuses (default: false)
 * @param options.defaultStatus - Default status to return for unknown values (default: INITIATED)
 * @returns The unified CallStatus
 * @throws {StatusMappingError} If throwOnUnknown is true and status is not recognized
 *
 * @example
 * ```typescript
 * const status = mapTelnyxStatus('call.answered'); // CallStatus.IN_PROGRESS
 * const status = mapTelnyxStatus('user_busy');     // CallStatus.BUSY
 * const status = mapTelnyxStatus('call.hangup');   // CallStatus.COMPLETED
 * ```
 */
export function mapTelnyxStatus(
  telnyxStatus: string | null | undefined,
  options: {
    throwOnUnknown?: boolean;
    defaultStatus?: CallStatus;
  } = {}
): CallStatus {
  const { throwOnUnknown = false, defaultStatus = CallStatus.INITIATED } = options;

  // Handle null/undefined status
  if (telnyxStatus === null || telnyxStatus === undefined) {
    if (throwOnUnknown) {
      throw new StatusMappingError(
        'Telnyx status is null or undefined',
        StatusMappingErrorCode.MISSING_STATUS,
        'telnyx'
      );
    }
    return defaultStatus;
  }

  // Normalize the status string
  const normalizedStatus = telnyxStatus.toLowerCase().trim();

  // Look up the status in the mapping
  const mappedStatus = TELNYX_STATUS_MAP[normalizedStatus];

  if (mappedStatus) {
    return mappedStatus;
  }

  // Handle unknown status
  if (throwOnUnknown) {
    throw new StatusMappingError(
      `Unknown Telnyx status: "${telnyxStatus}"`,
      StatusMappingErrorCode.UNKNOWN_STATUS,
      'telnyx',
      telnyxStatus
    );
  }

  // Try to infer status from patterns
  if (normalizedStatus.includes('hangup') || normalizedStatus.includes('ended')) {
    return CallStatus.COMPLETED;
  }
  if (normalizedStatus.includes('fail') || normalizedStatus.includes('error')) {
    return CallStatus.FAILED;
  }
  if (normalizedStatus.includes('busy')) {
    return CallStatus.BUSY;
  }
  if (normalizedStatus.includes('cancel')) {
    return CallStatus.CANCELLED;
  }
  if (normalizedStatus.includes('ring')) {
    return CallStatus.RINGING;
  }

  console.warn(`[CallStatus] Unknown Telnyx status "${telnyxStatus}", defaulting to ${defaultStatus}`);
  return defaultStatus;
}

// ============================================================================
// SignalWire Status Mapping
// ============================================================================

/**
 * Known SignalWire call statuses
 *
 * SignalWire uses Twilio-compatible status values:
 * - queued: Call is waiting to be initiated
 * - initiated: Call has been created and is being set up
 * - ringing: Call is ringing at destination
 * - answered/in-progress: Call is active
 * - completed: Call ended normally
 * - failed: Call failed to connect
 * - busy: Destination was busy
 * - no-answer: No answer within timeout
 * - canceled: Call was cancelled
 */
export const SIGNALWIRE_STATUS_MAP: Record<string, CallStatus> = {
  // Standard call statuses
  'queued': CallStatus.QUEUED,
  'initiated': CallStatus.INITIATED,
  'ringing': CallStatus.RINGING,
  'answered': CallStatus.IN_PROGRESS,
  'in-progress': CallStatus.IN_PROGRESS,
  'in_progress': CallStatus.IN_PROGRESS, // Allow underscore variant
  'completed': CallStatus.COMPLETED,
  'failed': CallStatus.FAILED,
  'busy': CallStatus.BUSY,
  'no-answer': CallStatus.NO_ANSWER,
  'no_answer': CallStatus.NO_ANSWER, // Allow underscore variant
  'canceled': CallStatus.CANCELLED,
  'cancelled': CallStatus.CANCELLED, // Allow British spelling

  // AMD result statuses (if used)
  'machine': CallStatus.VOICEMAIL,
  'human': CallStatus.IN_PROGRESS,
  'fax': CallStatus.VOICEMAIL,
  'unknown': CallStatus.IN_PROGRESS
};

/**
 * Map a SignalWire status value to a unified CallStatus
 *
 * @param signalWireStatus - The SignalWire CallStatus string
 * @param options - Optional configuration for error handling
 * @param options.throwOnUnknown - If true, throws error for unknown statuses (default: false)
 * @param options.defaultStatus - Default status to return for unknown values (default: INITIATED)
 * @returns The unified CallStatus
 * @throws {StatusMappingError} If throwOnUnknown is true and status is not recognized
 *
 * @example
 * ```typescript
 * const status = mapSignalWireStatus('in-progress');  // CallStatus.IN_PROGRESS
 * const status = mapSignalWireStatus('busy');         // CallStatus.BUSY
 * const status = mapSignalWireStatus('completed');    // CallStatus.COMPLETED
 * ```
 */
export function mapSignalWireStatus(
  signalWireStatus: string | null | undefined,
  options: {
    throwOnUnknown?: boolean;
    defaultStatus?: CallStatus;
  } = {}
): CallStatus {
  const { throwOnUnknown = false, defaultStatus = CallStatus.INITIATED } = options;

  // Handle null/undefined status
  if (signalWireStatus === null || signalWireStatus === undefined) {
    if (throwOnUnknown) {
      throw new StatusMappingError(
        'SignalWire status is null or undefined',
        StatusMappingErrorCode.MISSING_STATUS,
        'signalwire'
      );
    }
    return defaultStatus;
  }

  // Normalize the status string
  const normalizedStatus = signalWireStatus.toLowerCase().trim();

  // Look up the status in the mapping
  const mappedStatus = SIGNALWIRE_STATUS_MAP[normalizedStatus];

  if (mappedStatus) {
    return mappedStatus;
  }

  // Handle unknown status
  if (throwOnUnknown) {
    throw new StatusMappingError(
      `Unknown SignalWire status: "${signalWireStatus}"`,
      StatusMappingErrorCode.UNKNOWN_STATUS,
      'signalwire',
      signalWireStatus
    );
  }

  // Try to infer status from patterns
  if (normalizedStatus.includes('progress') || normalizedStatus.includes('active')) {
    return CallStatus.IN_PROGRESS;
  }
  if (normalizedStatus.includes('complete') || normalizedStatus.includes('ended')) {
    return CallStatus.COMPLETED;
  }
  if (normalizedStatus.includes('fail') || normalizedStatus.includes('error')) {
    return CallStatus.FAILED;
  }
  if (normalizedStatus.includes('busy')) {
    return CallStatus.BUSY;
  }
  if (normalizedStatus.includes('cancel')) {
    return CallStatus.CANCELLED;
  }
  if (normalizedStatus.includes('no') && normalizedStatus.includes('answer')) {
    return CallStatus.NO_ANSWER;
  }
  if (normalizedStatus.includes('ring')) {
    return CallStatus.RINGING;
  }
  if (normalizedStatus.includes('queue')) {
    return CallStatus.QUEUED;
  }

  console.warn(`[CallStatus] Unknown SignalWire status "${signalWireStatus}", defaulting to ${defaultStatus}`);
  return defaultStatus;
}

// ============================================================================
// Generic Status Mapping
// ============================================================================

/**
 * Supported telephony providers
 */
export type TelephonyProviderType = 'telnyx' | 'signalwire';

/**
 * Map a provider-specific status to a unified CallStatus
 *
 * @param provider - The telephony provider name
 * @param status - The provider-specific status string
 * @param options - Optional configuration for error handling
 * @returns The unified CallStatus
 * @throws {StatusMappingError} If provider is unknown or status mapping fails
 *
 * @example
 * ```typescript
 * const status = mapProviderStatus('telnyx', 'call.answered');    // CallStatus.IN_PROGRESS
 * const status = mapProviderStatus('signalwire', 'in-progress');  // CallStatus.IN_PROGRESS
 * ```
 */
export function mapProviderStatus(
  provider: string,
  status: string | null | undefined,
  options: {
    throwOnUnknown?: boolean;
    defaultStatus?: CallStatus;
  } = {}
): CallStatus {
  const normalizedProvider = provider.toLowerCase().trim();

  switch (normalizedProvider) {
    case 'telnyx':
      return mapTelnyxStatus(status, options);
    case 'signalwire':
      return mapSignalWireStatus(status, options);
    default:
      if (options.throwOnUnknown) {
        throw new StatusMappingError(
          `Unknown provider: "${provider}"`,
          StatusMappingErrorCode.UNKNOWN_PROVIDER,
          provider
        );
      }
      console.warn(`[CallStatus] Unknown provider "${provider}", attempting generic status mapping`);
      // Fall through to try SignalWire mapping as it uses more standard status names
      return mapSignalWireStatus(status, options);
  }
}

// ============================================================================
// Status Utility Functions
// ============================================================================

/**
 * Check if a call status represents a terminal state (call has ended)
 *
 * @param status - The CallStatus to check
 * @returns True if the call has ended
 */
export function isTerminalStatus(status: CallStatus): boolean {
  return [
    CallStatus.COMPLETED,
    CallStatus.FAILED,
    CallStatus.BUSY,
    CallStatus.NO_ANSWER,
    CallStatus.CANCELLED
  ].includes(status);
}

/**
 * Check if a call status represents an active/in-progress call
 *
 * @param status - The CallStatus to check
 * @returns True if the call is active
 */
export function isActiveStatus(status: CallStatus): boolean {
  return status === CallStatus.IN_PROGRESS;
}

/**
 * Check if a call status represents a ringing/pre-answer state
 *
 * @param status - The CallStatus to check
 * @returns True if the call is ringing
 */
export function isRingingStatus(status: CallStatus): boolean {
  return [CallStatus.INITIATED, CallStatus.RINGING].includes(status);
}

/**
 * Check if a call status represents a failed outcome
 *
 * @param status - The CallStatus to check
 * @returns True if the call failed
 */
export function isFailedStatus(status: CallStatus): boolean {
  return [
    CallStatus.FAILED,
    CallStatus.BUSY,
    CallStatus.NO_ANSWER,
    CallStatus.CANCELLED
  ].includes(status);
}

/**
 * Get all known Telnyx status values
 *
 * @returns Array of known Telnyx status strings
 */
export function getKnownTelnyxStatuses(): string[] {
  return Object.keys(TELNYX_STATUS_MAP);
}

/**
 * Get all known SignalWire status values
 *
 * @returns Array of known SignalWire status strings
 */
export function getKnownSignalWireStatuses(): string[] {
  return Object.keys(SIGNALWIRE_STATUS_MAP);
}

/**
 * Get all CallStatus enum values
 *
 * @returns Array of all CallStatus values
 */
export function getAllCallStatuses(): CallStatus[] {
  return Object.values(CallStatus);
}

/**
 * Get a human-readable description of a CallStatus
 *
 * @param status - The CallStatus to describe
 * @returns A human-readable description
 */
export function describeCallStatus(status: CallStatus): string {
  switch (status) {
    case CallStatus.QUEUED:
      return 'Waiting to be dialed';
    case CallStatus.INITIATED:
      return 'Dialing';
    case CallStatus.RINGING:
      return 'Ringing';
    case CallStatus.IN_PROGRESS:
      return 'Connected';
    case CallStatus.COMPLETED:
      return 'Call ended normally';
    case CallStatus.FAILED:
      return 'Call failed';
    case CallStatus.BUSY:
      return 'Line was busy';
    case CallStatus.NO_ANSWER:
      return 'No answer';
    case CallStatus.VOICEMAIL:
      return 'Voicemail detected';
    case CallStatus.CANCELLED:
      return 'Call cancelled';
    default:
      return 'Unknown status';
  }
}

// ============================================================================
// Exports
// ============================================================================

export default {
  CallStatus,
  StatusMappingError,
  StatusMappingErrorCode,
  mapTelnyxStatus,
  mapSignalWireStatus,
  mapProviderStatus,
  isTerminalStatus,
  isActiveStatus,
  isRingingStatus,
  isFailedStatus,
  getKnownTelnyxStatuses,
  getKnownSignalWireStatuses,
  getAllCallStatuses,
  describeCallStatus,
  TELNYX_STATUS_MAP,
  SIGNALWIRE_STATUS_MAP
};
