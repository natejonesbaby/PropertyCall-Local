# Local AI Stack Implementation Plan

## Overview
Replace Deepgram Voice Agent with fully local AI stack: Whisper (STT) + Ollama (LLM) + Voicebox (TTS)

## Phase 1: Infrastructure Setup (Immediate)

### 1.1 Install and Configure Local Services

#### Ollama Setup
```bash
# Install Ollama (if not already installed)
curl -fsSL https://ollama.com/install.sh | sh

# Pull recommended model for voice agent
ollama pull phi4-mini:3.8b

# Start Ollama server
ollama serve
# Runs on http://localhost:11434

# Test
curl http://localhost:11434/api/generate \
  -d '{"model":"phi4-mini:3.8b","prompt":"Hello","stream":false}'
```

#### Voicebox Setup
```bash
# Ensure Voicebox is running
open /Applications/Voicebox.app

# Create voice profile via Voicebox UI
# Or use REST API:
# POST http://localhost:8000/profiles
# Body: {"name": "Agent Voice", "language": "en"}

# Test TTS
curl -X POST http://localhost:8000/generate \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello world","profile_id":"YOUR_PROFILE_ID"}'
```

#### Whisper (STT) Setup
```bash
# Option A: Python with MLX (fastest on Apple Silicon)
pip install whisper-mlx

# Option B: Run Whisper as HTTP service
pip install whisper-server
whisper-server --host localhost --port 8001 --model base

# Test transcription
curl -X POST http://localhost:8001/transcribe \
  -F "audio=@test_audio.wav" \
  -F "model=base"
```

### 1.2 Environment Variables
Add to `backend/.env`:

```env
# Local AI Services
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=phi4-mini:3.8b
VOICEBOX_BASE_URL=http://localhost:8000
WHISPER_BASE_URL=http://localhost:8001

# Optional: Voicebox profile ID (create in Voicebox UI)
VOICEBOX_DEFAULT_PROFILE_ID=default-profile

# External Services (existing)
SIGNALWIRE_API_KEY=your_signalwire_key
SIGNALWIRE_PHONE_NUMBER=+1234567890
FUB_API_KEY=your_fub_key
```

---

## Phase 2: Backend Implementation

### 2.1 Create Local STT Service

**File**: `backend/src/services/whisperSTT.js`

```javascript
import FormData from 'form-data';

class WhisperSTT {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'http://localhost:8001';
    this.model = options.model || 'base';
  }

  async transcribe(audioBuffer) {
    const formData = new FormData();
    formData.append('audio', audioBuffer, {
      filename: 'audio.wav',
      contentType: 'audio/wav'
    });
    formData.append('model', this.model);

    const response = await fetch(`${this.baseUrl}/transcribe`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Whisper transcription failed: ${response.statusText}`);
    }

    const result = await response.json();
    return result.text;
  }

  async transcribeStream(audioStream) {
    // For real-time streaming transcription
    // Implementation depends on Whisper server capabilities
    throw new Error('Streaming not yet implemented');
  }
}

export default WhisperSTT;
```

### 2.2 Create Local LLM Service

**File**: `backend/src/services/ollamaLLM.js`

```javascript
class OllamaLLM {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'http://localhost:11434';
    this.model = options.model || 'phi4-mini:3.8b';
  }

  async generate(prompt, options = {}) {
    const {
      temperature = 0.7,
      max_tokens = 500,
      systemPrompt = null,
      functions = null
    } = options;

    const messages = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    messages.push({ role: 'user', content: prompt });

    const requestBody = {
      model: this.model,
      prompt: this._formatPrompt(messages),
      stream: options.stream || false,
      temperature,
      max_tokens,
      options: {
        num_ctx: 4000  // phi4-mini context window
      }
    };

    if (functions) {
      requestBody.format = 'json';
      requestBody.tools = this._convertFunctionsToTools(functions);
    }

    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`Ollama generation failed: ${response.statusText}`);
    }

    const result = await response.json();
    
    if (options.stream) {
      return result;  // Handle streaming response
    }

    return result.response || result.choices?.[0]?.message?.content;
  }

  async generateWithTools(prompt, tools, conversationHistory = []) {
    const messages = conversationHistory.concat([
      { role: 'user', content: prompt }
    ]);

    const response = await this.generate(JSON.stringify(messages), {
      tools: this._convertFunctionsToTools(tools),
      format: 'json',
      stream: false
    });

    // Parse tool calls from response
    return this._parseToolCalls(response);
  }

  _formatPrompt(messages) {
    return messages.map(m => m.content).join('\n');
  }

  _convertFunctionsToTools(functions) {
    return functions.map(fn => ({
      type: 'function',
      function: {
        name: fn.name,
        description: fn.description,
        parameters: fn.parameters
      }
    }));
  }

  _parseToolCalls(response) {
    // Parse phi4-mini function call format
    // Returns tool_calls array or null
    try {
      const parsed = JSON.parse(response);
      return parsed.tool_calls || parsed.message?.tool_calls;
    } catch (e) {
      return null;
    }
  }
}

