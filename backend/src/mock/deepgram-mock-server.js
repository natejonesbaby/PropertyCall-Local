/**
 * Deepgram Mock Server
 *
 * A simple mock server that simulates Deepgram API responses for local testing.
 * Run this alongside the main app to test Deepgram integration without real credentials.
 *
 * Usage: node backend/src/mock/deepgram-mock-server.js
 * The mock server listens on port 12112
 */

import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';

const app = express();
const PORT = 12112;

app.use(express.json());

// Mock authentication middleware
app.use((req, res, next) => {
  const authHeader = req.headers.authorization;

  // Accept any Token that starts with "KEY" or "MOCK_" or has valid length for testing
  if (authHeader && authHeader.startsWith('Token ')) {
    const token = authHeader.substring(6);
    if (token.startsWith('KEY') || token.startsWith('MOCK_') || token.length >= 20) {
      req.authenticated = true;
      req.apiKey = token;
    }
  }

  next();
});

// Mock auth/token endpoint (used by health check for API key validation)
// This endpoint works with all API key types (admin and project-scoped)
app.get('/v1/auth/token', (req, res) => {
  if (!req.authenticated) {
    return res.status(401).json({
      err_code: 'INVALID_AUTH',
      err_msg: 'Unauthorized',
      request_id: `mock-req-${Date.now()}`
    });
  }

  // Return mock token info - simulates Deepgram's response
  res.json({
    api_key_id: `mock-key-${Date.now()}`,
    key: req.apiKey.substring(0, 8) + '...',
    comment: 'Mock API Key',
    created: new Date().toISOString(),
    scopes: ['usage:read', 'listen'],
    expiration_date: null,
    member: {
      member_id: 'mock-member-1',
      email: 'mock@deepgram.com'
    }
  });
});

// Mock projects endpoint (legacy - may return 403 for project-scoped keys)
app.get('/v1/projects', (req, res) => {
  if (!req.authenticated) {
    return res.status(401).json({
      err_code: 'INVALID_AUTH',
      err_msg: 'Unauthorized',
      request_id: `mock-req-${Date.now()}`
    });
  }

  res.json({
    projects: [
      {
        project_id: 'mock-project-1',
        name: 'Mock Project',
        company: 'Mock Company',
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        balance: {
          balance_id: 'mock-balance-1',
          amount: 200.00,
          units: 'usd'
        }
      }
    ]
  });
});

// Mock transcription endpoint
app.post('/v1/listen', (req, res) => {
  if (!req.authenticated) {
    return res.status(401).json({
      err_code: 'INVALID_AUTH',
      err_msg: 'Unauthorized'
    });
  }

  res.json({
    metadata: {
      transaction_key: `mock-tx-${Date.now()}`,
      request_id: `mock-req-${Date.now()}`,
      sha256: 'mock-sha256',
      created: new Date().toISOString(),
      duration: 5.0,
      channels: 1,
      models: ['nova-2']
    },
    results: {
      channels: [
        {
          alternatives: [
            {
              transcript: 'Mock transcription result.',
              confidence: 0.98,
              words: [
                { word: 'Mock', start: 0.0, end: 0.3, confidence: 0.99 },
                { word: 'transcription', start: 0.4, end: 0.8, confidence: 0.97 },
                { word: 'result', start: 0.9, end: 1.2, confidence: 0.98 }
              ]
            }
          ]
        }
      ]
    }
  });
});

// Mock keys endpoint
app.get('/v1/projects/:projectId/keys', (req, res) => {
  if (!req.authenticated) {
    return res.status(401).json({
      err_code: 'INVALID_AUTH',
      err_msg: 'Unauthorized'
    });
  }

  res.json({
    api_keys: [
      {
        api_key_id: 'mock-key-1',
        comment: 'Mock API Key',
        created: new Date().toISOString(),
        scopes: ['member']
      }
    ]
  });
});

