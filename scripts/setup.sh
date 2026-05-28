#!/bin/bash

# PhysiProof: Project Setup Script
# This script automates dependency installation, database migration, and environment verification.

set -e

echo "--------------------------------------------------"
echo "🚀 PhysiProof: Initializing Environment..."
echo "--------------------------------------------------"

# 1. Install dependencies
echo "📦 Installing workspace dependencies..."
npm install

# 2. Database Migration (Local D1)
echo "🗄️ Applying D1 migrations to local database..."
cd packages/backend
npx wrangler d1 migrations apply DB --local --yes
cd ../..

# 3. Environment Variable Check
echo "🔍 Checking environment variables..."
if [ -f "packages/backend/wrangler.toml" ]; then
    if grep -q "GEMINI_API_KEY" packages/backend/wrangler.toml; then
        echo "✅ GEMINI_API_KEY found in wrangler.toml"
    else
        echo "⚠️  Warning: GEMINI_API_KEY is missing. AI features will operate in Fallback mode."
    fi
else
    echo "⚠️  Warning: packages/backend/wrangler.toml not found."
fi

echo "--------------------------------------------------"
echo "✨ Setup Complete!"
echo "To start development:"
echo "  Terminal 1: npm run dev:backend"
echo "  Terminal 2: npm run dev:frontend"
echo "--------------------------------------------------"