export default OllamaLLM;
```

### 2.3 Create Local TTS Service

**File**: `backend/src/services/voiceboxTTS.js`

```javascript
class VoiceboxTTS {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'http://localhost:8000';
    this.defaultProfileId = options.defaultProfileId || null;
  }

  async generate(text, profileId = null) {
    const profileToUse = profileId || this.defaultProfileId;

    if (!profileToUse) {
      throw new Error('No voice profile ID configured. Create a profile in Voicebox or set VOICEBOX_DEFAULT_PROFILE_ID.');
    }

    const requestBody = {
      text: text,
      profile_id: profileToUse
    };

    const response = await fetch(`${this.baseUrl}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`Voicebox generation failed: ${response.statusText}`);
    }

    return await response.arrayBuffer();
  }

  async getProfiles() {
    const response = await fetch(`${this.baseUrl}/profiles`);
    if (!response.ok) {
      throw new Error('Failed to fetch Voicebox profiles');
    }
    return await response.json();
  }

  async createProfile(name, language = 'en') {
    const response = await fetch(`${this.baseUrl}/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, language })
    });

    if (!response.ok) {
      throw new Error('Failed to create Voicebox profile');
    }

    return await response.json();
  }
}

export default VoiceboxTTS;
```

### 2.4 Create Local AI Bridge Service

**File**: `backend/src/services/localAIBridge.js`

```javascript
import WhisperSTT from './whisperSTT.js';
import OllamaLLM from './ollamaLLM.js';
import VoiceboxTTS from './voiceboxTTS.js';

class LocalAIBridge extends EventEmitter {
  constructor(options = {}) {
    super();

    this.sttService = new WhisperSTT({
      baseUrl: options.whisperBaseUrl || process.env.WHISPER_BASE_URL
    });

    this.llmService = new OllamaLLM({
      baseUrl: options.ollamaBaseUrl || process.env.OLLAMA_BASE_URL,
      model: options.llmModel || process.env.OLLAMA_MODEL || 'phi4-mini:3.8b'
    });

    this.ttsService = new VoiceboxTTS({
      baseUrl: options.voiceboxBaseUrl || process.env.VOICEBOX_BASE_URL,
      defaultProfileId: options.voiceboxProfileId || process.env.VOICEBOX_DEFAULT_PROFILE_ID
    });

    this.conversationHistory = [];
    this.isActive = false;
  }

  /**
   * Process incoming audio: transcribe -> generate response -> synthesize speech
   */
  async processCallerAudio(audioBuffer, leadInfo, systemPrompt, qualifyingQuestions) {
    try {
      // Step 1: Transcribe audio
      const transcript = await this.sttService.transcribe(audioBuffer);
      this.emit('transcript', { role: 'user', content: transcript });

      // Add to conversation history
      this.conversationHistory.push({ role: 'user', content: transcript });

      // Step 2: Generate LLM response
      const prompt = this._buildPrompt(transcript, leadInfo, qualifyingQuestions);
      const response = await this.llmService.generateWithTools(
        prompt,
        this._getToolDefinitions(leadInfo),
        this.conversationHistory
      );

      this.emit('llm_response', response);

      // Step 3: Check for tool calls (qualification data, end call, etc.)
      if (response.tool_calls) {
        for (const toolCall of response.tool_calls) {
          await this._handleToolCall(toolCall, leadInfo);
        }
      }

      // Step 4: Generate speech from text response
      if (response.text) {
        const speechAudio = await this.ttsService.generate(response.text);
        this.emit('tts_generated', { audio: speechAudio });
        return speechAudio;
      }

    } catch (error) {
      console.error('Error in LocalAIBridge:', error);
      this.emit('error', error);
      throw error;
    }
  }

