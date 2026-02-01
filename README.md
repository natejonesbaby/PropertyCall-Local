# Property Call

An automated lead qualification system for real estate investors. Import leads from Kind Skiptracing (XLSX), push them to Follow-up Boss (CRM), then use an AI voice agent to call and qualify leads automatically.

## Overview

Property Call automates the lead qualification process by:

1. **Importing Leads**: Upload XLSX files from Kind Skiptracing
2. **CRM Integration**: Push leads to Follow-up Boss with full field mapping
3. **AI Voice Calls**: Deepgram Voice Agent conducts qualifying conversations
4. **Data Extraction**: Automatically capture qualification status, sentiment, and callback scheduling
5. **Results Sync**: Post call recordings, transcripts, and extracted data back to Follow-up Boss

## Tech Stack

- **Frontend**: React with Tailwind CSS
- **Backend**: Node.js with Express
- **Database**: SQLite
- **Telephony**: Telnyx Voice API
- **Voice AI**: Deepgram Voice Agent API (STT, TTS, LLM orchestration)
- **CRM**: Follow-up Boss API
- **Real-time**: WebSocket for audio streaming and live monitoring

## Prerequisites

- Node.js 18+
- Telnyx account with API key and phone number
- Deepgram account with API key
- Follow-up Boss account with API key
- OpenAI API key (for LLM in Deepgram Voice Agent)

## Quick Start

1. **Clone and Setup**
   ```bash
   ./init.sh
   ```

2. **Configure API Keys**

   Edit `backend/.env` with your API credentials:
   ```
   TELNYX_API_KEY=your_telnyx_key
   TELNYX_PHONE_NUMBER=+1234567890
   DEEPGRAM_API_KEY=your_deepgram_key
   FUB_API_KEY=your_followup_boss_key
   OPENAI_API_KEY=your_openai_key
   ```

3. **Start Development Servers**
   ```bash
   # Backend
   npm run dev --prefix backend

   # Frontend (in another terminal)
   npm run dev --prefix frontend
   ```

4. **Access the Application**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3000

## Project Structure

```
property-call/
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
│   │   │   ├── telnyx/    # Telnyx telephony
│   │   │   ├── deepgram/  # Deepgram voice agent
│   │   │   └── fub/       # Follow-up Boss CRM
│   │   ├── db/            # Database setup and models
│   │   ├── middleware/    # Express middleware
│   │   ├── websocket/     # WebSocket handlers
│   │   └── utils/         # Utility functions
│   └── package.json
│
├── init.sh                 # Environment setup script
├── README.md               # This file
└── features.db             # Feature tracking database
```

## Features

### Lead Management
- Upload XLSX files from Kind Skiptracing
- Preview and validate imported data
- Duplicate detection against FUB contacts
- Field mapping configuration

### AI Voice Agent
- Configurable system prompts and greetings
- Qualifying question sequences
- Disqualifying trigger detection
- Callback scheduling
- Voicemail script handling

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

## Configuration

### AI Prompts
Configure through the Configuration page:
- System prompt for conversation behavior
- Greeting message (with dynamic fields)
- Goodbye script
- Voicemail script

### Qualifying Questions
Add/edit/remove/reorder questions that the AI asks leads.

### Disqualifying Triggers
Set phrases that end calls gracefully (e.g., "not interested", "already sold").

### Retry Settings
- Number of attempts (default: 3)
- Retry intervals
- Time-of-day restrictions (default: 9am-7pm in lead's timezone)

## Development

### Running Tests
```bash
npm test --prefix backend
npm test --prefix frontend
```

### Building for Production
```bash
npm run build --prefix frontend
npm run build --prefix backend
```

## Security

- All API keys encrypted at rest
- Session-based authentication with 24-hour expiration
- Password confirmation required for sensitive operations
- User data isolation enforced at API level

## License

Proprietary - All rights reserved
