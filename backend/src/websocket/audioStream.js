/**
 * WebSocket Audio Streaming Handler
 *
 * Handles WebSocket connections from Telnyx for audio streaming
 * and manages the audio bridge to Deepgram Voice Agent
 */

import { audioBridgeManager } from '../services/audioBridge.js';
import { db } from '../db/setup.js';
import crypto from 'crypto';

// Encryption settings for API key retrieval
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'property-call-default-key-32b!';
const ALGORITHM = 'aes-256-cbc';

function decrypt(encryptedText) {
  if (!encryptedText) return null;
  try {
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const [ivHex, encrypted] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    return null;
  }
}

/**
 * Get API keys from database
 */
function getApiKeys(userId) {
  if (!userId) {
    console.error('[Audio WS] WARNING: No userId provided to getApiKeys');
    return {};
  }
  const keys = {};
  const services = ['deepgram', 'openai'];

  for (const service of services) {
    const row = db.prepare(`
      SELECT api_key_encrypted FROM api_keys WHERE user_id = ? AND service = ?
    `).get(userId, service);

    if (row && row.api_key_encrypted) {
      keys[service] = decrypt(row.api_key_encrypted);
    }
  }

  return keys;
}

/**
 * Get system prompt and greeting from database
 */
function getPrompts(userId) {
  if (!userId) return {};
  const prompts = {};

  const rows = db.prepare(`
    SELECT type, content FROM prompts WHERE user_id = ?
  `).all(userId);

  for (const row of rows) {
    prompts[row.type] = row.content;
  }

  return prompts;
}

/**
 * Get qualifying questions from database
 */
function getQualifyingQuestions(userId) {
  if (!userId) return [];
  return db.prepare(`
    SELECT question FROM qualifying_questions WHERE user_id = ? ORDER BY order_index
  `).all(userId).map(r => r.question);
}

/**
 * Get the user's selected voice from database
 */
function getSelectedVoice(userId) {
  if (!userId) return 'aura-asteria-en';
  const setting = db.prepare(`
    SELECT value FROM settings
    WHERE user_id = ? AND key = 'selected_voice'
  `).get(userId);

  return setting?.value || 'aura-asteria-en';  // Default to Asteria
}

/**
 * Get disqualifying triggers from database
 */
function getDisqualifyingTriggers(userId) {
  if (!userId) return [];
  return db.prepare(`
    SELECT trigger_phrase, action FROM disqualifying_triggers WHERE user_id = ? ORDER BY id
  `).all(userId);
}

/**
 * Substitute template variables in a string
 * Replaces {{first_name}}, {{last_name}}, {{property_address}} with actual lead info
 */
function substituteVariables(text, leadInfo) {
  if (!text) return text;

  let result = text;
  result = result.replace(/\{\{first_name\}\}/gi, leadInfo.firstName || 'there');
  result = result.replace(/\{\{last_name\}\}/gi, leadInfo.lastName || '');
  result = result.replace(/\{\{property_address\}\}/gi, leadInfo.propertyAddress || 'the property');

  return result;
}

/**
 * Handle audio stream WebSocket connection
 * Called when a client connects to /ws/audio
 */