// Mock usage endpoint
app.get('/v1/projects/:projectId/usage', (req, res) => {
  if (!req.authenticated) {
    return res.status(401).json({
      err_code: 'INVALID_AUTH',
      err_msg: 'Unauthorized'
    });
  }

  res.json({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    end: new Date().toISOString(),
    resolution: {
      units: 'day',
      amount: 1
    },
    results: []
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', mock: true, service: 'deepgram-mock' });
});

// Create HTTP server for both REST API and WebSocket
const server = http.createServer(app);

// WebSocket server for Voice Agent simulation (on /agent path)
const wss = new WebSocketServer({ server, path: '/agent' });

wss.on('connection', (ws, req) => {
  console.log('Mock Deepgram Voice Agent WebSocket connection established');

  // Check for authorization in headers or query params
  const authHeader = req.headers.authorization;
  let authenticated = false;

  if (authHeader && authHeader.startsWith('Token ')) {
    const token = authHeader.substring(6);
    if (token.startsWith('KEY') || token.startsWith('MOCK_') || token.length >= 20) {
      authenticated = true;
    }
  }

  if (!authenticated) {
    console.log('Mock Deepgram: Unauthorized WebSocket connection');
    ws.close(4001, 'Unauthorized');
    return;
  }

  // Send Welcome message immediately
  ws.send(JSON.stringify({
    type: 'Welcome',
    agent_audio_config: {
      sample_rate: 8000,
      encoding: 'mulaw',
      bit_depth: 8
    },
    user_audio_config: {
      sample_rate: 8000,
      encoding: 'mulaw',
      bit_depth: 8
    },
    session_id: `mock-session-${Date.now()}`
  }));

  console.log('Mock Deepgram: Sent Welcome message');

  // Track conversation state
  let speechActive = false;
  let messageCount = 0;
  let conversationStage = 0; // Track conversation progress for callback scheduling scenario
  let callbackTestMode = false; // Flag for callback scheduling test mode
  let disqualifyTestMode = false; // Flag for disqualifying trigger test mode (Feature #177)
  let disqualifyTriggerType = 'not_interested'; // Can be: not_interested, wrong_number, already_sold

  ws.on('message', (data) => {
    messageCount++;

    // Try to parse as JSON first (messages may come as Buffer)
    let jsonMsg = null;
    try {
      const dataStr = data.toString('utf8');
      if (dataStr.startsWith('{')) {
        jsonMsg = JSON.parse(dataStr);
      }
    } catch (e) {
      // Not JSON, treat as binary audio
    }

    // Handle binary audio data (only if not JSON)
    if (!jsonMsg && Buffer.isBuffer(data)) {
      // Simulate speech detection after receiving some audio
      if (messageCount % 50 === 0 && !speechActive) {
        speechActive = true;
        ws.send(JSON.stringify({
          type: 'UserStartedSpeaking'
        }));

        // Simulate end of speech and transcription after a delay
        setTimeout(() => {
          speechActive = false;

          // Check if this is a disqualifying trigger test scenario (Feature #177)
          if (disqualifyTestMode && conversationStage === 0) {
            conversationStage = 1;

            // Determine user response based on trigger type
            let userResponse;
            let agentResponse;
            let disposition;

            switch (disqualifyTriggerType) {
              case 'wrong_number':
                userResponse = "You've got the wrong number. I don't own any property at that address.";
                agentResponse = "I apologize for the confusion. Thank you for letting me know. Have a great day!";
                disposition = 'Wrong Number';
                break;
              case 'already_sold':
                userResponse = "We already sold that property last month.";
                agentResponse = "Congratulations on the sale! Thank you for letting me know. Have a wonderful day!";
                disposition = 'Already Sold';
                break;
              case 'not_interested':
              default:
                userResponse = "I'm not interested. Please don't call me again.";
                agentResponse = "I completely understand. Thank you for your time, and have a great day!";
                disposition = 'Not Interested';
                break;
            }

            console.log(`Mock Deepgram: User said disqualifying phrase - "${userResponse}"`);

            ws.send(JSON.stringify({
              type: 'ConversationText',
              role: 'user',
              content: userResponse,
              is_final: true
            }));

            // Simulate agent response to disqualifying phrase
            setTimeout(() => {
              ws.send(JSON.stringify({
                type: 'AgentThinking',
                content: `User said disqualifying phrase. Ending call politely with disposition: ${disposition}`
              }));

              // Send end_call function request
              setTimeout(() => {
                const endCallFunctionId = `func-end-${Date.now()}`;
                console.log('Mock Deepgram: Sending end_call FunctionCallRequest');

                ws.send(JSON.stringify({
                  type: 'FunctionCallRequest',
                  function_name: 'end_call',
                  function_call_id: endCallFunctionId,
                  input: {
                    reason: disposition
                  }
                }));

                // Send extract_qualification_data with appropriate disposition
                setTimeout(() => {
                  const qualFunctionId = `func-qual-${Date.now()}`;
                  console.log('Mock Deepgram: Sending extract_qualification_data FunctionCallRequest');

                  ws.send(JSON.stringify({
                    type: 'FunctionCallRequest',
                    function_name: 'extract_qualification_data',
                    function_call_id: qualFunctionId,
                    input: {
                      qualification_status: 'Not Qualified',
                      sentiment: 'Not Interested',
                      disposition: disposition
                    }
                  }));

                  // Agent says polite goodbye
                  setTimeout(() => {
                    ws.send(JSON.stringify({
                      type: 'AgentStartedSpeaking',
                      tts_latency: 150,
                      total_latency: 350
                    }));

                    ws.send(JSON.stringify({
                      type: 'ConversationText',
                      role: 'assistant',
                      content: agentResponse,
                      is_final: true
                    }));

                    // Send mock audio for goodbye
                    const mockAudio = Buffer.alloc(1600, 0x7F);
                    ws.send(mockAudio);

                    setTimeout(() => {
                      ws.send(JSON.stringify({
                        type: 'AgentAudioDone'
                      }));

                      // Close the stream after goodbye
                      setTimeout(() => {
                        console.log('Mock Deepgram: Call ended due to disqualifying trigger');
                        ws.send(JSON.stringify({
                          type: 'CloseStream',
                          reason: 'Call ended - disqualifying trigger detected'
                        }));
                      }, 200);
                    }, 100);
                  }, 200);
                }, 100);
              }, 200);
            }, 200);
            return;
          }

          // Check if this is a callback scheduling test scenario (Feature #178)
          if (callbackTestMode && conversationStage === 0) {
            // First response: User asks for callback
            conversationStage = 1;

            ws.send(JSON.stringify({
              type: 'ConversationText',
              role: 'user',
              content: 'Call me back tomorrow at 2pm',
              is_final: true
            }));

            console.log('Mock Deepgram: User requested callback - "Call me back tomorrow at 2pm"');

            // Simulate agent response to callback request
            setTimeout(() => {
              ws.send(JSON.stringify({
                type: 'AgentThinking',
                content: 'User requested a callback. Extracting callback time...'
              }));

              // Calculate tomorrow at 2pm
              const tomorrow = new Date();
              tomorrow.setDate(tomorrow.getDate() + 1);
              tomorrow.setHours(14, 0, 0, 0);
              const callbackTime = tomorrow.toISOString();

              // Send FunctionCallRequest to extract callback scheduling data
              setTimeout(() => {
                const functionCallId = `func-call-${Date.now()}`;
                console.log('Mock Deepgram: Sending FunctionCallRequest for callback scheduling');

                ws.send(JSON.stringify({
                  type: 'FunctionCallRequest',
                  function_name: 'extract_qualification_data',
                  function_call_id: functionCallId,
                  input: {
                    qualification_status: 'Qualified',
                    sentiment: 'Somewhat Motivated',
                    disposition: 'Callback Scheduled',
                    motivation_to_sell: 'Interested but wants to discuss further',
                    timeline: 'Within 6 months',
                    callback_time: callbackTime
                  }
                }));

                // Also send agent confirmation message
                setTimeout(() => {
                  ws.send(JSON.stringify({
                    type: 'AgentStartedSpeaking',
                    tts_latency: 150,
                    total_latency: 350
                  }));

                  ws.send(JSON.stringify({
                    type: 'ConversationText',
                    role: 'assistant',
                    content: `Great! I\'ve scheduled a callback for tomorrow at 2pm. We\'ll give you a call then. Have a great day!`,
                    is_final: true
                  }));

                  const mockAudio = Buffer.alloc(1600, 0x7F);
                  ws.send(mockAudio);

                  setTimeout(() => {
                    ws.send(JSON.stringify({
                      type: 'AgentAudioDone'
                    }));
                  }, 100);
                }, 200);
              }, 200);
            }, 200);
            return;
          }

          // Default conversation flow (non-test mode)
          // Send interim transcript
          ws.send(JSON.stringify({
            type: 'ConversationText',
            role: 'user',
            content: 'Hello, I received a call about my property.',
            is_final: false
          }));

          // Send final transcript
          setTimeout(() => {
            ws.send(JSON.stringify({
              type: 'ConversationText',
              role: 'user',
              content: 'Hello, I received a call about my property.',
              is_final: true
            }));

            // Simulate agent thinking
            setTimeout(() => {
              ws.send(JSON.stringify({
                type: 'AgentThinking',
                content: 'Processing user query about property...'
              }));

              // Simulate agent starting to speak
              setTimeout(() => {
                ws.send(JSON.stringify({
                  type: 'AgentStartedSpeaking',
                  tts_latency: 150,
                  total_latency: 350
                }));

                // Send agent response text
                ws.send(JSON.stringify({
                  type: 'ConversationText',
                  role: 'assistant',
                  content: 'Hi there! Thank you for taking my call. I\'m reaching out because we noticed your property might be a good fit for our buyers. Are you the owner of the property?',
                  is_final: true
                }));

                // Send mock audio data (in real usage this would be TTS audio)
                const mockAudio = Buffer.alloc(1600, 0x7F); // Neutral mulaw audio
                ws.send(mockAudio);

                setTimeout(() => {
                  ws.send(JSON.stringify({
                    type: 'AgentAudioDone'
                  }));
                }, 100);
              }, 200);
            }, 100);
          }, 50);
        }, 500);
      }
      return;
    }

    // Handle JSON messages (use already parsed jsonMsg if available)
    const msg = jsonMsg;
    if (msg) {
      console.log('Mock Deepgram received message:', msg.type || 'unknown');

      if (msg.type === 'SettingsConfiguration') {
        // Log the greeting if present (for Feature #164 verification)
        if (msg.agent && msg.agent.greeting) {
          console.log('Mock Deepgram: GREETING RECEIVED:', msg.agent.greeting);
        } else {
          console.log('Mock Deepgram: No greeting configured in SettingsConfiguration');
        }
        // Log the system prompt/instructions for Feature #176 verification
        if (msg.agent && msg.agent.think && msg.agent.think.instructions) {
          console.log('Mock Deepgram: INSTRUCTIONS RECEIVED:');
          console.log(msg.agent.think.instructions);
          // Check for callback test mode trigger
          if (msg.agent.think.instructions.includes('CALLBACK_TEST_MODE')) {
            callbackTestMode = true;
            console.log('Mock Deepgram: CALLBACK TEST MODE ENABLED');
          }
          // Check for disqualify test mode trigger (Feature #177)
          if (msg.agent.think.instructions.includes('DISQUALIFY_TEST_MODE')) {
            disqualifyTestMode = true;
            console.log('Mock Deepgram: DISQUALIFY TEST MODE ENABLED');
            // Check for specific trigger type
            if (msg.agent.think.instructions.includes('TRIGGER_TYPE:wrong_number')) {
              disqualifyTriggerType = 'wrong_number';
            } else if (msg.agent.think.instructions.includes('TRIGGER_TYPE:already_sold')) {
              disqualifyTriggerType = 'already_sold';
            } else {
              disqualifyTriggerType = 'not_interested';
            }
            console.log('Mock Deepgram: Trigger type:', disqualifyTriggerType);
          }
        }
        ws.send(JSON.stringify({
          type: 'SettingsApplied',
          settings: msg.audio || {}
        }));
      } else if (msg.type === 'InjectAgentMessage') {
        // Handle injected messages (like initial greeting)
        ws.send(JSON.stringify({
          type: 'AgentStartedSpeaking',
          tts_latency: 100,
          total_latency: 200
        }));
        ws.send(JSON.stringify({
          type: 'ConversationText',
          role: 'assistant',
          content: msg.message || 'Hello, this is a test call.',
          is_final: true
        }));
      } else if (msg.type === 'FunctionCallResponse') {
        // Handle function call response from the client
        console.log('Mock Deepgram: Received FunctionCallResponse:', msg.function_call_id);
        console.log('Mock Deepgram: Function result:', msg.output);
      } else if (msg.type === 'Ping') {
        ws.send(JSON.stringify({ type: 'Pong' }));
      } else if (msg.type === 'CloseStream') {
        ws.close(1000, 'Client requested close');
      }
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`Mock Deepgram: WebSocket closed (${code}: ${reason})`);
  });

  ws.on('error', (error) => {
    console.error('Mock Deepgram WebSocket error:', error);
  });
});

server.listen(PORT, () => {
  console.log(`Deepgram Mock Server running on http://localhost:${PORT}`);
  console.log(`WebSocket Voice Agent available at ws://localhost:${PORT}/agent`);
  console.log('Use Token starting with "KEY" or "MOCK_" for successful auth');
});
