#!/bin/bash

# Property Call - Automated Lead Qualification System
# Environment setup script

set -e

echo "======================================"
echo "Property Call - Environment Setup"
echo "======================================"
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed."
    echo "Please install Node.js 18+ from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "ERROR: Node.js 18+ is required. Found version $(node -v)"
    exit 1
fi

echo "Node.js version: $(node -v)"
echo "npm version: $(npm -v)"
echo ""

# Project root directory
PROJECT_ROOT="$(dirname "$0")"

# Backend setup
echo "Setting up backend..."
if [ -d "$PROJECT_ROOT/backend" ]; then
    echo "Installing backend dependencies..."
    npm install --prefix "$PROJECT_ROOT/backend"
else
    echo "Backend directory not found. Skipping..."
fi

# Frontend setup
echo ""
echo "Setting up frontend..."
if [ -d "$PROJECT_ROOT/frontend" ]; then
    echo "Installing frontend dependencies..."
    npm install --prefix "$PROJECT_ROOT/frontend"
else
    echo "Frontend directory not found. Skipping..."
fi

# Create .env file from example if it doesn't exist
if [ -f "$PROJECT_ROOT/backend/.env.example" ] && [ ! -f "$PROJECT_ROOT/backend/.env" ]; then
    echo ""
    echo "Creating .env file from .env.example..."
    cp "$PROJECT_ROOT/backend/.env.example" "$PROJECT_ROOT/backend/.env"
    echo "IMPORTANT: Please edit backend/.env with your actual API keys:"
    echo "  - TELNYX_API_KEY"
    echo "  - DEEPGRAM_API_KEY"
    echo "  - FUB_API_KEY"
    echo "  - OPENAI_API_KEY"
fi

# Initialize SQLite database
echo ""
echo "Checking database..."
if [ -f "$PROJECT_ROOT/backend/src/db/setup.js" ]; then
    echo "Running database setup..."
    node "$PROJECT_ROOT/backend/src/db/setup.js"
fi

echo ""
echo "======================================"
echo "Setup complete!"
echo "======================================"
echo ""
echo "To start the development servers:"
echo ""
echo "  Backend:  npm run dev --prefix backend"
echo "  Frontend: npm run dev --prefix frontend"
echo ""
echo "Or start both with:"
echo "  npm run dev"
echo ""
echo "The application will be available at:"
echo "  Frontend: http://localhost:5173"
echo "  Backend:  http://localhost:3000"
echo ""
echo "Required API Keys (configure in backend/.env):"
echo "  - TELNYX_API_KEY    - For telephony/calling"
echo "  - DEEPGRAM_API_KEY  - For voice AI agent"
echo "  - FUB_API_KEY       - For Follow-up Boss CRM"
echo "  - OPENAI_API_KEY    - For LLM in voice agent"
echo ""