  _buildPrompt(transcript, leadInfo, qualifyingQuestions) {
    const basePrompt = systemPrompt || `You are a professional real estate acquisitions assistant calling ${leadInfo.firstName || 'a homeowner'} about their property at ${leadInfo.propertyAddress || 'their property'}.`;

    const context = `Lead info: Name: ${leadInfo.firstName} ${leadInfo.lastName || ''}, Address: ${leadInfo.propertyAddress}`;

    return `${basePrompt}\n\nContext: ${context}\n\nQualifying questions: ${qualifyingQuestions.map(q => `- ${q.question}`).join('\n')}\n\nCaller said: "${transcript}"\n\nRespond to the caller naturally. Ask qualifying questions to gather information. If you detect disqualifying signals or the caller wants to end the call, use the end_call function. If you gather qualification data, use the extract_qualification_data function.`;
  }

  _getToolDefinitions(leadInfo) {
    return [
      {
        name: 'extract_qualification_data',
        description: 'Extract qualification data when enough information has been gathered',
        parameters: {
          type: 'object',
          properties: {
            qualification_status: {
              type: 'string',
              enum: ['Qualified', 'Not Qualified', "Couldn't Reach"],
              description: 'The qualification status of the lead'
            },
            sentiment: {
              type: 'string',
              enum: ['Very Motivated', 'Somewhat Motivated', 'Neutral', 'Reluctant', 'Not Interested'],
              description: 'The seller sentiment level'
            },
            disposition: {
              type: 'string',
              enum: ['Callback Scheduled', 'Not Interested', 'Wrong Number', 'Already Sold', 'Voicemail Left', 'No Answer', 'Disqualified'],
              description: 'The call disposition'
            },
            motivation_to_sell: { type: 'string', description: 'Summary of their motivation to sell' },
            timeline: { type: 'string', description: 'When they want to sell' },
            price_expectations: { type: 'string', description: 'Their price expectations if mentioned' },
            callback_time: { type: 'string', description: 'Scheduled callback time if applicable (ISO format)' }
          },
          required: ['qualification_status', 'sentiment', 'disposition']
        }
      },
      {
        name: 'end_call',
        description: 'End the call gracefully',
        parameters: {
          type: 'object',
          properties: {
            reason: { type: 'string', description: 'Reason for ending the call' }
          },
          required: ['reason']
        }
      },
      {
        name: 'schedule_callback',
        description: 'Schedule a callback with the lead',
        parameters: {
          type: 'object',
          properties: {
            scheduled_time: { type: 'string', description: 'ISO format datetime' },
            note: { type: 'string', description: 'Reason for callback' }
          },
          required: ['scheduled_time']
        }
      }
    ];
  }

  async _handleToolCall(toolCall, leadInfo) {
    const { name, arguments: args } = toolCall;

    switch (name) {
      case 'extract_qualification_data':
        this.emit('qualification_extracted', args);
        break;
      case 'end_call':
        this.emit('call_end_requested', { reason: args.reason });
        break;
      case 'schedule_callback':
        this.emit('callback_scheduled', args);
        break;
    }
  }

  resetConversation() {
    this.conversationHistory = [];
  }

  getStats() {
    return {
      sttService: 'Whisper',
      llmService: 'Ollama',
      llmModel: this.llmService.model,
      ttsService: 'Voicebox'
    };
  }
}

export default LocalAIBridge;
```

### 2.5 Update Audio Bridge to Use Local AI

**Modify**: `backend/src/services/audioBridgeV2.js`

Replace Deepgram connection with LocalAIBridge:

```javascript
// Replace or modify the connectToDeepgram method
class AudioBridge extends EventEmitter {
  // ... existing code ...

