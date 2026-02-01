import express from 'express';
import { db } from '../db/setup.js';
import { mapSignalWireAmdResult, mapTelnyxEventToCallEvent, isTerminalEvent } from '../providers/call-event.model.js';
import { validateSignalWebhook } from '../middleware/webhook-signature.js';

const router = express.Router();

// ============================================================================
// Telnyx Webhook Handler
// ============================================================================

/**
 * POST /api/webhooks/telnyx
 *
 * Webhook endpoint to receive Telnyx call events.
 * Telnyx sends events to this endpoint when call state changes occur.
 *
 * This endpoint:
 * 1. Receives Telnyx webhook payload (JSON)
 * 2. Maps to unified CallEvent format using event mapper
 * 3. Updates call record in database
 * 4. Emits event to call handler (via WebSocket)
 * 5. Returns appropriate response
 * 6. Logs all webhook events
 *
 * Uses unified event abstraction for provider-agnostic event handling
 * @see https://developers.telnyx.com/docs/api/webhooks/webhook-events
 */
router.post('/telnyx', async (req, res) => {
  const startTime = Date.now();
  const rawEvent = req.body;

  console.log('[Telnyx Webhook] Received event:', {
    timestamp: new Date().toISOString(),
    eventType: rawEvent.data?.event_type || rawEvent.event_type,
    callControlId: rawEvent.data?.payload?.call_control_id
  });

  try {
    // Validate required fields
    if (!rawEvent.data?.event_type) {
      console.error('[Telnyx Webhook] Missing event_type in callback');
      return res.status(400).send('Missing event_type');
    }

    if (!rawEvent.data?.payload?.call_control_id) {
      console.error('[Telnyx Webhook] Missing call_control_id in callback');
      return res.status(400).send('Missing call_control_id');
    }

    // Map Telnyx event to unified CallEvent format
    const callEvent = mapTelnyxEventToCallEvent(rawEvent);

    console.log('[Telnyx Webhook] Mapped to unified CallEvent:', {
      eventId: callEvent.eventId,
      eventType: callEvent.eventType,
      callId: callEvent.callId,
      status: callEvent.status,
      provider: callEvent.provider
    });

    // Find call record by Telnyx call control ID
    const callRecord = db.prepare(`
      SELECT c.*, l.id as lead_id
      FROM calls c
      LEFT JOIN leads l ON c.lead_id = l.id
      WHERE c.telnyx_call_id = ?
    `).get(callEvent.callId);

    if (!callRecord) {
      console.warn(`[Telnyx Webhook] No call record found for Telnyx Call Control ID: ${callEvent.callId}`);
      // Still return 200 to Telnyx (we don't want them to retry)
      return res.status(200).send('OK');
    }

    console.log(`[Telnyx Webhook] Found call record ID: ${callRecord.id}, Lead ID: ${callRecord.lead_id}`);

    // Determine if this is a terminal event
    const isTerminal = isTerminalEvent(callEvent);

    // Update call record based on unified event type
    let updateFields = [];
    let updateValues = [];
    let newStatus = callRecord.status;

    switch (callEvent.eventType) {
      case 'initiated':
      case 'ringing':
        newStatus = 'ringing';
        updateFields.push('status = ?');
        updateValues.push('ringing');
        break;

      case 'answered':
        newStatus = 'in_progress';
        updateFields.push('status = ?', "answered_at = datetime('now')");
        updateValues.push('in_progress');
        break;

      case 'completed':
        newStatus = 'completed';
        updateFields.push(
          'status = ?',
          "ended_at = datetime('now')"
        );
        updateValues.push('completed');

        // Add duration if available from event
        if (callEvent.durationSecs !== undefined) {
          updateFields.push('duration_seconds = ?');
          updateValues.push(callEvent.durationSecs);
        } else {
          // Calculate duration from timestamps if not in event
          updateFields.push(`
            duration_seconds = CASE
              WHEN started_at IS NOT NULL
              THEN CAST((julianday('now') - julianday(started_at)) * 86400 AS INTEGER)
              ELSE 0
            END
          `);
        }

        // Add recording URL if available
        if (callEvent.recordingUrl) {
          updateFields.push('recording_url = ?');
          updateValues.push(callEvent.recordingUrl);
        }

        // Add AMD result if available
        if (callEvent.amdResult) {
          updateFields.push('amd_result = ?');
          updateValues.push(callEvent.amdResult);

          if (callEvent.amdConfidence !== undefined) {
            updateFields.push('amd_confidence = ?');
            updateValues.push(callEvent.amdConfidence);
          }

          // Store timestamp if this is the first AMD detection
          if (!callRecord.amd_detected_at) {
            updateFields.push("amd_detected_at = datetime('now')");
          }

          console.log('[Telnyx Webhook] AMD detected:', {
            callId: callRecord.id,
            result: callEvent.amdResult,
            confidence: callEvent.amdConfidence
          });
        }

        // Set disposition based on hangup reason if not already set
        if (!callRecord.disposition) {
          let disposition = 'Completed';

          // Check AMD result for machine detection
          if (callEvent.amdResult === 'machine') {
            disposition = 'Voicemail Left';
          } else if (callEvent.amdResult === 'fax') {
            disposition = 'Fax Detected';
          } else if (callEvent.hangupReason) {
            // Map hangup reason to disposition
            switch (callEvent.hangupReason) {
              case 'no_answer':
                disposition = 'No Answer';
                break;
              case 'busy':
                disposition = 'Busy';
                break;
              case 'caller_hangup':
              case 'callee_hangup':
                disposition = 'Completed';
                break;
              default:
                disposition = 'Completed';
            }
          }

          updateFields.push('disposition = ?');
          updateValues.push(disposition);
        }
        break;

      case 'failed':
        newStatus = 'failed';
        updateFields.push(
          'status = ?',
          "ended_at = datetime('now')"
        );
        updateValues.push('failed');

        // Set disposition for failed calls
        if (!callRecord.disposition) {
          let disposition = 'No Answer';
          if (callEvent.hangupReason === 'busy') {
            disposition = 'Busy';
          } else if (callEvent.hangupReason === 'no_answer') {
            disposition = 'No Answer';
          } else {
            disposition = 'Wrong Number';
          }

          updateFields.push('disposition = ?');
          updateValues.push(disposition);
        }
        break;
    }

    // Apply updates if any
    if (updateFields.length > 0) {
      updateValues.push(callRecord.id);
      const updateSql = `
        UPDATE calls
        SET ${updateFields.join(', ')}
        WHERE id = ?
      `;
      db.prepare(updateSql).run(...updateValues);
      console.log(`[Telnyx Webhook] Updated call ${callRecord.id} to status: ${newStatus}`);
    }

    // Log the webhook event for debugging
    db.prepare(`
      INSERT INTO webhook_logs (provider, event_type, call_id, payload, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(
      'telnyx',
      callEvent.eventType,
      callRecord.id,
      JSON.stringify({
        eventId: callEvent.eventId,
        callControlId: callEvent.callId,
        eventType: callEvent.eventType,
        status: callEvent.status,
        amdResult: callEvent.amdResult,
        hangupReason: callEvent.hangupReason
      })
    );

    // Broadcast update to monitoring clients using unified format
    try {
      // Import dynamically to avoid circular dependency
      import('../index.js').then(mod => {
        const broadcastToMonitors = mod.broadcastToMonitors;
        if (broadcastToMonitors) {
          broadcastToMonitors({
            type: 'call_event',
            data: {
              callId: callRecord.id,
              leadId: callRecord.lead_id,
              eventType: callEvent.eventType,
              status: newStatus,
              provider: callEvent.provider,
              telnyxCallId: callEvent.callId,
              timestamp: callEvent.timestamp.toISOString(),
              // Include unified event fields
              amdResult: callEvent.amdResult,
              amdConfidence: callEvent.amdConfidence,
              hangupReason: callEvent.hangupReason,
              recordingUrl: callEvent.recordingUrl,
              durationSecs: callEvent.durationSecs
            }
          });
        }
      }).catch(error => {
        console.error('[Telnyx Webhook] Failed to broadcast to monitors:', error.message);
      });
    } catch (error) {
      console.error('[Telnyx Webhook] Failed to broadcast to monitors:', error.message);
    }

    // Emit event to call handler if terminal
    if (isTerminal) {
      console.log(`[Telnyx Webhook] Terminal event for call ${callRecord.id}, triggering post-call processing`);
      // TODO: Trigger post-call processing (extract data, post to FUB, etc.)
      // This would typically be done by a background job or event handler
    }

    // Return appropriate response to Telnyx
    const responseTime = Date.now() - startTime;
    console.log(`[Telnyx Webhook] Processed in ${responseTime}ms`);

    res.status(200).send('OK');

  } catch (error) {
    console.error('[Telnyx Webhook] Error processing event:', error);
    console.error('[Telnyx Webhook] Error stack:', error.stack);
    console.error('[Telnyx Webhook] Payload:', JSON.stringify(rawEvent, null, 2));

    // Still return 200 to Telnyx to avoid retries
    // Log the error for later analysis
    db.prepare(`
      INSERT INTO webhook_logs (provider, event_type, call_id, payload, error, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(
      'telnyx',
      'error',
      null,
      JSON.stringify(rawEvent),
      error.message
    );

    res.status(200).send('OK');
  }
});

// ============================================================================
// SignalWire Webhook Handler
// ============================================================================

// Middleware to capture raw body for signature validation
// This must be applied before the signature validation middleware
const captureRawBody = express.raw({ type: '*/*', limit: '10mb' });

/**
 * POST /api/webhooks/signalwire/voice
 *
 * Webhook endpoint to receive SignalWire call status callbacks.
 * SignalWire sends callbacks to this endpoint when call state changes occur.
 *
 * This endpoint:
 * 1. Validates webhook signature (X-Signature header) for security
 * 2. Receives SignalWire callback payload (form-url-encoded or JSON)
 * 3. Maps to unified CallEvent format
 * 4. Updates call record in database
 * 5. Emits event to call handler (via WebSocket)
 * 6. Returns TwiML/response if needed
 * 7. Logs all webhook events
 *
 * Security: Signature validation prevents spoofing and ensures authenticity
 * @see https://developer.signalwire.com/v2/api/rest/callbacks/
 */
router.post('/signalwire/voice',
  captureRawBody, // Capture raw body for signature validation
  validateSignalWebhook(db, { enabled: false, logFailures: true }), // TODO: Re-enable after testing
  express.urlencoded({ extended: true }), // Parse form-urlencoded body
  (req, res) => {
  const startTime = Date.now();

  // SignalWire can send either form-url-encoded or JSON
  const payload = req.body && typeof req.body === 'object' ? req.body : req.query;

  console.log('[SignalWire Webhook] Received callback:', {
    timestamp: new Date().toISOString(),
    callSid: payload.CallSid,
    callStatus: payload.CallStatus,
    from: payload.From,
    to: payload.To,
    direction: payload.Direction,
    answeredBy: payload.AnsweredBy,
    confidence: payload.Confidence
  });

  try {
    // Validate required fields
    if (!payload.CallSid) {
      console.error('[SignalWire Webhook] Missing CallSid in callback');
      return res.status(400).send('Missing CallSid');
    }

    if (!payload.CallStatus) {
      console.error('[SignalWire Webhook] Missing CallStatus in callback');
      return res.status(400).send('Missing CallStatus');
    }

    // Map SignalWire CallStatus to event type
    const callStatus = payload.CallStatus.toLowerCase();
    let eventType;
    let isTerminal = false;

    switch (callStatus) {
      case 'queued':
      case 'initiated':
        eventType = 'initiated';
        break;
      case 'ringing':
        eventType = 'ringing';
        break;
      case 'answered':
      case 'in-progress':
        eventType = 'answered';
        break;
      case 'completed':
        eventType = 'completed';
        isTerminal = true;
        break;
      case 'failed':
      case 'busy':
      case 'no-answer':
      case 'canceled':
        eventType = 'failed';
        isTerminal = true;
        break;
      default:
        eventType = 'initiated';
    }

    console.log('[SignalWire Webhook] Mapped event:', {
      callSid: payload.CallSid,
      eventType: eventType,
      isTerminal: isTerminal
    });

    // Find the call record in our database by SignalWire Call SID
    const callRecord = db.prepare(`
      SELECT c.*, l.id as lead_id
      FROM calls c
      JOIN leads l ON c.lead_id = l.id
      WHERE c.signalwire_call_id = ?
    `).get(payload.CallSid);

    if (!callRecord) {
      console.warn(`[SignalWire Webhook] No call record found for SignalWire Call SID: ${payload.CallSid}`);
      // Still return 200 to SignalWire (we don't want them to retry)
      return res.status(200).send('OK');
    }

    console.log(`[SignalWire Webhook] Found call record ID: ${callRecord.id}, Lead ID: ${callRecord.lead_id}`);

    // Update call record based on event type
    let updateFields = [];
    let updateValues = [];
    let newStatus = callRecord.status;

    switch (eventType) {
      case 'initiated':
      case 'ringing':
        newStatus = 'ringing';
        updateFields.push('status = ?');
        updateValues.push('ringing');
        break;

      case 'answered':
        newStatus = 'in_progress';
        updateFields.push('status = ?', "answered_at = datetime('now')");
        updateValues.push('in_progress');
        break;

      case 'completed':
        newStatus = 'completed';
        updateFields.push(
          'status = ?',
          "ended_at = datetime('now')"
        );
        updateValues.push('completed');

        // Add duration if available
        if (payload.CallDuration) {
          const duration = parseInt(payload.CallDuration, 10);
          if (!isNaN(duration)) {
            updateFields.push('duration_seconds = ?');
            updateValues.push(duration);
          }
        }

        // Add recording URL if available
        if (payload.RecordingUrl) {
          updateFields.push('recording_url = ?');
          updateValues.push(payload.RecordingUrl);
        }

        // Add AMD result if available (check both AnsweredBy and AnsweringMachineResult fields)
        const amdRawResult = payload.AnsweredBy || payload.AnsweringMachineResult;
        if (amdRawResult) {
          // Map to unified AMD result
          const amdResult = mapSignalWireAmdResult(amdRawResult, payload.Confidence);

          updateFields.push('amd_result = ?');
          updateValues.push(amdResult?.result || amdRawResult);

          // Also store confidence if available
          if (amdResult?.confidence !== undefined) {
            updateFields.push('amd_confidence = ?');
            updateValues.push(amdResult.confidence);
          }

          // Store timestamp if this is the first AMD detection
          if (!callRecord.amd_detected_at) {
            updateFields.push("amd_detected_at = datetime('now')");
          }

          console.log('[SignalWire Webhook] AMD detected:', {
            callId: callRecord.id,
            rawResult: amdRawResult,
            mappedResult: amdResult?.result,
            confidence: amdResult?.confidence
          });
        }

        // Set disposition based on status if not already set
        if (!callRecord.disposition) {
          let disposition = 'Completed';

          // Check AMD result for machine detection
          if (amdRawResult) {
            const amdResult = mapSignalWireAmdResult(amdRawResult, payload.Confidence);
            if (amdResult?.result === 'machine') {
              disposition = 'Voicemail Left';
            } else if (amdResult?.result === 'fax') {
              disposition = 'Fax Detected';
            }
          }

          updateFields.push('disposition = ?');
          updateValues.push(disposition);
        }
        break;

      case 'failed':
        newStatus = 'failed';
        updateFields.push(
          'status = ?',
          "ended_at = datetime('now')"
        );
        updateValues.push('failed');

        // Set disposition for failed calls
        if (!callRecord.disposition) {
          let disposition = 'No Answer';
          if (callStatus === 'busy') {
            disposition = 'No Answer';
          } else if (callStatus === 'no-answer') {
            disposition = 'No Answer';
          } else {
            disposition = 'Wrong Number';
          }

          updateFields.push('disposition = ?');
          updateValues.push(disposition);
        }
        break;
    }

    // Apply updates if any
    if (updateFields.length > 0) {
      updateValues.push(callRecord.id);
      const updateSql = `
        UPDATE calls
        SET ${updateFields.join(', ')}
        WHERE id = ?
      `;
      db.prepare(updateSql).run(...updateValues);
      console.log(`[SignalWire Webhook] Updated call ${callRecord.id} to status: ${newStatus}`);
    }

    // Log the webhook event for debugging
    db.prepare(`
      INSERT INTO webhook_logs (provider, event_type, call_id, payload, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(
      'signalwire',
      eventType,
      callRecord.id,
      JSON.stringify({
        callSid: payload.CallSid,
        callStatus: payload.CallStatus,
        from: payload.From,
        to: payload.To,
        direction: payload.Direction,
        recordingUrl: payload.RecordingUrl,
        answeringMachineResult: payload.AnsweringMachineResult,
        duration: payload.CallDuration
      })
    );

    // Broadcast update to monitoring clients
    try {
      // Import dynamically to avoid circular dependency
      import('../index.js').then(mod => {
        const broadcastToMonitors = mod.broadcastToMonitors;
        if (broadcastToMonitors) {
          broadcastToMonitors({
            type: 'call_event',
            data: {
              callId: callRecord.id,
              leadId: callRecord.lead_id,
              eventType: eventType,
              status: newStatus,
              provider: 'signalwire',
              signalwireCallId: payload.CallSid,
              timestamp: new Date().toISOString()
            }
          });
        }
      }).catch(error => {
        console.error('[SignalWire Webhook] Failed to broadcast to monitors:', error.message);
      });
    } catch (error) {
      console.error('[SignalWire Webhook] Failed to broadcast to monitors:', error.message);
    }

    // Emit event to call handler if terminal
    if (isTerminal) {
      console.log(`[SignalWire Webhook] Terminal event for call ${callRecord.id}, triggering post-call processing`);
      // TODO: Trigger post-call processing (extract data, post to FUB, etc.)
      // This would typically be done by a background job or event handler
    }

    // Return appropriate response to SignalWire
    // For status callbacks, we just return 200 OK with empty TwiML
    const responseTime = Date.now() - startTime;
    console.log(`[SignalWire Webhook] Processed in ${responseTime}ms`);

    res.status(200)
      .type('text/xml')
      .send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');

  } catch (error) {
    console.error('[SignalWire Webhook] Error processing callback:', error);
    console.error('[SignalWire Webhook] Error stack:', error.stack);
    console.error('[SignalWire Webhook] Payload:', JSON.stringify(payload, null, 2));

    // Still return 200 to SignalWire to avoid retries
    // Log the error for later analysis
    db.prepare(`
      INSERT INTO webhook_logs (provider, event_type, call_id, payload, error, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(
      'signalwire',
      'error',
      null,
      JSON.stringify(payload),
      error.message
    );

    res.status(200).send('OK');
  }
});

/**
 * POST /api/webhooks/signalwire/amd
 *
 * Webhook endpoint for SignalWire async AMD callbacks.
 * This is called when async AMD completes (if AsyncAmdStatusCallback is set).
 *
 * Security: Signature validation prevents spoofing and ensures authenticity
 *
 * SignalWire sends AMD results via:
 * - AnsweredBy field: The AMD detection result
 * - Confidence field (optional): Confidence level of detection
 *
 * Possible AnsweredBy values:
 * - human: Human answered
 * - machine_start: Machine detected (quick detection)
 * - machine_end_beep: Machine detected with beep
 * - machine_end_silence: Machine detected with silence
 * - machine_end_other: Machine detected (other)
 * - fax: Fax machine detected
 * - unknown: Detection inconclusive
 */
router.post('/signalwire/amd',
  captureRawBody, // Capture raw body for signature validation
  validateSignalWebhook(db, { enabled: false, logFailures: true }), // Validate signature
  (req, res) => {
  const startTime = Date.now();

  // SignalWire can send either form-url-encoded or JSON
  const payload = req.body && typeof req.body === 'object' ? req.body : req.query;

  console.log('[SignalWire AMD Webhook] Received callback:', {
    timestamp: new Date().toISOString(),
    callSid: payload.CallSid,
    answeredBy: payload.AnsweredBy,
    confidence: payload.Confidence
  });

  try {
    // Validate required fields
    if (!payload.CallSid) {
      console.error('[SignalWire AMD Webhook] Missing CallSid in callback');
      return res.status(400).send('Missing CallSid');
    }

    if (!payload.AnsweredBy) {
      console.error('[SignalWire AMD Webhook] Missing AnsweredBy in callback');
      return res.status(400).send('Missing AnsweredBy');
    }

    // Find the call record in our database by SignalWire Call SID
    const callRecord = db.prepare(`
      SELECT c.*, l.id as lead_id
      FROM calls c
      JOIN leads l ON c.lead_id = l.id
      WHERE c.signalwire_call_id = ?
    `).get(payload.CallSid);

    if (!callRecord) {
      console.warn(`[SignalWire AMD Webhook] No call record found for SignalWire Call SID: ${payload.CallSid}`);
      return res.status(200).send('OK');
    }

    console.log(`[SignalWire AMD Webhook] Found call record ID: ${callRecord.id}, Lead ID: ${callRecord.lead_id}`);

    // Map SignalWire AMD result to unified format
    const amdResult = mapSignalWireAmdResult(payload.AnsweredBy, payload.Confidence);

    console.log('[SignalWire AMD Webhook] Mapped AMD result:', {
      callId: callRecord.id,
      rawResult: payload.AnsweredBy,
      mappedResult: amdResult?.result,
      confidence: amdResult?.confidence
    });

    // Update call record with AMD result
    db.prepare(`
      UPDATE calls
      SET amd_result = ?,
          amd_confidence = ?,
          amd_detected_at = datetime('now')
      WHERE id = ?
    `).run(
      amdResult?.result || 'unknown',
      amdResult?.confidence || null,
      callRecord.id
    );

    // Update disposition based on AMD result if not already set
    if (!callRecord.disposition && amdResult) {
      let disposition = null;

      switch (amdResult.result) {
        case 'machine':
          disposition = 'Voicemail Left';
          break;
        case 'fax':
          disposition = 'Fax Detected';
          break;
        case 'human':
          // Don't set disposition for human - let call complete
          break;
        case 'unknown':
        default:
          // Don't set disposition for unknown
          break;
      }

      if (disposition) {
        db.prepare(`
          UPDATE calls
          SET disposition = ?
          WHERE id = ?
        `).run(disposition, callRecord.id);

        console.log(`[SignalWire AMD Webhook] Set disposition to "${disposition}" for call ${callRecord.id}`);
      }
    }

    // Log the AMD webhook event for debugging
    db.prepare(`
      INSERT INTO webhook_logs (provider, event_type, call_id, payload, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(
      'signalwire',
      'amd_result',
      callRecord.id,
      JSON.stringify({
        callSid: payload.CallSid,
        answeredBy: payload.AnsweredBy,
        confidence: payload.Confidence,
        mappedResult: amdResult?.result
      })
    );

    // Broadcast AMD result to monitoring clients
    try {
      import('../index.js').then(mod => {
        const broadcastToMonitors = mod.broadcastToMonitors;
        if (broadcastToMonitors) {
          broadcastToMonitors({
            type: 'amd_result',
            data: {
              callId: callRecord.id,
              leadId: callRecord.lead_id,
              provider: 'signalwire',
              signalwireCallId: payload.CallSid,
              amdResult: amdResult?.result,
              confidence: amdResult?.confidence,
              rawResult: payload.AnsweredBy,
              timestamp: new Date().toISOString()
            }
          });
        }
      }).catch(error => {
        console.error('[SignalWire AMD Webhook] Failed to broadcast to monitors:', error.message);
      });
    } catch (error) {
      console.error('[SignalWire AMD Webhook] Failed to broadcast to monitors:', error.message);
    }

    // Return 200 OK to SignalWire
    const responseTime = Date.now() - startTime;
    console.log(`[SignalWire AMD Webhook] Processed in ${responseTime}ms`);

    res.status(200).send('OK');

  } catch (error) {
    console.error('[SignalWire AMD Webhook] Error processing callback:', error);
    console.error('[SignalWire AMD Webhook] Error stack:', error.stack);
    console.error('[SignalWire AMD Webhook] Payload:', JSON.stringify(payload, null, 2));

    // Still return 200 to SignalWire to avoid retries
    // Log the error for later analysis
    db.prepare(`
      INSERT INTO webhook_logs (provider, event_type, call_id, payload, error, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(
      'signalwire',
      'amd_error',
      null,
      JSON.stringify(payload),
      error.message
    );

    res.status(200).send('OK');
  }
});

/**
 * POST /api/webhooks/signalwire/recording
 *
 * Webhook endpoint for SignalWire recording status callbacks.
 * This is called when a recording is ready for download.
 *
 * Security: Signature validation prevents spoofing and ensures authenticity
 */
router.post('/signalwire/recording',
  captureRawBody, // Capture raw body for signature validation
  validateSignalWebhook(db, { enabled: false, logFailures: true }), // Validate signature
  (req, res) => {
  const payload = req.body && typeof req.body === 'object' ? req.body : req.query;

  console.log('[SignalWire Recording Webhook] Received:', {
    timestamp: new Date().toISOString(),
    recordingSid: payload.RecordingSid,
    callSid: payload.CallSid,
    recordingUrl: payload.RecordingUrl,
    recordingDuration: payload.RecordingDuration
  });

  try {
    if (!payload.CallSid || !payload.RecordingUrl) {
      console.error('[SignalWire Recording Webhook] Missing required fields');
      return res.status(400).send('Missing required fields');
    }

    // Find call by SignalWire Call SID
    const callRecord = db.prepare(`
      SELECT id FROM calls WHERE signalwire_call_id = ?
    `).get(payload.CallSid);

    if (!callRecord) {
      console.warn(`[SignalWire Recording Webhook] No call record found for Call SID: ${payload.CallSid}`);
      return res.status(200).send('OK');
    }

    // Update call with recording URL
    db.prepare(`
      UPDATE calls
      SET recording_url = ?
      WHERE id = ?
    `).run(payload.RecordingUrl, callRecord.id);

    console.log(`[SignalWire Recording Webhook] Updated call ${callRecord.id} with recording URL`);

    // Log the event
    db.prepare(`
      INSERT INTO webhook_logs (provider, event_type, call_id, payload, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(
      'signalwire',
      'recording',
      callRecord.id,
      JSON.stringify(payload)
    );

    res.status(200).send('OK');

  } catch (error) {
    console.error('[SignalWire Recording Webhook] Error:', error);
    res.status(200).send('OK');
  }
});

/**
 * POST /api/webhooks/signalwire/laml
 *
 * LaML (TwiML) endpoint for SignalWire outbound calls.
 * This is the URL that SignalWire calls when the call is initiated.
 * It returns LaML instructions telling SignalWire how to handle the call.
 *
 * For this voice agent application, it connects the call to Deepgram's
 * voice agent WebSocket endpoint for AI-powered conversation.
 */
router.post('/signalwire/laml', express.urlencoded({ extended: true }), (req, res) => {
  const callId = req.query.callId;
  const payload = req.body;

  console.log('[SignalWire LaML] Received call setup request:', {
    timestamp: new Date().toISOString(),
    callId: callId,
    callSid: payload.CallSid,
    callStatus: payload.CallStatus,
    from: payload.From,
    to: payload.To
  });

  try {
    // Update call record with SignalWire Call SID if we have internal callId
    if (callId && payload.CallSid) {
      db.prepare(`
        UPDATE calls SET signalwire_call_id = ? WHERE id = ?
      `).run(payload.CallSid, callId);

      console.log(`[SignalWire LaML] Updated call ${callId} with SignalWire SID: ${payload.CallSid}`);
    }

    // Get lead ID from call record for the audio bridge
    let leadId = null;
    if (callId) {
      const callRecord = db.prepare(`SELECT lead_id FROM calls WHERE id = ?`).get(callId);
      leadId = callRecord?.lead_id;
    }

    // Build WebSocket URL for our audio bridge
    // The audio bridge handles SignalWire stream <-> Deepgram Voice Agent communication
    const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 'http://localhost:3000';
    // Convert HTTP URL to WSS URL for WebSocket connection
    const wsBaseUrl = webhookBaseUrl.replace('https://', 'wss://').replace('http://', 'ws://');
    // IMPORTANT: SignalWire Stream URL does NOT support query string parameters
    // Must use <Parameter> elements instead to pass call_id and lead_id
    const audioBridgeWsUrl = `${wsBaseUrl}/ws/signalwire-audio`;

    console.log(`[SignalWire LaML] Audio bridge WebSocket URL: ${audioBridgeWsUrl}`);
    console.log(`[SignalWire LaML] Passing custom parameters - call_id: ${callId}, lead_id: ${leadId}`);

    // Build LaML response following SignalWire's official example pattern
    // This tells SignalWire to:
    // 1. Connect directly to our audio bridge WebSocket (no delay message)
    // 2. The audio bridge then connects to Deepgram Voice Agent
    // 3. Audio flows: SignalWire <-> Audio Bridge <-> Deepgram
    //
    // NOTE: We encode call_id in the URL path since SignalWire doesn't reliably
    // support <Parameter> elements inside <Connect><Stream>
    const audioBridgeWsUrlWithCallId = `${audioBridgeWsUrl}/${callId || 'unknown'}/${leadId || '0'}`;

    const laml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${audioBridgeWsUrlWithCallId}" />
  </Connect>
</Response>`;

    console.log('[SignalWire LaML] Returning LaML response for Deepgram voice agent connection');

    res.status(200)
      .type('text/xml')
      .send(laml);

  } catch (error) {
    console.error('[SignalWire LaML] Error:', error);

    // Return a fallback LaML that says something went wrong
    const errorLaml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Matthew">We're sorry, but we're unable to connect your call at this time. Please try again later.</Say>
  <Hangup />
</Response>`;

    res.status(200)
      .type('text/xml')
      .send(errorLaml);
  }
});

/**
 * GET /api/webhooks/signalwire/laml
 *
 * GET handler for LaML endpoint (SignalWire may use GET in some cases)
 */
router.get('/signalwire/laml', (req, res) => {
  const callId = req.query.callId;

  console.log('[SignalWire LaML GET] Received call setup request:', {
    timestamp: new Date().toISOString(),
    callId: callId
  });

  // Get lead ID from call record for the audio bridge
  let leadId = null;
  if (callId) {
    const callRecord = db.prepare(`SELECT lead_id FROM calls WHERE id = ?`).get(callId);
    leadId = callRecord?.lead_id;
  }

  // Build WebSocket URL for our audio bridge
  // IMPORTANT: SignalWire Stream URL does NOT support query string parameters
  const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 'http://localhost:3000';
  const wsBaseUrl = webhookBaseUrl.replace('https://', 'wss://').replace('http://', 'ws://');
  const audioBridgeWsUrl = `${wsBaseUrl}/ws/signalwire-audio`;

  // Encode call_id and lead_id in URL path
  const audioBridgeWsUrlWithCallId = `${audioBridgeWsUrl}/${callId || 'unknown'}/${leadId || '0'}`;

  const laml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${audioBridgeWsUrlWithCallId}" />
  </Connect>
</Response>`;

  res.status(200)
    .type('text/xml')
    .send(laml);
});

export default router;
