#!/bin/bash
# Fix Node.js version for PropertyCall
# This script switches to Node 20 and rebuilds native modules

set -e

echo "=== PropertyCall Node.js Fix ==="
echo

# Load nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Check current version
echo "Current Node version: $(node --version)"

# Switch to Node 20 (reads from .nvmrc)
echo "Switching to Node 20..."
nvm use

echo "New Node version: $(node --version)"
echo

# Rebuild native modules in backend
echo "Rebuilding native modules in backend..."
cd "$(dirname "$0")/backend"
npm rebuild

echo
echo "=== Fix complete! ==="
echo
echo "To verify, run:"
echo "  cd backend && npm run dev"
