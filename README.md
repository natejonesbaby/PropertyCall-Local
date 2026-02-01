# Property Call (Local AI Stack)

An automated lead qualification system for real estate investors with **fully local AI infrastructure**.

## Overview

Property Call automates the lead qualification process by:

1. **Importing Leads**: Upload XLSX files from Kind Skiptracing
2. **CRM Integration**: Push leads to Follow-up Boss with full field mapping
3. **AI Voice Calls**: Conducts qualifying conversations with local STT, LLM, and TTS
4. **Data Extraction**: Automatically capture qualification status, sentiment, and callback scheduling
5. **Results Sync**: Post call recordings, transcripts, and extracted data back to Follow-up Boss

## Local AI Stack

| Component | Technology | Why |
|-----------|-----------|------|
| **STT** | Whisper (MLX) | Fast speech-to-text on Apple Silicon |
| **LLM** | Ollama (phi4-mini:3.8b) | Local LLM with function calling |
| **TTS** | Voicebox (Qwen3-TTS) | Voice cloning via REST API |
| **Telephony** | SignalWire | Real-time audio streaming |

## Tech Stack

- **Frontend**: React with Tailwind CSS
- **Backend**: Node.js with Express
- **Database**: SQLite
- **Telephony**: SignalWire Voice API
- **Voice AI**:
  - STT: Whisper (via MLX on Apple Silicon)
  - LLM: Ollama (phi4-mini:3.8b)
  - TTS: Voicebox (http://localhost:8000)
- **Real-time**: WebSocket for audio streaming and live monitoring

## Prerequisites

### Local Services
- **Ollama** running locally (http://localhost:11434)
- **Voicebox** running locally (http://localhost:8000)
- **Whisper** installed locally (via MLX)

### External Services
- SignalWire account with API key and phone number
- Follow-up Boss account with API key

## Quick Start

### 1. Start Local Services

```bash
# Start Ollama
ollama serve

# Start Voicebox
open /Applications/Voicebox.app

# Verify services
curl http://localhost:11434/api/generate -d '{"model":"phi4-mini:3.8b","prompt":"test","stream":false}'
curl http://localhost:8000/profiles
```

### 2. Clone and Setup

```bash
git clone https://github.com/natejonesbaby/PropertyCall-Local.git
cd PropertyCall-Local

# Backend setup
cd backend
npm install
cp .env.example .env
# Edit .env with your API keys
npm run dev

# Frontend setup (in another terminal)
cd frontend
npm install
npm run dev
```

### 3. Access the Application
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000
- Ollama: http://localhost:11434
- Voicebox: http://localhost:8000

## Project Structure

```
property-call-local/
├── frontend/               # React frontend
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   ├── pages/         # Page components
│   │   ├── hooks/         # Custom React hooks
│   │   ├── context/       # React context providers
│   │   ├── services/      # API client services
│   │   └── utils/         # Utility functions
│   └── package.json
│
├── backend/                # Express backend
│   ├── src/
│   │   ├── routes/        # API route handlers
│   │   ├── services/      # Business logic
│   │   ├── integrations/  # External API integrations
│   │   │   ├── signalwire/ # SignalWire telephony
│   │   ├── ollama/     # Ollama LLM
│   │   ├── whisper/     # Whisper STT
│   │   └── voicebox/   # Voicebox TTS
│   ├── db/            # Database setup and models
│   ├── middleware/    # Express middleware
│   ├── websocket/     # WebSocket handlers
│   └── utils/         # Utility functions
│   └── package.json
│
├── railway.toml           # Railway deployment config
├── README.md              # This file
└── .gitignore
```

## Features

### Lead Management
- Upload XLSX files from Kind Skiptracing
- Preview and validate imported data
- Duplicate detection against FUB contacts
- Field mapping configuration

### AI Voice Agent (Local)
- Configurable system prompts and greetings
- Qualifying question sequences
- Disqualifying trigger detection
- Callback scheduling
- Voicemail script handling
- **100% local** — no API costs for AI processing

### Call Management
- Call queue with retry logic
- Phone number rotation (Mobile 1-7, Landlines)
- Time-of-day restrictions with timezone support
- Answering Machine Detection (AMD)

### Live Monitoring
- Real-time call status display
- Listen-in to active calls
- Live transcript viewing

### Call History
- Filterable call logs
- Recording playback
- Transcript viewing
- CSV export

### Dashboard
- Overview statistics
- Outcome distribution charts
- Qualified leads tracking
- Pending callbacks

## API Endpoints

See `app_spec.txt` for complete API documentation.

## Local AI Integration

### Whisper (STT)
```bash
# Transcribe audio
curl -X POST http://localhost:8001/transcribe \
  -F "audio=@caller_audio.wav" \
  -F "model=base"
```

### Ollama (LLM)
```bash
# Generate response
curl http://localhost:11434/api/generate \
  -d '{
    "model": "phi4-mini:3.8b",
    "prompt": "User said: hello",
    "stream": false
  }'
```

### Voicebox (TTS)
```bash
# Generate speech
curl -X POST http://localhost:8000/generate \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello world",
    "profile_id": "abc123"
  }'
```

## Development

```bash
# Backend tests
npm test --prefix backend

# Frontend tests
npm test --prefix frontend

# Build for production
npm run build --prefix frontend
npm run build --prefix backend
```

## Deployment

### Railway

The project is configured for Railway deployment via `railway.toml`.

**Services:**
- `property-call-backend` — Node.js Express API
- `property-call-frontend` — React Vite frontend

**Deploy:**
```bash
railway up
```

**Environment Variables Required:**
- `SIGNALWIRE_API_KEY` — SignalWire API key
- `SIGNALWIRE_PHONE_NUMBER` — Your SignalWire phone number
- `FUB_API_KEY` — Follow-up Boss API key
- `OLLAMA_BASE_URL` — Ollama endpoint (default: http://localhost:11434)
- `VOICEBOX_BASE_URL` — Voicebox endpoint (default: http://localhost:8000)

## Migration from Deepgram

This fork replaces Deepgram with a fully local stack:

| Component | Old | New |
|-----------|------|------|
| STT | Deepgram Nova-2 | Whisper (MLX) |
| LLM | OpenAI GPT-4o-mini | Ollama (phi4-mini:3.8b) |
| TTS | Deepgram Aura-2 | Voicebox (Qwen3-TTS) |

**Benefits:**
- Zero API costs for AI processing
- Full data privacy — nothing leaves your machine
- No rate limits
- Custom voice cloning via Voicebox
- Faster inference on Apple Silicon

## License

Proprietary - All rights reserved

## Support

For issues or questions, please open an issue on GitHub.