  // Replace Deepgram with LocalAIBridge
  async connectToLocalAI() {
    this._logConnectionEvent(ConnectionEventType.LOCAL_AI_CONNECTING);
    
    this.localAIBridge = new LocalAIBridge({
      whisperBaseUrl: process.env.WHISPER_BASE_URL,
      ollamaBaseUrl: process.env.OLLAMA_BASE_URL,
      llmModel: process.env.OLLAMA_MODEL,
      voiceboxBaseUrl: process.env.VOICEBOX_BASE_URL,
      voiceboxProfileId: process.env.VOICEBOX_DEFAULT_PROFILE_ID
    });

    // Set up event listeners
    this.localAIBridge.on('transcript', (data) => {
      this.emit('transcript_update', data);
      this.transcript.push(data);
    });

    this.localAIBridge.on('llm_response', (data) => {
      this.emit('agent_thinking', data);
    });

    this.localAIBridge.on('tts_generated', (data) => {
      // Forward TTS audio to provider (SignalWire)
      this.forwardAudioToProvider(data.audio);
    });

    this.localAIBridge.on('qualification_extracted', (data) => {
      this.emit('qualification_extracted', data);
    });

    this.localAIBridge.on('call_end_requested', (data) => {
      this.emit('call_end_requested', data);
    });

    this.connectionState.localAI = true;
    this._logConnectionEvent(ConnectionEventType.LOCAL_AI_CONNECTED);
    this._updateBridgeState();
  }

