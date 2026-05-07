# RM Dashboard Setup Guide

## Quick Start

### 1. Start the Backend Server

```bash
cd apps/backend
npm run dev
```

The backend should start on `http://localhost:4000`

You should see:
```
🚀 Rupeezy Backend running on http://localhost:4000
🔌 WebSocket server listening on ws://localhost:4000/ws/voice
🔌 LangGraph pipeline on ws://localhost:4000/ws/voice-pipeline
```

### 2. Start the Dashboard

In a new terminal:

```bash
cd apps/rm-dashboard
npm run dev
```

The dashboard should start on `http://localhost:3000`

### 3. Verify Connection

Open `http://localhost:3000` in your browser. You should see:
- Dashboard loading states (skeleton loaders)
- Then real data from the backend
- If you see "Failed to fetch" errors, the backend isn't running

## Troubleshooting

### "Failed to fetch" Errors

**Problem**: Dashboard shows "Failed to fetch" errors in browser console

**Solution**: 
1. Make sure backend is running on port 4000
2. Check backend terminal for errors
3. Verify CORS is allowing localhost:3000
4. Test backend health: `curl http://localhost:4000/health`

### Backend Won't Start

**Problem**: Backend crashes or won't start

**Common Issues**:

1. **Missing Dependencies**
   ```bash
   cd apps/backend
   npm install
   ```

2. **Database Not Set Up**
   ```bash
   cd apps/backend
   npx prisma generate
   npx prisma migrate dev
   ```

3. **Missing Environment Variables**
   
   Create `apps/backend/.env` with:
   ```env
   DATABASE_URL="postgresql://user:password@localhost:5432/rupeezy"
   REDIS_URL="redis://localhost:6379"
   DEEPGRAM_API_KEY="your-key"
   OPENAI_API_KEY="your-key"
   SARVAM_API_KEY="your-key"
   PINECONE_API_KEY="your-key"
   AWS_ACCESS_KEY_ID="your-key"
   AWS_SECRET_ACCESS_KEY="your-key"
   AWS_REGION="ap-south-1"
   S3_BUCKET_NAME="your-bucket"
   ```

4. **Port Already in Use**
   
   Change port in `apps/backend/.env`:
   ```env
   PORT=4001
   ```
   
   Then update dashboard `.env.local`:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:4001
   ```

### Dashboard Won't Start

**Problem**: Dashboard crashes or won't start

**Solution**:
```bash
cd apps/rm-dashboard
npm install
npm run dev
```

### No Data Showing

**Problem**: Dashboard loads but shows "No leads found" or empty states

**Solution**: Add test data via the dashboard:
1. Click "Add Lead" button
2. Fill in phone number (required)
3. Add optional details
4. Submit

Or use the backend API directly:
```bash
curl -X POST http://localhost:4000/api/rm/leads \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+91 9876543210",
    "name": "Test Lead",
    "language": "hinglish",
    "occupation": "MFD"
  }'
```

## Testing the Integration

### 1. Test Backend Health

```bash
curl http://localhost:4000/health
```

Expected response:
```json
{"status":"ok","timestamp":"2024-..."}
```

### 2. Test Analytics Endpoint

```bash
curl http://localhost:4000/api/rm/analytics
```

Expected response:
```json
{
  "leadCounts": {"HOT": 0, "WARM": 0, "COLD": 0},
  "avgScoreByStatus": {},
  "calls": {"total": 0, "today": 0, "avgDuration": 0}
}
```

### 3. Test Leads Endpoint

```bash
curl http://localhost:4000/api/rm/leads
```

Expected response:
```json
{
  "leads": [],
  "total": 0,
  "page": 1,
  "limit": 20,
  "totalPages": 0
}
```

### 4. Create a Test Lead

```bash
curl -X POST http://localhost:4000/api/rm/leads \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+91 9876543210",
    "name": "Rajesh Kumar",
    "language": "hinglish",
    "occupation": "MFD",
    "background": "Financial services, 5 years experience"
  }'
```

Expected response:
```json
{
  "id": "...",
  "phone": "+91 9876543210",
  "status": "COLD"
}
```

## Development Workflow

### Making Changes

1. **Backend Changes**: Server auto-restarts with nodemon
2. **Dashboard Changes**: Hot reload with Next.js Fast Refresh

### Adding New Leads

Use the dashboard UI:
1. Click "Add Lead" button
2. Fill in the form
3. Submit
4. Lead appears in the table immediately

### Viewing Lead Details

1. Click on any lead in the table
2. View full profile and conversation history
3. Use back button to return to dashboard

### Filtering Leads

Use the tabs:
- **All**: Shows all leads
- **Hot**: Score >= 50, high engagement
- **Warm**: Score 20-49, medium engagement  
- **Cold**: Score < 20, low engagement

## API Endpoints Reference

### Analytics
- `GET /api/rm/analytics` - Dashboard statistics

### Leads
- `GET /api/rm/leads?status=HOT&page=1&limit=20` - List leads
- `GET /api/rm/leads/:id` - Get lead details
- `POST /api/rm/leads` - Create lead
- `POST /api/rm/leads/upload` - Bulk upload

### Conversations
- `GET /api/conversations/lead/:leadId` - Lead conversations
- `GET /api/conversations/:conversationId` - Conversation details
- `GET /api/conversations/:conversationId/recording` - Recording URL

## Common Issues

### CORS Errors

If you see CORS errors in browser console:

1. Check backend CORS config in `apps/backend/src/index.ts`
2. Ensure `http://localhost:3000` is in allowed origins
3. Restart backend after changes

### TypeScript Errors

If you see TypeScript errors:

```bash
# Backend
cd apps/backend
npm run build

# Dashboard
cd apps/rm-dashboard
npm run build
```

### Database Errors

If you see Prisma/database errors:

```bash
cd apps/backend
npx prisma generate
npx prisma migrate dev
npx prisma db push
```

## Next Steps

Once everything is running:

1. ✅ Add test leads via the dashboard
2. ✅ Test the voice pipeline with test UI
3. ✅ Make test calls to generate conversation data
4. ✅ View conversations in the dashboard
5. ✅ Monitor lead engagement scores

## Support

If you encounter issues not covered here:

1. Check backend terminal for error logs
2. Check browser console for frontend errors
3. Verify all environment variables are set
4. Ensure PostgreSQL and Redis are running
5. Test API endpoints with curl/Postman