export async function handleAudioConnection(ws, req) {
  // Parse query parameters
  const url = new URL(req.url, 'http://localhost');
  const callId = url.searchParams.get('call_id');
  const leadId = url.searchParams.get('lead_id');

  console.log(`[Audio WS] New connection - Call ID: ${callId}, Lead ID: ${leadId}`);

  if (!callId) {
    console.error('[Audio WS] Connection rejected - no call_id provided');
    ws.close(4000, 'call_id required');
    return;
  }

  try {
    // Get user_id from call record (the logged-in user who initiated the call)
    let userId = null;
    const callRecord = db.prepare(`
      SELECT user_id FROM calls WHERE id = ?
    `).get(callId);

    if (callRecord && callRecord.user_id) {
      userId = callRecord.user_id;
      console.log(`[Audio WS] Found call record, user_id: ${userId}`);
    }

    if (!userId) {
      console.error('[Audio WS] Could not determine user_id from call record');
      ws.close(4001, 'Could not determine user from call');
      return;
    }

    // Get lead info if lead_id provided
    let leadInfo = {};
    if (leadId) {
      const lead = db.prepare(`
        SELECT first_name, last_name, property_address, property_city, property_state
        FROM leads WHERE id = ?
      `).get(leadId);

      if (lead) {
        leadInfo = {
          firstName: lead.first_name,
          lastName: lead.last_name,
          propertyAddress: [lead.property_address, lead.property_city, lead.property_state]
            .filter(Boolean).join(', ')
        };
        console.log(`[Audio WS] Found lead info for ${leadInfo.firstName}`);
      }
    }

    // Get API keys for this user
    const apiKeys = getApiKeys(userId);

    if (!apiKeys.deepgram) {
      console.error('[Audio WS] Deepgram API key not configured for this user');
      ws.close(4001, 'Deepgram API key not configured');
      return;
    }

    // Get prompts and settings for this user
    const prompts = getPrompts(userId);
    const questions = getQualifyingQuestions(userId);
    const selectedVoice = getSelectedVoice(userId);
    const disqualifyingTriggers = getDisqualifyingTriggers(userId);

    // Substitute variables in greeting message with lead info (Feature #223)
    const greetingWithLeadInfo = substituteVariables(
      prompts.greeting || 'Hi, this is calling on behalf of a real estate investment company. Am I speaking with the property owner?',
      leadInfo
    );

    // Build system prompt with questions (substitute variables in questions too)
    let systemPrompt = prompts.system || `You are a friendly AI assistant calling on behalf of a real estate investment company to speak with property owners about potentially selling their property.`;

    if (questions.length > 0) {
      // Substitute lead info variables in each question
      const questionsWithLeadInfo = questions.map(q => substituteVariables(q, leadInfo));
      systemPrompt += `\n\nQualifying questions to ask:\n${questionsWithLeadInfo.map((q, i) => `${i + 1}. ${q}`).join('\n')}`;
    }

    // Add disqualifying triggers to the system prompt
    if (disqualifyingTriggers.length > 0) {
      const triggerInstructions = disqualifyingTriggers.map(t => {
        const action = t.action === 'end_call'
          ? 'politely thank them for their time and end the call immediately'
          : 'mark them as disqualified and end the call politely';
        return `- If they say "${t.trigger_phrase}": ${action}`;
      }).join('\n');

      systemPrompt += `\n\nDisqualifying triggers - when you detect these phrases, respond appropriately:\n${triggerInstructions}\n\nWhen ending a call due to a disqualifying trigger, always use the end_call function with the reason and set the appropriate disposition (e.g., "Not Interested", "Wrong Number", "Already Sold", etc.).`;
    }

    // Create audio bridge with substituted prompts (Feature #223)
    const bridge = await audioBridgeManager.createBridge({
      callId,
      deepgramApiKey: apiKeys.deepgram,
      openaiApiKey: apiKeys.openai,
      systemPrompt,
      greetingMessage: greetingWithLeadInfo,
      leadInfo,
      voice: selectedVoice
    });

    // Set up event handlers
    setupBridgeEventHandlers(bridge, callId, leadId, ws);

    // Connect to Deepgram
    await bridge.connectToDeepgram();

    // Set the Telnyx WebSocket
    bridge.setTelnyxWebSocket(ws);

    // Update call record with session ID
    if (bridge.sessionId) {
      db.prepare(`
        UPDATE calls SET deepgram_session_id = ? WHERE id = ?
      `).run(bridge.sessionId, callId);
    }

    console.log(`[Audio WS] Bridge established for call ${callId}`);

    // Send ready message to Telnyx/caller
    ws.send(JSON.stringify({
      event: 'ready',
      callId,
      sessionId: bridge.sessionId
    }));

  } catch (error) {
    console.error(`[Audio WS] Failed to setup bridge:`, error);
    ws.close(4002, 'Failed to initialize audio bridge');
  }
}

/**
 * Setup event handlers for the audio bridge
 */
