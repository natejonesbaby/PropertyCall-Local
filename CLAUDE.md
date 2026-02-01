# AutoDialer Project Notes

## Node.js Version Requirement

**IMPORTANT: This project requires Node.js v20.x**

The project uses `better-sqlite3` which is compiled against Node 20. Before running any Node commands, always use:

```bash
source ~/.nvm/nvm.sh && nvm use 20
```

Or prefix commands with the nvm setup. Do NOT use the system default Node (v24) as it will cause native module errors.

## Project Structure

- `backend/` - Express.js API server (port 3000)
- `frontend/` - Vite + React frontend (port 5173)

## Starting the Servers

```bash
# Backend
source ~/.nvm/nvm.sh && nvm use 20 && cd backend && node src/index.js

# Frontend
cd frontend && npx vite --host
```

## Key Technologies

- SignalWire for telephony (outbound calls, WebSocket audio streaming)
- Deepgram Voice Agent API for AI voice conversations
- SQLite (better-sqlite3) for database
- WebSocket for real-time audio bridging between SignalWire and Deepgram

## Cloud Deployment (Railway)

The backend is configured for Railway deployment to reduce latency (vs running through ngrok).

### Deploy to Railway

1. Install Railway CLI: `npm install -g @railway/cli`
2. Login: `railway login`
3. From backend directory:
   ```bash
   cd backend
   railway init
   railway volume add autodialer_data  # For SQLite persistence
   railway up
   ```

4. Set environment variables in Railway dashboard:
   - `NODE_ENV=production`
   - `JWT_SECRET=<generate-secure-secret>`
   - `ENCRYPTION_KEY=<generate-secure-secret>`
   - `WEBHOOK_BASE_URL=<your-railway-url>`

5. Update SignalWire webhooks to point to Railway URL

### Required Environment Variables (Production)

```
NODE_ENV=production
PORT=3000
JWT_SECRET=<secure-random-string>
ENCRYPTION_KEY=<secure-random-string>
WEBHOOK_BASE_URL=https://<your-app>.railway.app
```

API keys (Deepgram, SignalWire, etc.) are stored encrypted in the database per-user.

## Versioning & Auto-Deploy

The app uses semantic versioning and auto-deploys to Railway when versions differ.

### Version Location
- **Backend version**: `backend/package.json` → `"version": "x.y.z"`
- **Version endpoint**: `GET /api/version` returns `{"version": "x.y.z"}`

### Versioning Scheme (Semantic Versioning)
- **MAJOR (x.0.0)**: Breaking changes, database migrations, API changes
- **MINOR (0.x.0)**: New features, non-breaking additions
- **PATCH (0.0.x)**: Bug fixes, small improvements

### How Auto-Deploy Works
1. The `.app` launcher compares local version (`backend/package.json`) with deployed version (`/api/version`)
2. If versions differ, it automatically runs `railway up` to deploy
3. A notification shows deployment progress and completion

### To Deploy Backend Changes
1. Make your code changes
2. Bump version in `backend/package.json`:
   - Bug fix: `1.1.0` → `1.1.1`
   - New feature: `1.1.0` → `1.2.0`
   - Breaking change: `1.1.0` → `2.0.0`
3. Launch the app (auto-deploys) or run manually:
   ```bash
   cd backend && railway up
   ```

### Manual Deploy
```bash
cd backend
railway up
```

Or use the launcher with flag:
```bash
"/path/to/Property Call.app/Contents/MacOS/launcher" --deploy
```
