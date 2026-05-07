# Conversation Storage System

This document describes how conversations are stored in the database and S3.

## Overview

Every voice conversation is automatically:
1. **Transcribed** and stored in PostgreSQL (text format)
2. **Recorded** and uploaded to S3 (audio format)
3. **Analyzed** with metadata (score, intent, emotion, etc.)

## Database Schema

### Call Table

```sql
model Call {
  id             String    @id @default(cuid())
  leadId         String
  lead           Lead      @relation(fields: [leadId], references: [id])
  transcript     Json      // Array of TranscriptMessage
  summary        Json?     // CallSummary object
  score          Int       @default(0)
  scoreBreakdown Json?
  duration       Int?      // seconds
  language       String?
  recordingUrl   String?   // S3 object key
  recordingSize  Int?      // bytes
  startedAt      DateTime  @default(now())
  endedAt        DateTime?
}
```

### Transcript Format

Each message in the transcript array:

```typescript
{
  role: 'user' | 'assistant',
  content: string,
  timestamp: number,
  language?: string,
  intent?: string,
  emotion?: string,
  score?: number
}
```

### Summary Format

Call summary object:

```typescript
{
  total_turns: number,
  final_score: number,
  engagement_level: 'high' | 'medium' | 'low',
  handoff_occurred: boolean,
  handoff_reason?: string,
  end_reason?: string,
  detected_intents: string[],
  objections_count: number,
  duration_seconds: number
}
```

## Storage Flow

### 1. Call Start

```typescript
// Create call record in database
await createCallRecord(lead_id, conversation_id, language);
```

