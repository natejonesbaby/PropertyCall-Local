/**
 * Unified Call Event Model - JavaScript Runtime
 *
 * This is the JavaScript runtime version of call-event.model.ts
 * For TypeScript type definitions, see call-event.model.ts
 *
 * @module providers/call-event.model
 */

// ============================================================================
// AMD Result Enum
// ============================================================================

/**
 * Answering Machine Detection result
 */
export const AMDResult = {
  /** Human answered the call */
  HUMAN: 'human',
  /** Machine/voicemail detected */
  MACHINE: 'machine',
  /** Fax machine detected */
  FAX: 'fax',
  /** Detection was inconclusive */
  UNKNOWN: 'unknown',
  /** AMD not enabled or not yet detected */
  NOT_DETECTED: 'not_detected'
};

// ============================================================================
// AMD Mapper Functions
// ============================================================================

/**
 * Map Telnyx AMD result to unified AMDDetectionResult
 *
 * @param telnyxResult - The Telnyx machine_detection_result string
 * @param telnyxConfidence - The Telnyx machine_detection_confidence number (optional)
 * @returns The unified AMDDetectionResult
 */
export function mapTelnyxAmdResult(telnyxResult, telnyxConfidence) {
  if (!telnyxResult) {
    return undefined;
  }

  const normalizedResult = telnyxResult.toLowerCase().trim();
  let result;

  switch (normalizedResult) {
    case 'human':
      result = AMDResult.HUMAN;
      break;
    case 'machine':
    case 'voicemail':
    case 'am':
    case 'amd':
      result = AMDResult.MACHINE;
      break;
    case 'fax':
      result = AMDResult.FAX;
      break;
    case 'unknown':
    case 'uncertain':
    case 'unclear':
      result = AMDResult.UNKNOWN;
      break;
    default:
      // Log unknown result but still include it
      console.warn(`[Telnyx AMD] Unknown result type: "${telnyxResult}", mapping to UNKNOWN`);
      result = AMDResult.UNKNOWN;
  }

  // Normalize confidence to 0-1 range (Telnyx may provide 0-100 or 0-1)
  let confidence;
  if (telnyxConfidence !== undefined && telnyxConfidence !== null) {
    if (telnyxConfidence > 1) {
      // Assume 0-100 scale, convert to 0-1
      confidence = Math.min(telnyxConfidence / 100, 1.0);
    } else {
      // Already in 0-1 range
      confidence = Math.max(0, Math.min(telnyxConfidence, 1.0));
    }
  }

  return {
    result,
    confidence,
    rawResult: telnyxResult,
    metadata: {
      automated: true,
      method: 'telnyx_amd'
    }
  };
}

/**
 * Map SignalWire AMD result to unified AMDDetectionResult
 *
 * SignalWire AMD results come via the `AnsweredBy` field in webhooks.
 *
 * Possible results when MachineDetection=Enable:
 * - `human`: Human answered
 * - `machine_start`: Machine detected (quick detection)
 * - `fax`: Fax machine detected
 * - `unknown`: Detection inconclusive
 *
 * Possible results when MachineDetection=DetectMessageEnd:
 * - `human`: Human answered
 * - `machine_end_beep`: Machine detected with beep at end
 * - `machine_end_silence`: Machine detected with silence at end
 * - `machine_end_other`: Machine detected (other)
 * - `fax`: Fax machine detected
 * - `unknown`: Detection inconclusive
 *
 * @param signalWireResult - The SignalWire AnsweredBy string (or AnsweringMachineResult for compatibility)
 * @param signalWireConfidence - The SignalWire confidence number (optional)
 * @returns The unified AMDDetectionResult
 */
export function mapSignalWireAmdResult(signalWireResult, signalWireConfidence) {
  if (!signalWireResult) {
    return undefined;
  }

  const normalizedResult = signalWireResult.toLowerCase().trim();
  let result;

  switch (normalizedResult) {
    case 'human':
    case 'person':
      result = AMDResult.HUMAN;
      break;
    // Machine variants from Enable mode
    case 'machine':
    case 'machine_start':
    case 'voicemail':
    case 'am':
    case 'amd':
    // Machine variants from DetectMessageEnd mode
    case 'machine_end_beep':
    case 'machine_end_silence':
    case 'machine_end_other':
      result = AMDResult.MACHINE;
      break;
    case 'fax':
    case 'fax machine':
      result = AMDResult.FAX;
      break;
    case 'unknown':
    case 'uncertain':
    case 'unclear':
      result = AMDResult.UNKNOWN;
      break;
    default:
      // Log unknown result but still include it
      console.warn(`[SignalWire AMD] Unknown result type: "${signalWireResult}", mapping to UNKNOWN`);
      result = AMDResult.UNKNOWN;
  }

  // Normalize confidence to 0-1 range (SignalWire doesn't typically provide confidence)
  let confidence;
  if (signalWireConfidence !== undefined && signalWireConfidence !== null) {
    if (signalWireConfidence > 1) {
      // Assume 0-100 scale, convert to 0-1
      confidence = Math.min(signalWireConfidence / 100, 1.0);
    } else {
      // Already in 0-1 range
      confidence = Math.max(0, Math.min(signalWireConfidence, 1.0));
    }
  }

  return {
    result,
    confidence,
    rawResult: signalWireResult,
    metadata: {
      automated: true,
      method: 'signalwire_amd',
      // Add detection mode info based on result
      detectionMode: normalizedResult.includes('_end_') ? 'detect_message_end' : 'enable'
    }
  };
}