  // New method to process audio through local AI
  async handleCallerAudioLocal(audioBuffer) {
    if (!this.localAIBridge) {
      throw new Error('Local AI not connected');
    }

    return await this.localAIBridge.processCallerAudio(
      audioBuffer,
      this.leadInfo,
      this.systemPrompt,
      this.qualifyingQuestions
    );
  }
}
```

### 2.6 Update Configuration Routes

**File**: `backend/src/routes/settings.js`

Add health checks for local services:

```javascript
// Add to GET /api/settings/health-check
router.get('/health-check', async (req, res) => {
  const checks = {
    ollama: false,
    voicebox: false,
    whisper: false,
    signalwire: false
  };

  // Check Ollama
  try {
    const ollamaResp = await fetch(`${process.env.OLLAMA_BASE_URL}/api/tags`);
    checks.ollama = ollamaResp.ok;
  } catch (e) {
    console.error('Ollama health check failed:', e);
  }

  // Check Voicebox
  try {
    const voiceboxResp = await fetch(`${process.env.VOICEBOX_BASE_URL}/profiles`);
    checks.voicebox = voiceboxResp.ok;
  } catch (e) {
    console.error('Voicebox health check failed:', e);
  }

  // Check Whisper
  if (process.env.WHISPER_BASE_URL) {
    try {
      const whisperResp = await fetch(`${process.env.WHISPER_BASE_URL}/health`);
      checks.whisper = whisperResp.ok;
    } catch (e) {
      console.error('Whisper health check failed:', e);
    }
  }

  // Check SignalWire (existing)
  if (process.env.SIGNALWIRE_API_KEY) {
    const signalwire = require('../integrations/signalwire-provider');
    checks.signalwire = await signalwire.healthCheck();
  }

  res.json({
    status: 'ok',
    checks,
    timestamp: new Date().toISOString()
  });
});
```

---

## Phase 3: Frontend Updates

### 3.1 Add Local AI Configuration UI

**File**: `frontend/src/pages/Settings.jsx`

Add new section for local AI configuration:

```jsx
// Add to Settings.jsx
<div className="space-y-6">
  <h3 className="text-lg font-semibold">Local AI Configuration</h3>
  
  {/* Ollama Configuration */}
  <div className="border rounded-lg p-4 space-y-4">
    <h4 className="font-medium">Ollama (LLM)</h4>
    <div className="space-y-2">
      <div>
        <label className="block text-sm font-medium">Base URL</label>
        <input
          type="text"
          value={settings.ollamaBaseUrl || 'http://localhost:11434'}
          onChange={(e) => updateSettings('ollamaBaseUrl', e.target.value)}
          className="w-full px-3 py-2 border rounded"
        />
      </div>
      <div>
        <label className="block text-sm font-medium">Model</label>
        <select
          value={settings.ollamaModel || 'phi4-mini:3.8b'}
          onChange={(e) => updateSettings('ollamaModel', e.target.value)}
          className="w-full px-3 py-2 border rounded"
        >
          <option value="phi4-mini:3.8b">phi4-mini:3.8b (Recommended)</option>
          <option value="llama3.2:3b">llama3.2:3b</option>
          <option value="ministral-3:8b">ministral-3:8b</option>
          <option value="qwen3:8b">qwen3:8b</option>
        </select>
      </div>
      <button
        onClick={() => testOllamaConnection()}
        className="bg-blue-500 text-white px-4 py-2 rounded"
      >
        Test Connection
      </button>
    </div>
  </div>

  {/* Voicebox Configuration */}
  <div className="border rounded-lg p-4 space-y-4">
    <h4 className="font-medium">Voicebox (TTS)</h4>
    <div className="space-y-2">
      <div>
        <label className="block text-sm font-medium">Base URL</label>
        <input
          type="text"
          value={settings.voiceboxBaseUrl || 'http://localhost:8000'}
          onChange={(e) => updateSettings('voiceboxBaseUrl', e.target.value)}
          className="w-full px-3 py-2 border rounded"
        />
      </div>
      <div>
        <label className="block text-sm font-medium">Default Voice Profile</label>
        <select
          value={settings.voiceboxProfileId}
          onChange={(e) => updateSettings('voiceboxProfileId', e.target.value)}
          className="w-full px-3 py-2 border rounded"
        >
          {voiceProfiles.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>
      <button
        onClick={() => testVoiceboxConnection()}
        className="bg-purple-500 text-white px-4 py-2 rounded"
      >
        Test Connection
      </button>
    </div>
  </div>

  {/* Whisper Configuration */}
  <div className="border rounded-lg p-4 space-y-4">
    <h4 className="font-medium">Whisper (STT)</h4>
    <div className="space-y-2">
      <div>
        <label className="block text-sm font-medium">Base URL</label>
        <input
          type="text"
          value={settings.whisperBaseUrl || 'http://localhost:8001'}
          onChange={(e) => updateSettings('whisperBaseUrl', e.target.value)}
          className="w-full px-3 py-2 border rounded"
        />
      </div>
      <div>
        <label className="block text-sm font-medium">Model</label>
        <select
          value={settings.whisperModel || 'base'}
          onChange={(e) => updateSettings('whisperModel', e.target.value)}
          className="w-full px-3 py-2 border rounded"
        >
          <option value="tiny">tiny (Fastest)</option>
          <option value="base">base (Recommended)</option>
          <option value="small">small (Better accuracy)</option>
        </select>
      </div>
      <button
        onClick={() => testWhisperConnection()}
        className="bg-green-500 text-white px-4 py-2 rounded"
      >
        Test Connection
      </button>
    </div>
  </div>

  {/* Health Check Button */}
  <button
    onClick={() => runAllHealthChecks()}
    className="w-full bg-gray-800 text-white px-4 py-3 rounded mt-6"
  >
    Check All Services
  </button>
</div>
```

### 3.2 Add Service Status Indicators

**File**: `frontend/src/pages/Settings.jsx`

Add to existing Integration Health section:

```jsx
{/* Add to existing health checks section */}
<div className="space-y-4">
  <h4 className="font-medium mb-3">Local AI Services</h4>
  
  <div className="grid grid-cols-3 gap-4">
    {/* Ollama */}
    <div className={`p-4 rounded border ${healthChecks.ollama ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'}`}>
      <div className="text-sm font-medium">Ollama</div>
      <div className="text-xs text-gray-600">{healthChecks.ollama ? 'Connected' : 'Disconnected'}</div>
    </div>

    {/* Voicebox */}
    <div className={`p-4 rounded border ${healthChecks.voicebox ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'}`}>
      <div className="text-sm font-medium">Voicebox</div>
      <div className="text-xs text-gray-600">{healthChecks.voicebox ? 'Connected' : 'Disconnected'}</div>
    </div>

    {/* Whisper */}
    <div className={`p-4 rounded border ${healthChecks.whisper ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'}`}>
      <div className="text-sm font-medium">Whisper</div>
      <div className="text-xs text-gray-600">{healthChecks.whisper ? 'Connected' : 'Disconnected'}</div>
    </div>
  </div>
</div>
```

---

## Phase 4: Testing

### 4.1 Unit Tests

Create test files for local services:

**File**: `backend/src/services/__tests__/localAIBridge.test.js`

```javascript
import LocalAIBridge from '../localAIBridge.js';

describe('LocalAIBridge', () => {
  let bridge;
  
  beforeEach(() => {
    bridge = new LocalAIBridge({
      whisperBaseUrl: 'http://mock-whisper',
      ollamaBaseUrl: 'http://mock-ollama',
      voiceboxBaseUrl: 'http://mock-voicebox'
    });
  });

  test('should transcribe audio and generate response', async () => {
    const mockAudio = Buffer.from('mock audio data');
    const response = await bridge.processCallerAudio(
      mockAudio,
      { firstName: 'John', propertyAddress: '123 Main St' },
      'Test prompt',
      [{ question: 'Are you interested in selling?', key: 'interest' }]
    );

    expect(response).toBeDefined();
  });

  test('should handle tool calls correctly', async () => {
    const mockLLMResponse = {
      tool_calls: [{
        name: 'extract_qualification_data',
        arguments: {
          qualification_status: 'Qualified',
          sentiment: 'Very Motivated'
        }
      }]
    };

    // Mock the LLM response
    jest.spyOn(bridge.llmService, 'generateWithTools').mockResolvedValue(mockLLMResponse);

    const extracted = await new Promise(resolve => {
      bridge.on('qualification_extracted', resolve);
    });

    expect(extracted).toBeDefined();
  });
});
```

### 4.2 Integration Tests

Create end-to-end test with real services:

```bash
# Test full local AI pipeline
cd backend
npm run test:integration-local-ai
```

---

## Phase 5: Railway Deployment

### 5.1 Update Railway Configuration

Ensure `railway.toml` has correct service definitions for local AI:

```toml
[build]
builder = "NIXPACKS"

[deploy]
startCommand = "npm start"
healthcheckPath = "/health"
healthcheckTimeout = 300

# Backend Service
[[services]]
name = "property-call-backend"
dockerfilePath = "backend/Dockerfile"
env = [
  "NODE_ENV=production",
  "OLLAMA_BASE_URL=http://localhost:11434",  # Or deploy Ollama to Railway too
  "VOICEBOX_BASE_URL=http://localhost:8000",   # Or deploy Voicebox to Railway
  "WHISPER_BASE_URL=http://localhost:8001"     # Or deploy Whisper to Railway
]

# Frontend Service  
[[services]]
name = "property-call-frontend"
dockerfilePath = "frontend/Dockerfile"
env = ["NODE_ENV=production"]
```

### 5.2 Deploy Local Services to Railway (Optional)

For full cloud deployment without local services:

1. **Deploy Ollama to Railway**
   - Create separate Railway service
   - Use GPU-based build for faster inference

2. **Deploy Whisper to Railway**
   - Use Docker image with Python dependencies
   - Configure for production audio throughput

3. **Keep Voicebox local**
   - Use Railway proxy or ngrok to expose Voicebox
   - Or deploy Voicebox to Railway (more complex)

### 5.3 Deploy to Railway

```bash
# Deploy both services
railway up

# Or deploy individually
railway up --service=property-call-backend
railway up --service=property-call-frontend

# View logs
railway logs

# View status
railway status
```

---

## Rollout Plan

### Week 1: Setup & Testing
- [ ] Install and configure Ollama
- [ ] Install and configure Voicebox
- [ ] Install and configure Whisper
- [ ] Implement LocalAIBridge service
- [ ] Update AudioBridgeV2 to use LocalAIBridge
- [ ] Create unit tests for local AI services

### Week 2: Integration
- [ ] Connect LocalAIBridge to call flow
- [ ] Add health checks to settings
- [ ] Add local AI configuration UI
- [ ] Test full end-to-end flow
- [ ] Implement voice profile management in Voicebox

### Week 3: Deployment
- [ ] Update Railway deployment configuration
- [ ] Deploy to Railway
- [ ] Configure production environment variables
- [ ] Test deployed services
- [ ] Monitor performance and optimize

---

## Success Criteria

- [x] All local AI services running and healthy
- [ ] Full call flow works with local STT/LLM/TTS
- [ ] Voice cloning works via Voicebox profiles
- [ ] Railway deployment successful
- [ ] Performance: < 1s latency per round-trip
- [ ] Zero API costs for AI processing