Creates:
- Call record with empty transcript
- Links to Lead record (creates if doesn't exist)
- Sets startedAt timestamp

### 2. During Conversation

**Every user message:**
```typescript
await appendTranscriptMessage(conversation_id, {
  role: 'user',
  content: transcript,
  timestamp: Date.now()
});
```

**Every assistant response:**
```typescript
await appendTranscriptMessage(conversation_id, {
  role: 'assistant',
  content: response,
  timestamp: Date.now(),
  language: detected_language,
  intent: intent,
  emotion: emotion,
  score: current_score
});
```

**After each turn:**
```typescript
await updateCallMetadata(conversation_id, state);
```

Updates:
- Current score
- Detected language

### 3. Audio Recording

**During call:**
- Every audio chunk from client is stored in memory
- Chunks are concatenated into a single buffer

**On call end:**
```typescript
const fullRecording = Buffer.concat(audioChunks);
await uploadCallAudio(conversation_id, fullRecording, 'audio/webm');
```

Uploads to S3:
- Path: `recordings/{conversation_id}/{conversation_id}.webm`
- Metadata: callId
- Updates Call record with S3 key and file size

### 4. Call End

```typescript
await finalizeCallRecord(conversation_id, state, startTime);
await updateLeadFromConversation(lead_id, state);
```

Finalizes:
- Call summary with statistics
- Final score and duration
- endedAt timestamp
- Lead status (HOT/WARM/COLD based on engagement)

## API Endpoints

### Get Conversation

```http
GET /api/conversations/:conversationId
```

Response:
```json
{
  "conversation_id": "clx...",
  "lead": {
    "id": "clx...",
    "name": "Rajesh Kumar",
    "phone": "+91...",
    "status": "HOT"
  },
  "transcript": [
    {
      "role": "assistant",
      "content": "Great—this is from Rupeezy...",
      "timestamp": 1234567890,
      "language": "hinglish",
      "score": 0
    },
    {
      "role": "user",
      "content": "Tell me more about earnings",
      "timestamp": 1234567895
    }
  ],
  "summary": {
    "total_turns": 5,
    "final_score": 45,
    "engagement_level": "high",
    "handoff_occurred": true,
    "handoff_reason": "high_interest_handoff",
    "detected_intents": ["query_earnings", "positive_interest"],
    "objections_count": 0,
    "duration_seconds": 180
  },
  "score": 45,
  "duration": 180,
  "language": "hinglish",
  "recording_url": "https://s3.amazonaws.com/...",
  "recording_size": 1048576,
  "started_at": "2024-01-01T10:00:00Z",
  "ended_at": "2024-01-01T10:03:00Z"
}
```

### Get Lead Conversations

```http
GET /api/conversations/lead/:leadId
```

Response:
```json
{
  "lead_id": "clx...",
  "total_calls": 3,
  "calls": [
    {
      "conversation_id": "clx...",
      "score": 45,
      "duration": 180,
      "language": "hinglish",
      "summary": { ... },
      "started_at": "2024-01-01T10:00:00Z",
      "ended_at": "2024-01-01T10:03:00Z"
    }
  ]
}
```

### Get Recording URL

```http
GET /api/conversations/:conversationId/recording
```

Response:
```json
{
  "conversation_id": "clx...",
  "recording_url": "https://s3.amazonaws.com/...",
  "recording_size": 1048576,
  "expires_in": 3600
}
```

## S3 Structure

```
bucket-name/
└── recordings/
    └── {conversation_id}/
        └── {conversation_id}.webm
```

### Recording Format

- **Format**: WebM with Opus codec
- **Source**: Browser MediaRecorder API
- **Chunks**: Concatenated from 100ms chunks
- **Size**: Typically 50-200 KB per minute

### Signed URLs

- Generated on-demand via API
- Valid for 1 hour
- No public access to recordings

## Storage Functions

### Core Functions

```typescript
// Create new call record
createCallRecord(leadId, conversationId, language)

// Append message to transcript
appendTranscriptMessage(conversationId, message)

// Update call metadata
updateCallMetadata(conversationId, state)

// Finalize call with summary
finalizeCallRecord(conversationId, state, startTime)

// Upload audio to S3
uploadCallAudio(conversationId, audioBuffer, mimeType)

// Update lead from conversation
updateLeadFromConversation(leadId, state)

// Retrieve call record
getCallRecord(conversationId)

// Get all calls for a lead
getLeadCalls(leadId)
```

## Error Handling

All storage functions use try-catch and log errors without throwing:

```typescript
try {
  await appendTranscriptMessage(...);
} catch (error) {
  console.error('[Storage] Error:', error);
  // Don't throw - conversation continues
}
```

This ensures:
- Storage failures don't break conversation flow
- Errors are logged for debugging
- Graceful degradation

## Performance

### Database

- **Transcript append**: ~10-20ms (JSON update)
- **Metadata update**: ~5-10ms (simple update)
- **Finalize call**: ~20-30ms (summary calculation + update)

### S3

- **Upload**: ~100-500ms (depends on file size and network)
- **Signed URL**: ~5-10ms (local operation)

### Optimization

- Transcript stored as JSON array (efficient append)
- Audio chunks buffered in memory (single upload)
- Async operations don't block conversation
- Prisma connection pooling

## Monitoring

### Key Metrics

- Total calls per day
- Average call duration
- Average score per call
- Handoff rate
- Storage size (DB + S3)

### Queries

```sql
-- Calls today
SELECT COUNT(*) FROM "Call" 
WHERE "startedAt" >= CURRENT_DATE;

-- Average score
SELECT AVG(score) FROM "Call" 
WHERE "endedAt" IS NOT NULL;

-- Handoff rate
SELECT 
  COUNT(CASE WHEN summary->>'handoff_occurred' = 'true' THEN 1 END)::float / COUNT(*) * 100 
FROM "Call";

-- Storage size
SELECT 
  SUM("recordingSize") / 1024 / 1024 as total_mb 
FROM "Call";
```

## Backup & Retention

### Database

- Automatic backups via PostgreSQL
- Point-in-time recovery
- Retention: 30 days

### S3

- Versioning enabled
- Lifecycle policy: Archive to Glacier after 90 days
- Retention: 1 year

## Privacy & Compliance

### Data Protection

- Recordings encrypted at rest (S3)
- Database encrypted (PostgreSQL)
- Signed URLs expire after 1 hour
- No public access to recordings

### GDPR Compliance

- Right to access: API endpoints
- Right to deletion: Soft delete + S3 cleanup
- Data portability: JSON export

### Retention Policy

- Active calls: Indefinite
- Completed calls: 1 year
- Deleted leads: 30 days grace period

## Troubleshooting

### Missing Transcript

Check:
1. Call record exists: `getCallRecord(conversationId)`
2. Transcript array not empty
3. appendTranscriptMessage errors in logs

### Missing Recording

Check:
1. recordingUrl field populated
2. S3 bucket accessible
3. Audio chunks collected during call
4. uploadCallAudio errors in logs

### Incorrect Summary

Check:
1. finalizeCallRecord called
2. State passed correctly
3. Summary calculation logic
4. JSON serialization

## Future Enhancements

- [ ] Real-time transcript streaming
- [ ] Audio transcription from recording (backup)
- [ ] Conversation search (full-text)
- [ ] Analytics dashboard
- [ ] Export to CSV/PDF
- [ ] Webhook notifications
- [ ] Multi-language transcription
- [ ] Speaker diarization
- [ ] Sentiment analysis timeline
- [ ] Conversation replay UI
