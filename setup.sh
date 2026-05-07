#!/bin/bash
set -e

echo "🚀 Setting up AI for Bharat project..."

# 1. Start Redis via Docker
echo "▶ Starting Redis..."
docker compose up -d redis
echo "✅ Redis running on localhost:6379"

# 2. Install backend deps
echo "▶ Installing backend dependencies..."
cd apps/backend
npm install

# 3. Generate Prisma client & push schema
echo "▶ Syncing database schema..."
npx prisma generate
npx prisma db push
cd ../..

# 4. Install scraper deps
echo "▶ Installing scraper dependencies..."
cd scraper
npm install
cd ..

echo ""
echo "✅ Setup complete! Start the backend:"
echo "   cd apps/backend && npm run dev"
