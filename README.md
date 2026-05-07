# Rupeezy AI Voice Agent

An AI voice agent system for qualifying Rupeezy partner leads. The system lets an RM add leads, start/test AI voice conversations, store every call separately, and review transcripts, summaries, scores, and recordings from the dashboard.

For a deeper system-design view, see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Table of Contents

1. [What This Project Contains](#what-this-project-contains)
2. [How The System Works](#how-the-system-works)
3. [System Design](#system-design)
4. [Repository Structure](#repository-structure)
5. [Prerequisites](#prerequisites)
6. [Environment Variables](#environment-variables)
7. [First-Time Setup](#first-time-setup)
8. [How To Open The App](#how-to-open-the-app)
9. [How To Use The Dashboard](#how-to-use-the-dashboard)
10. [How To Test Voice Calls](#how-to-test-voice-calls)
11. [Important Backend APIs](#important-backend-apis)
12. [Voice Pipeline Internals](#voice-pipeline-internals)
13. [Database And Storage](#database-and-storage)
14. [Multiple Calls Per Lead](#multiple-calls-per-lead)
15. [Recording Chunks](#recording-chunks)
16. [Previous Call Memory](#previous-call-memory)
17. [TTS Behavior](#tts-behavior)
18. [Common Commands](#common-commands)
19. [Troubleshooting](#troubleshooting)
20. [Where To Change Things](#where-to-change-things)

## What This Project Contains

This repository has two main apps:

```text
apps/backend       Express + WebSocket + Prisma backend
apps/rm-dashboard  Next.js RM dashboard
```

The backend handles:

- Lead CRUD and analytics APIs.
- Voice WebSocket server.
- Deepgram speech-to-text.
- LLM-based conversation generation.
- LangGraph-style conversation state.
- Sarvam text-to-speech.
- Call transcripts.
- Call summaries.
- Lead scoring.
- S3 recording uploads.
- Redis live-call memory.

The dashboard handles:

- Lead list.
- Lead detail.
- Call history.
- Call summary display.
- Transcript display.
- Recording playback.
- Basic analytics.

## How The System Works

At a high level:

```text
RM Dashboard
  -> Backend REST APIs
  -> PostgreSQL data
  -> S3 recording URLs

Voice Test Page / Voice Client
  -> Backend WebSocket
  -> Deepgram STT
  -> Conversation Pipeline
  -> LLM response
  -> Sarvam TTS
  -> Audio back to client
  -> Transcript + summary + recordings saved
```

Voice call flow:

1. A call starts for a lead.
2. Backend creates a new `Call` row.
3. If this lead had a previous completed call, backend loads compact previous-call context.
4. Agent says a greeting.
5. Browser sends mic audio chunks.
6. Deepgram converts audio to text.
7. Conversation pipeline classifies intent, emotion, objections, and stage.
8. LLM generates Priya's next response.
9. Sarvam converts the response to audio.
10. Backend stores transcript messages.
11. Backend stores user and agent audio chunks in S3 in sequence.
12. At call end, backend generates summary and updates lead score/status.

## System Design

The system is split into five layers:

1. Frontend layer
   - RM dashboard built with Next.js.
   - Shows leads, analytics, call history, transcripts, summaries, and recordings.

2. API layer
   - Express REST APIs for leads, calls, analytics, and recording chunks.
   - WebSocket APIs for live voice calls.

3. Conversation intelligence layer
   - LangGraph-style conversation state machine.
   - Decision engine for intent, emotion, objections, and stage.
   - Prompt builder for Priya's response style and context.
   - RAG for product/objection knowledge.
   - Scoring engine for HOT/WARM/COLD classification.

4. Voice layer
   - Deepgram STT converts user speech to text.
   - LLM generates Priya's response.
   - Sarvam TTS converts Priya's response to audio.
   - Dynamic TTS pace and temperature adapt to the conversation.

5. Persistence layer
   - PostgreSQL stores leads, calls, transcripts, summaries, scores, and metadata.
   - Redis stores live-call short-term memory.
   - S3 stores ordered call recording chunks.

### System Design Diagram

![System Design](./system_design.png)

```mermaid
flowchart TB
  subgraph Frontend
    Dashboard[RM Dashboard]
    TestPage[Test Voice Page]
  end

  subgraph Backend
    Express[Express REST API]
    WS[Voice WebSocket Server]
    RM[RM Lead Module]
    ConvAPI[Conversation API]
    Pipeline[Voice Pipeline Handler]
    Graph[Conversation Graph]
    Prompt[Prompt Builder]
    Decision[Decision Engine]
    Score[Scoring Engine]
    Summary[Call Summary Service]
  end

  subgraph VoiceProviders
    Deepgram[Deepgram STT]
    Ollama[Ollama / LLM]
    Sarvam[Sarvam TTS]
  end

  subgraph Storage
    Postgres[(PostgreSQL)]
    Redis[(Redis)]
    S3[(AWS S3)]
  end

  Dashboard --> Express
  TestPage --> WS

  Express --> RM
  Express --> ConvAPI
  RM --> Postgres
  ConvAPI --> Postgres
  ConvAPI --> S3

  WS --> Pipeline
  Pipeline --> Deepgram
  Pipeline --> Graph
  Graph --> Decision
  Graph --> Prompt
  Graph --> Score
  Graph --> Redis
  Pipeline --> Ollama
  Pipeline --> Sarvam
  Pipeline --> Postgres
  Pipeline --> S3
  Pipeline --> Summary
  Summary --> Postgres
```

### Main Data Flow

```text
Lead is created
  -> saved in PostgreSQL
  -> visible on RM dashboard

Call starts
  -> new Call row is created
  -> previous call context is loaded if available
  -> greeting is generated and spoken

User speaks
  -> browser sends AUDIO_CHUNK
  -> Deepgram returns transcript
  -> decision engine classifies the turn
  -> LLM generates response
  -> Sarvam returns audio
  -> transcript is appended atomically
  -> user and agent audio chunks are stored in order

Call ends
  -> call summary is generated
  -> score and status are updated
  -> recording chunks are available through signed URLs
```

### Key Design Rules

- One `Lead` can have many `Call` records.
- Each call keeps its own transcript, summary, score, and recording chunks.
- The latest completed call provides compact context for the next call with the same lead.
- PostgreSQL is the permanent source of truth.
- Redis is only live-call working memory.
- S3 stores audio; the database stores metadata and S3 keys.
- The frontend receives signed recording URLs from the backend, not raw public files.

For the full deep-dive, see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Repository Structure

```text
.
├── apps
│   ├── backend
│   │   ├── prisma
│   │   │   └── schema.prisma
│   │   └── src
│   │       ├── index.ts
│   │       ├── controllers
│   │       ├── modules
│   │       │   └── rm_dashbaord
│   │       ├── scripts
│   │       └── services
│   │           ├── conversation
│   │           ├── guardrails
│   │           ├── llm
│   │           ├── memory
│   │           ├── rag
│   │           ├── scoring
│   │           ├── storage
│   │           ├── stt
│   │           └── tts
│   └── rm-dashboard
│       ├── app
│       ├── components
│       └── lib
├── docker-compose.yml
├── ARCHITECTURE.md
└── README.md
```

Important backend files:

```text
apps/backend/src/index.ts
  Starts Express and WebSocket servers.

apps/backend/src/modules/rm_dashbaord/*
  RM lead, analytics, and call recording chunk APIs.

apps/backend/src/services/conversation/voicePipelineHandler.ts
  Main live voice pipeline.

apps/backend/src/services/conversation/conversationGraph.ts
  Conversation state machine and opening greeting.

apps/backend/src/services/conversation/decisionEngine.ts
  Intent, emotion, objection, and stage classification.

apps/backend/src/services/conversation/promptBuilder.ts
  System prompt builder for Priya.

apps/backend/src/services/conversation/conversationStorage.ts
  Database writes, transcript appends, summaries, previous call memory, recording metadata.

apps/backend/src/services/tts/sarvamTTS.ts
  Sarvam TTS integration.

apps/backend/src/services/stt/deepgramService.ts
  Deepgram STT integration.

apps/backend/src/services/storage/s3Service.ts
  S3 uploads and signed URLs.
```

Important frontend files:

```text
apps/rm-dashboard/app/page.tsx
  Dashboard overview.

apps/rm-dashboard/app/leads/page.tsx
  Lead list.

apps/rm-dashboard/app/leads/[id]/page.tsx
  Lead detail, call history, transcript, recordings.

apps/rm-dashboard/lib/api.ts
  API client.

apps/rm-dashboard/lib/types.ts
  Frontend types.
```

## Prerequisites

Install these before running locally:

- Node.js
- npm
- Docker Desktop, for Redis
- PostgreSQL database, local or hosted
- AWS S3 bucket
- Deepgram API key
- Sarvam API key
- Ollama or hosted Ollama-compatible endpoint

Optional:

- Prisma CLI, available through `npx prisma`

## Environment Variables

Create this file:

```text
apps/backend/.env
```

Example backend env:

```env
PORT=4000

DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE"
DIRECT_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE"

REDIS_URL="redis://localhost:6379"

OLLAMA_BASE_URL="http://localhost:11434"
OLLAMA_MODEL="gpt-oss:120b-cloud"
OLLAMA_MODEL_FAST="gpt-oss:120b-cloud"

DEEPGRAM_API_KEY="your_deepgram_key"

SARVAM_API_KEY="your_sarvam_key"
SARVAM_TTS_MODEL="bulbul:v3"
SARVAM_TTS_SPEAKER_HI="priya"
SARVAM_TTS_SPEAKER_EN="ishita"
SARVAM_TTS_PACE="1.0"
SARVAM_TTS_TEMPERATURE="0.6"

AWS_REGION="ap-south-1"
AWS_ACCESS_KEY_ID="your_aws_key"
AWS_SECRET_ACCESS_KEY="your_aws_secret"
AWS_BUCKET_NAME="your_bucket_name"
```

Create this file if needed:

```text
apps/rm-dashboard/.env.local
```

Example frontend env:

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
```

## First-Time Setup

### 1. Start Redis

From the repo root:

```bash
docker compose up -d redis
```

Redis runs on:

```text
localhost:6379
```

### 2. Install backend dependencies

```bash
cd apps/backend
npm install
```

### 3. Generate Prisma client

```bash
npx prisma generate
```

### 4. Sync database schema

For local development:

```bash
npx prisma db push
```

Or if using migrations:

```bash
npx prisma migrate dev
```

### 5. Install dashboard dependencies

```bash
cd ../rm-dashboard
npm install
```

## How To Open The App

You need two terminals.

### Terminal 1: Start Backend

```bash
cd apps/backend
npm run dev
```

Backend should run on:

```text
http://localhost:4000
```

Health check:

```text
http://localhost:4000/health
```

Voice test page:

```text
http://localhost:4000/test-voice-pipeline
```

### Terminal 2: Start RM Dashboard

```bash
cd apps/rm-dashboard
npm run dev
```

Dashboard usually runs on:

```text
http://localhost:3000
```

If port `3000` is busy, Next.js may use another port. Check the terminal output.

## How To Use The Dashboard

Open:

```text
http://localhost:3000
```

Main sections:

- Dashboard overview
- All leads
- Hot leads
- Warm leads
- Cold leads
- Test voice call link

### Add a lead

1. Open the dashboard.
2. Click Add Lead.
3. Enter phone number.
4. Optionally enter name, language, occupation, background, and custom script.
5. Submit.

### Upload leads in bulk

Use the bulk upload modal from the leads page.

Required field:

```text
phone
```

Optional fields:

```text
name
language
occupation
background
callScript
```

### View a lead

1. Open the lead list.
2. Click View Lead.
3. The lead detail page shows:
   - profile
   - status
   - current score
   - call history
   - selected call summary
   - selected call transcript
   - selected call recording chunks

## How To Test Voice Calls

Open:

```text
http://localhost:4000/test-voice-pipeline
```

This page connects to:

```text
ws://localhost:4000/ws/voice-pipeline
```

Typical test flow:

1. Make sure backend is running.
2. Open the test page.
3. Allow microphone permission.
4. Enter lead information or lead id.
5. Start call.
6. Speak into the microphone.
7. Listen to Priya's response.
8. End call.
9. Open the RM dashboard and view the saved call.

## Important Backend APIs

### Health

```text
GET /health
```

### RM APIs

```text
GET  /api/rm/analytics
GET  /api/rm/leads
POST /api/rm/leads
POST /api/rm/leads/upload
GET  /api/rm/leads/:id
GET  /api/rm/calls/:callId/audio-chunks
```

### Conversation APIs

```text
GET /api/conversations/:conversationId
GET /api/conversations/lead/:leadId
GET /api/conversations/:conversationId/recording
```

### WebSocket Routes

```text
/ws/voice
/ws/test-voice
/ws/voice-pipeline
```

The main current pipeline is:

```text
/ws/voice-pipeline
```

## Voice Pipeline Internals

Main file:

```text
apps/backend/src/services/conversation/voicePipelineHandler.ts
```

The pipeline handles:

1. Call creation
2. Previous-call context loading
3. Greeting generation
4. Deepgram STT setup
5. User audio chunk buffering
6. Turn processing
7. Decision engine classification
8. RAG retrieval
9. LLM response generation
10. Sarvam TTS
11. Transcript persistence
12. Recording chunk persistence
13. Call finalization
14. Lead score/status update

### WebSocket messages from client

```text
START_CALL
AUDIO_CHUNK
END_TURN
END_CALL
```

### WebSocket messages from server

```text
GREETING
TRANSCRIPT
AUDIO_PLAY
TURN_DONE
HANDOFF_REQUIRED
CALL_ENDING
CALL_ENDED
ERROR
```

## Database And Storage

Database schema:

```text
apps/backend/prisma/schema.prisma
```

### Lead

One row per lead.

Stores:

- phone
- name
- language
- occupation
- background
- score
- status
- custom call script

### Call

One row per call attempt.

Stores:

- transcript
- summary
- score
- duration
- language
- recording metadata
- start and end timestamps

### WhatsappLog

Stores mocked WhatsApp follow-up logs.

## Multiple Calls Per Lead

The system supports many calls for the same lead.

Example:

```text
Lead: Rahul
  Call 1: Intro call
  Call 2: Follow-up call
  Call 3: Objection handling call
```

Each call keeps its own:

- transcript
- summary
- score
- recording chunks
- timestamp

The lead keeps the latest overall:

- score
- status
- language
- background fields

## Recording Chunks

Recordings are uploaded to S3 under the call id:

```text
recordings/{conversationId}/
```

Each speaker turn becomes one recording chunk:

```text
recording1.mp3   Priya greeting
recording2.webm  user reply
recording3.mp3   Priya response
recording4.webm  user reply
```

Chunk metadata is stored in:

```text
Call.summary.recordingChunks
```

Example chunk:

```json
{
  "index": 1,
  "key": "recordings/call-id/recording1.mp3",
  "sizeBytes": 12345,
  "mimeType": "audio/mpeg",
  "speaker": "agent",
  "text": "नमस्ते...",
  "timestamp": 1234567890
}
```

The dashboard does not use raw S3 keys directly. The backend generates signed URLs.

## Previous Call Memory

When a new call starts for a lead that already has a completed call:

1. Backend finds the latest completed previous call.
2. Backend extracts compact context from the previous summary.
3. Context is attached to the new lead profile.
4. Priya uses it in the opening line and later turns.

Context includes:

- date
- previous score/status
- key points
- objections
- stated intent
- next action

Example:

```text
नमस्ते Rahul जी, मैं Priya Rupeezy से।
7 May 2026 को हमारी बात brokerage share के बारे में हुई थी।
क्या अभी उसी discussion को continue कर सकते हैं?
```

## TTS Behavior

TTS is handled in:

```text
apps/backend/src/services/tts/sarvamTTS.ts
```

The service:

- cleans markdown
- removes think tags
- normalizes spaces
- formats long numbers
- adds punctuation if missing
- chooses Hindi or English target language
- applies dynamic pace and temperature

Dynamic voice behavior:

```text
greeting             warm and slightly slower
pitch                slightly brisk
objection handling   calmer and slower
confused/negative    slow and controlled
positive interest    warmer and expressive
closing              steady and professional
```

Relevant env values:

```env
SARVAM_TTS_MODEL=bulbul:v3
SARVAM_TTS_SPEAKER_HI=priya
SARVAM_TTS_SPEAKER_EN=ishita
SARVAM_TTS_PACE=1.0
SARVAM_TTS_TEMPERATURE=0.6
```

To use Bulbul v2:

```env
SARVAM_TTS_MODEL=bulbul:v2
SARVAM_TTS_SPEAKER_HI=manisha
SARVAM_TTS_SPEAKER_EN=anushka
```

## Common Commands

### Backend

```bash
cd apps/backend
npm run dev
npm run build
npm test
npx prisma generate
npx prisma db push
npx prisma migrate dev
```

### Dashboard

```bash
cd apps/rm-dashboard
npm run dev
npm run build
npm run start
```

### Redis

```bash
docker compose up -d redis
docker compose logs redis
docker compose down
```

## Troubleshooting

### Backend does not start

Check:

- `.env` exists in `apps/backend`
- `DATABASE_URL` is correct
- Redis is running
- port `4000` is free
- dependencies are installed

### Dashboard cannot connect to backend

Check:

- backend is running
- `NEXT_PUBLIC_API_URL` points to backend
- browser console network errors
- CORS logs in backend

### No leads shown

Check:

- database has leads
- `GET /api/rm/leads`
- Prisma schema is pushed
- correct database is connected

### Voice call has no transcript

Check:

- microphone permission
- Deepgram API key
- browser is sending audio chunks
- backend logs from `deepgramService.ts`

### Agent does not speak

Check:

- Sarvam API key
- Sarvam model/speaker config
- TTS request errors in logs
- generated response is not empty

### Recordings missing

Check:

- AWS credentials
- `AWS_BUCKET_NAME`
- S3 bucket permissions
- `Call.summary.recordingChunks`
- `/api/rm/calls/:callId/audio-chunks`

### Previous call context not used

Check:

- previous call has `endedAt`
- previous call belongs to the same `leadId`
- previous call has `summary`
- `getPreviousConversationContext()` logs

### Windows: NODE_NO_WARNINGS error

Use the current script:

```json
"dev": "nodemon src/index.ts"
```

Do not use Unix-style env syntax like this on Windows:

```bash
NODE_NO_WARNINGS=1 nodemon src/index.ts
```

## Where To Change Things

### Change lead API behavior

```text
apps/backend/src/modules/rm_dashbaord/
```

### Change voice conversation behavior

```text
apps/backend/src/services/conversation/voicePipelineHandler.ts
apps/backend/src/services/conversation/conversationGraph.ts
```

### Change prompts

```text
apps/backend/src/services/conversation/promptBuilder.ts
```

### Change scoring

```text
apps/backend/src/services/scoring/scoringEngine.ts
```

### Change objection classification

```text
apps/backend/src/services/conversation/decisionEngine.ts
```

### Change TTS

```text
apps/backend/src/services/tts/sarvamTTS.ts
```

### Change STT

```text
apps/backend/src/services/stt/deepgramService.ts
```

### Change dashboard lead detail

```text
apps/rm-dashboard/app/leads/[id]/page.tsx
```

### Change frontend API calls

```text
apps/rm-dashboard/lib/api.ts
```

## Additional Documentation

Detailed architecture:

```text
ARCHITECTURE.md
```

Dashboard setup notes:

```text
DASHBOARD_SETUP.md
```

Conversation-specific docs:

```text
apps/backend/src/services/conversation/README.md
apps/backend/src/services/conversation/STORAGE.md
apps/backend/src/services/conversation/REDIS_HISTORY.md
apps/backend/src/services/conversation/RAG_INTEGRATION.md
apps/backend/src/services/conversation/GUARDRAILS.md
apps/backend/src/services/conversation/FILLER_AUDIO.md
```