// ============================================================================
// Telnyx Event Mapper Function
// ============================================================================

/**
 * Map a Telnyx webhook event to a unified CallEvent
 *
 * @param telnyxEvent - The raw Telnyx webhook event
 * @returns The normalized CallEvent
 */
export function mapTelnyxEventToCallEvent(telnyxEvent) {
  const { data } = telnyxEvent;
  const { payload } = data;

  // Extract AMD result using dedicated mapper
  let amdDetectionDetails;
  let amdResult;
  let amdConfidence;

  if (data.event_type === 'call.machine.detection.ended') {
    const result = payload.result || payload.machine_detection_result;
    const confidence = payload.machine_detection_confidence;

    amdDetectionDetails = mapTelnyxAmdResult(result, confidence);
    if (amdDetectionDetails) {
      amdResult = amdDetectionDetails.result;
      amdConfidence = amdDetectionDetails.confidence;
    }
  }

  // Extract recording URL if present
  let recordingUrl;
  if (data.event_type === 'call.recording.saved') {
    recordingUrl =
      payload.public_recording_urls?.mp3 ||
      payload.recording_urls?.mp3 ||
      payload.public_recording_urls?.wav ||
      payload.recording_urls?.wav;
  }

  // Determine hangup reason for completed events
  let hangupReason;
  if (data.event_type === 'call.hangup') {
    hangupReason = mapTelnyxHangupReason(payload.hangup_cause, payload.hangup_source);
  } else if (data.event_type === 'call.machine.detection.ended' && amdResult === AMDResult.MACHINE) {
    hangupReason = 'machine_detected';
  }

  // Map event type
  const eventType = mapTelnyxEventType(data.event_type);

  return {
    eventId: data.id,
    eventType,
    callId: payload.call_control_id,
    sessionId: payload.call_session_id,
    status: payload.state || data.event_type.replace('call.', ''),
    timestamp: new Date(data.occurred_at),
    direction: mapTelnyxDirection(payload.direction),
    from: payload.from,
    to: payload.to,
    provider: 'telnyx',
    durationSecs: payload.recording_duration,
    hangupReason,
    amdResult,
    amdConfidence,
    amdDetectionDetails,
    recordingUrl,
    metadata: {
      callLegId: payload.call_leg_id,
      originalEventType: data.event_type
    },
    rawEvent: telnyxEvent
  };
}

/**
 * Map Telnyx event type to unified CallEventType
 */
function mapTelnyxEventType(telnyxEventType) {
  switch (telnyxEventType) {
    case 'call.initiated':
      return 'initiated';
    case 'call.ringing':
      return 'ringing';
    case 'call.answered':
      return 'answered';
    case 'call.hangup':
    case 'call.machine.detection.ended':
    case 'call.recording.saved':
      return 'completed';
    case 'call.failed':
      return 'failed';
    default:
      // For unknown events, try to infer from context
      if (telnyxEventType.includes('hangup') || telnyxEventType.includes('ended')) {
        return 'completed';
      }
      return 'initiated'; // Default fallback
  }
}

/**
 * Map Telnyx hangup cause to unified HangupReason
 */
function mapTelnyxHangupReason(hangupCause, hangupSource) {
  // Check hangup source first
  if (hangupSource === 'caller') {
    return 'caller_hangup';
  }
  if (hangupSource === 'callee') {
    return 'callee_hangup';
  }

  // Map hangup cause
  if (!hangupCause) {
    return 'unknown';
  }

  switch (hangupCause.toLowerCase()) {
    case 'normal_clearing':
    case 'normal_call_clearing':
      return 'normal';
    case 'no_answer':
    case 'no_user_response':
      return 'no_answer';
    case 'user_busy':
    case 'busy':
      return 'busy';
    case 'call_rejected':
    case 'rejected':
      return 'rejected';
    case 'originator_cancel':
    case 'cancelled':
      return 'cancelled';
    case 'unallocated_number':
    case 'invalid_number_format':
    case 'network_out_of_order':
      return 'error';
    default:
      return 'unknown';
  }
}

/**
 * Map Telnyx direction to unified CallDirection
 */
function mapTelnyxDirection(telnyxDirection) {
  if (!telnyxDirection) {
    return 'outbound'; // Default for outbound dialer app
  }
  return telnyxDirection.toLowerCase() === 'incoming'
    ? 'inbound'
    : 'outbound';
}

/**
 * Check if a CallEvent represents a terminal state (call has ended)
 */
export function isTerminalEvent(event) {
  return (
    event.eventType === 'completed' ||
    event.eventType === 'failed'
  );
}