function setupBridgeEventHandlers(bridge, callId, leadId, ws) {
  // Handle transcript updates
  bridge.on('transcript_update', ({ role, content }) => {
    console.log(`[Call ${callId}] ${role}: ${content}`);

    // Broadcast to live monitoring clients
    broadcastToMonitorsIfAvailable({
      type: 'transcript_update',
      data: {
        callId,
        role,
        content,
        timestamp: new Date().toISOString()
      }
    });
  });

  // Handle qualification data extraction
  bridge.on('qualification_extracted', async (data) => {
    console.log(`[Call ${callId}] Qualification extracted:`, data);

    try {
      // Update call record with extracted data
      const updates = [];
      const params = [];

      if (data.qualification_status) {
        updates.push('qualification_status = ?');
        params.push(data.qualification_status);
      }
      if (data.sentiment) {
        updates.push('sentiment = ?');
        params.push(data.sentiment);
      }
      if (data.disposition) {
        updates.push('disposition = ?');
        params.push(data.disposition);
      }
      if (data.callback_time) {
        updates.push('callback_time = ?');
        params.push(data.callback_time);
      }

      // Store answers as JSON
      const answers = {
        motivation_to_sell: data.motivation_to_sell,
        timeline: data.timeline,
        price_expectations: data.price_expectations
      };
      updates.push('answers = ?');
      params.push(JSON.stringify(answers));

      if (updates.length > 0) {
        params.push(callId);
        db.prepare(`UPDATE calls SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      }

      // Broadcast qualification data to monitoring clients for real-time display (Feature #226)
      broadcastToMonitorsIfAvailable({
        type: 'qualification_extracted',
        data: {
          callId,
          qualification_status: data.qualification_status,
          sentiment: data.sentiment,
          disposition: data.disposition,
          callback_time: data.callback_time,
          answers: [
            { question: 'Motivation to Sell', answer: data.motivation_to_sell },
            { question: 'Timeline', answer: data.timeline },
            { question: 'Price Expectations', answer: data.price_expectations }
          ].filter(a => a.answer), // Only include answers that have values
          motivation_to_sell: data.motivation_to_sell
        }
      });
    } catch (error) {
      console.error(`[Call ${callId}] Failed to save qualification data:`, error);
    }
  });

  // Handle call end request from AI
  bridge.on('call_end_requested', async ({ reason }) => {
    console.log(`[Call ${callId}] AI requested call end: ${reason}`);

    // The actual call termination should be handled by Telnyx webhook
    // We just log it here and prepare for cleanup
  });

  // Handle session started
  bridge.on('session_started', ({ sessionId }) => {
    broadcastToMonitorsIfAvailable({
      type: 'session_started',
      data: { callId, sessionId }
    });
  });

  // Handle agent speaking
  bridge.on('agent_speaking', ({ started }) => {
    broadcastToMonitorsIfAvailable({
      type: 'conversation_event',
      data: {
        callId,
        eventType: started ? 'AgentStartedSpeaking' : 'AgentAudioDone',
        timestamp: new Date().toISOString()
      }
    });
  });

  // Handle agent thinking
  bridge.on('agent_thinking', ({ content }) => {
    broadcastToMonitorsIfAvailable({
      type: 'conversation_event',
      data: {
        callId,
        eventType: 'AgentThinking',
        content,
        timestamp: new Date().toISOString()
      }
    });
  });

  // Handle user speaking
  bridge.on('user_speaking', ({ started }) => {
    broadcastToMonitorsIfAvailable({
      type: 'conversation_event',
      data: {
        callId,
        eventType: started ? 'UserStartedSpeaking' : 'UserStoppedSpeaking',
        timestamp: new Date().toISOString()
      }
    });
  });

  // Handle bridge closed
  bridge.on('closed', async (stats) => {
    console.log(`[Call ${callId}] Bridge closed. Stats:`, stats);

    try {
      // Update call record with final data
      db.prepare(`
        UPDATE calls
        SET transcript = ?,
            duration_seconds = ?,
            status = 'completed',
            ended_at = datetime('now')
        WHERE id = ?
      `).run(stats.transcript, stats.durationSeconds, callId);

      // Fetch the complete call record with extracted data for Feature #226
      const finalCall = db.prepare(`
        SELECT qualification_status, sentiment, disposition, answers, ai_summary, callback_time
        FROM calls WHERE id = ?
      `).get(callId);

      // Parse answers if they exist
      let parsedAnswers = [];
      if (finalCall?.answers) {
        try {
          const answersObj = JSON.parse(finalCall.answers);
          parsedAnswers = [
            { question: 'Motivation to Sell', answer: answersObj.motivation_to_sell },
            { question: 'Timeline', answer: answersObj.timeline },
            { question: 'Price Expectations', answer: answersObj.price_expectations }
          ].filter(a => a.answer); // Only include answers that have values
        } catch (e) {
          console.error(`[Call ${callId}] Error parsing answers:`, e);
        }
      }

      // Broadcast call ended to monitoring clients with extracted data (Feature #226)
      broadcastToMonitorsIfAvailable({
        type: 'call_ended',
        data: {
          callId,
          stats,
          // Include extracted data for display in Test Call results
          extractedData: finalCall ? {
            qualification_status: finalCall.qualification_status,
            sentiment: finalCall.sentiment,
            disposition: finalCall.disposition,
            answers: parsedAnswers,
            summary: finalCall.ai_summary,
            callback_time: finalCall.callback_time
          } : null
        }
      });
    } catch (error) {
      console.error(`[Call ${callId}] Failed to save final call data:`, error);
    }
  });

  // Handle errors
  bridge.on('error', ({ source, error }) => {
    console.error(`[Call ${callId}] Error from ${source}:`, error);

    broadcastToMonitorsIfAvailable({
      type: 'call_error',
      data: { callId, source, error: error.message || error }
    });
  });
}

/**
 * Broadcast to monitoring clients if the function is available
 */
function broadcastToMonitorsIfAvailable(message) {
  console.log(`[AudioStream] Broadcasting: ${message.type}`, message.data?.eventType || message.data?.role || '');
  // Dynamic import to avoid circular dependencies
  import('../index.js').then(mod => {
    if (mod.broadcastToMonitors) {
      mod.broadcastToMonitors(message);
      console.log(`[AudioStream] Broadcast sent successfully`);
    } else {
      console.log(`[AudioStream] broadcastToMonitors not available`);
    }
  }).catch((err) => {
    console.log(`[AudioStream] Broadcast failed:`, err.message);
  });
}

/**
 * Get current audio stream statistics
 */
export function getAudioStreamStats() {
  const bridges = audioBridgeManager.getActiveBridges();
  return {
    activeBridges: bridges.length,
    bridges: audioBridgeManager.getAllStats()
  };
}

export default handleAudioConnection;
