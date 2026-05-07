# Voice Conversation Pipeline - LangGraph Implementation

This directory contains the LangGraph-based conversation pipeline for Rupeezy's AI voice agent (Priya).

## Architecture

The pipeline uses **LangGraph** to manage conversation state and flow through a production-ready state machine:

```
START → Opening → TTS → END
          ↓
      Detect → Input Guardrails → Decide → Load History → Generate → Guardrails → Score → Decision → TTS → END
                      ↓ (if blocked)                          ↓
                     TTS → END                          Save to Redis
```

### Production Flow (10 Core Nodes)

1. **Opening** - Generate personalized greeting using starting script
2. **Detect** - Analyze user intent and emotion
3. **Input Guardrails** - Validate input is relevant to finance/trading (blocks off-topic queries)
4. **Decide** - Route to cache/RAG/web based on intent
5. **Load History** - Load conversation history from Redis
6. **Generate** - Create LLM response with history + RAG context
7. **Guardrails** - Validate response quality and safety
8. **Score** - Evaluate conversation engagement
9. **Decision** - Determine next action (continue/handoff/end)
10. **TTS** - Convert response to audio

### Components

1. **conversationGraph.ts** - Core LangGraph state machine
   - Defines conversation state structure (lead_id, conversation_id, stage, intent, emotion, score, etc.)
   - Implements 10 nodes: opening, detect, inputGuardrails, decide, loadHistory, generate, guardrails, score, decision, tts
   - Manages conversation flow and state transitions
   - **Input Guardrails**: Validates user input is relevant to finance/trading (blocks off-topic queries)
   - **Redis Integration**: Loads conversation history from Redis before generation, saves messages after generation
   - **RAG Integration**: Retrieves relevant knowledge base chunks in decide node

2. **startingScript.ts** - Opening line generation service
   - Pure function service with zero external dependencies
   - Generates personalized greetings based on lead profiles
   - Supports custom RM scripts and template-based generation
   - Multi-language support (Hindi, Hinglish, English)

3. **voicePipelineHandler.ts** - WebSocket handler
   - Manages WebSocket connections
   - Integrates Deepgram STT
   - Orchestrates LangGraph pipeline
   - Streams TTS audio to clients
   - **Storage Integration**: Saves transcripts and audio to DB/S3
   - **Filler Audio**: Plays context-aware filler after 500ms delay

4. **conversationStorage.ts** - Conversation persistence
   - Stores real-time transcripts in PostgreSQL
   - Uploads full audio recordings to S3
   - Updates lead status (HOT/WARM/COLD) based on engagement
   - Provides API endpoints for conversation retrieval

5. **fillerManager.ts** - Filler audio system
   - Context-aware filler selection (objection, confusion, positive)
   - Plays after 500ms if LLM processing takes longer
   - Cancels if response arrives in time
   - Avoids repetition by tracking last filler used

## State Machine

### States

- **greeting**: Initial state - generates and sends opening line
- **listening**: Waiting for user input (external state)
- **processing**: Processing user input through LLM
- **responding**: Generating TTS audio from LLM response
- **ended**: Conversation terminated

### Conversation State

```typescript
{
  sessionId: string;
  leadProfile?: LeadProfile;
  stage: 'greeting' | 'listening' | 'processing' | 'responding' | 'ended';
  transcript: string;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  userInput?: string;
  detectedLanguage?: 'hindi' | 'hinglish' | 'english';
  llmResponse?: string;
  audioChunks?: Buffer[];
  turnCount: number;
  startTime: number;
  lastActivityTime: number;
  error?: string;
}
```

## WebSocket Protocol

### Client → Server Messages

```typescript
// Start a new call session
{
  type: "START_CALL",
  payload: {
    leadProfile?: {
      name?: string;
      occupation?: string;
      background?: string;
      language?: 'hindi' | 'hinglish' | 'english';
      callScript?: string;
    }
  }
}

// Send audio chunk (base64 encoded webm/opus)
{
  type: "AUDIO_CHUNK",
  payload: "<base64 audio data>"
}

// Manually end current turn
{
  type: "END_TURN"
}

// End the call session
{
  type: "END_CALL"
}
```

### Server → Client Messages

```typescript
// Initial greeting message
{
  type: "GREETING",
  payload: "Great—this is from Rupeezy..."
}

// Transcript of user speech
{
  type: "TRANSCRIPT",
  payload: "User's spoken text"
}

// Audio chunk to play (base64 encoded mp3)
{
  type: "AUDIO_PLAY",
  payload: "<base64 audio data>"
}

// Turn processing complete
{
  type: "TURN_DONE"
}

// Error occurred
{
  type: "ERROR",
  payload: "Error message"
}

// Call session ended
{
  type: "CALL_ENDED"
}
```

## Usage

### Starting the Server

```bash
cd apps/backend
npm run dev
```

The LangGraph pipeline will be available at:
- WebSocket: `ws://localhost:4000/ws/voice-pipeline`
- Test UI: `http://localhost:4000/test-voice-pipeline`

### Testing

1. Open `http://localhost:4000/test-voice-pipeline` in your browser
2. (Optional) Fill in lead profile information
3. Click "Start Call" to initialize the session
4. Click "Start Recording" to begin speaking
5. The pipeline will:
   - Transcribe your speech (Deepgram STT)
   - Process through LangGraph state machine
   - Generate response (LLM)
   - Convert to speech (Sarvam TTS)
   - Stream audio back to you

### Programmatic Usage

```typescript
import { buildConversationGraph, createConversationState, processUserInput } from './conversationGraph';

// Initialize
const graph = buildConversationGraph();
const initialState = createConversationState('session-123', {
  name: 'Rajesh Kumar',
  occupation: 'MFD',
  language: 'hinglish'
});

// Get greeting
const greetingResult = await graph.invoke(initialState);
console.log(greetingResult.llmResponse); // Opening line

// Process user input
const result = await processUserInput(graph, greetingResult, "Tell me more about Rupeezy");
console.log(result.llmResponse); // AI response
console.log(result.audioChunks); // TTS audio buffers
```

## Flow Diagram

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ START_CALL
       ▼
┌─────────────────────────────────────┐
│  voicePipelineHandler.ts            │
│  ┌───────────────────────────────┐  │
│  │ Initialize Session            │  │
│  │ - Create graph                │  │
│  │ - Create initial state        │  │
│  └───────────┬───────────────────┘  │
│              ▼                       │
│  ┌───────────────────────────────┐  │
│  │ conversationGraph.ts          │  │
│  │ ┌─────────────────────────┐   │  │
│  │ │ Greeting Node           │   │  │
│  │ │ - getStartingScript()   │   │  │
│  │ └──────────┬──────────────┘   │  │
│  │            ▼                   │  │
│  │ ┌─────────────────────────┐   │  │
│  │ │ Responding Node         │   │  │
│  │ │ - streamSentences()     │   │  │
│  │ │ - Generate TTS          │   │  │
│  │ └──────────┬──────────────┘   │  │
│  └────────────┼──────────────────┘  │
└───────────────┼─────────────────────┘
                │ GREETING + AUDIO_PLAY
                ▼
       ┌─────────────┐
       │   Client    │
       └──────┬──────┘
              │ AUDIO_CHUNK (streaming)
              ▼
       ┌─────────────────┐
       │ Deepgram STT    │
       └──────┬──────────┘
              │ Transcript
              ▼
┌─────────────────────────────────────┐
│  conversationGraph.ts               │
│  ┌─────────────────────────────┐   │
│  │ Processing Node             │   │
│  │ - detectLanguage()          │   │
│  │ - streamSimpleReply()       │   │
│  └──────────┬──────────────────┘   │
│             ▼                       │
│  ┌─────────────────────────────┐   │
│  │ Responding Node             │   │
│  │ - streamSentences()         │   │
│  │ - Generate TTS              │   │
│  └──────────┬──────────────────┘   │
└─────────────┼───────────────────────┘
              │ AUDIO_PLAY
              ▼
       ┌─────────────┐
       │   Client    │
       └─────────────┘
```

## Key Features

### 1. Starting Script Service
- **Zero dependencies**: Pure function with in-memory templates
- **Sub-100ms performance**: O(1) template lookup
- **Lead type classification**: MFD, insurance agent, sub-broker, unknown
- **Multi-language**: Hindi, Hinglish, English
- **Custom scripts**: RM-defined scripts take priority
- **Name interpolation**: Personalized greetings

### 2. LangGraph State Machine
- **Production-ready flow**: 10 core nodes with clear responsibilities
- **Input guardrails**: Blocks off-topic queries (cooking, politics, etc.) - only allows finance/trading questions
- **Intent detection**: Analyzes user intent and emotion
- **Redis history**: Loads conversation history from Redis before generation, saves messages after generation
- **RAG integration**: Retrieves relevant knowledge base chunks
- **Output guardrails**: Validates response quality and safety
- **Scoring**: Evaluates conversation engagement
- **Decision logic**: Determines handoff/continue/end
- **Conversation history**: Maintains context across turns via Redis
- **Error handling**: Graceful degradation

### 3. RAG (Retrieval-Augmented Generation)
- **Knowledge base**: Rupeezy AP program, brokerage charges, trust signals, MFD program
- **Vector search**: Pinecone for semantic similarity
- **Top-K retrieval**: Fetches 3 most relevant chunks
- **Context injection**: Appends RAG context to LLM prompt
- **Fallback**: Tavily web search if relevance score < 0.40
- **Performance**: ~200-500ms latency (acceptable with filler audio)

### 4. Conversation Storage
- **Real-time transcripts**: Stores every message in PostgreSQL
- **Audio recordings**: Uploads full call audio to S3
- **Lead updates**: Updates lead status based on engagement score
- **API endpoints**: Retrieve conversations, transcripts, recordings
- **Non-blocking**: Async operations with graceful degradation

### 5. Filler Audio System
- **Context-aware**: Selects filler based on intent/emotion
- **500ms trigger**: Plays if LLM takes longer than 500ms
- **Cancellation**: Cancels if response arrives in time
- **Avoids repetition**: Tracks last filler used
- **6 Hindi/Hinglish + 4 English phrases**

### 6. WebSocket Integration
- **Real-time**: Streaming audio in/out
- **Session management**: Per-connection state
- **Deepgram STT**: Automatic speech recognition
- **Sarvam TTS**: Natural voice synthesis
- **Filler audio**: Plays during processing delays

## Environment Variables

Required in `.env`:

```bash
# Deepgram (STT)
DEEPGRAM_API_KEY=your_key_here

# Sarvam (TTS)
SARVAM_API_KEY=your_key_here

# LLM (Ollama)
OLLAMA_BASE_URL=https://your-ollama-cloud-host
OLLAMA_MODEL=gpt-oss:120b-cloud
OLLAMA_MODEL_FAST=deepseek-v4-flash:cloud

# RAG (Pinecone + AICredits)
PINECONE_API_KEY=your_pinecone_key
PINECONE_INDEX=rupeezy-knowledge
AICREDITS_API_KEY=your_aicredits_key

# RAG Fallback (Optional)
TAVILY_API=your_tavily_key

# Redis (Conversation History)
REDIS_URL=redis://localhost:6379

# Storage (S3)
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
AWS_REGION=ap-south-1
S3_BUCKET_NAME=rupeezy-voice-recordings

# Database (PostgreSQL)
DATABASE_URL=postgresql://user:password@host:5432/database
```

## Documentation

- **README.md** (this file) - Overview and usage guide
- **STORAGE.md** - Conversation storage system documentation
- **FILLER_AUDIO.md** - Filler audio system documentation
- **RAG_INTEGRATION.md** - RAG integration guide
- **GUARDRAILS.md** - Input/output guardrails system documentation
- **REDIS_HISTORY.md** - Redis conversation history integration

## Related Files

- **startingScript.test.ts** - Comprehensive test suite (40 unit + 15 property tests)
- **test-voice-pipeline.html** - WebSocket test UI
- **conversationRoutes.ts** - API endpoints for conversation retrieval

## Performance

- **Starting script generation**: < 100ms (typically < 10ms)
- **RAG retrieval**: ~200-500ms (Pinecone query + embedding)
- **First audio chunk**: ~200-500ms after user stops speaking
- **Turn latency**: ~1-2 seconds (STT → LLM → TTS)
- **Filler trigger**: 500ms (plays if LLM takes longer)

## Future Enhancements

- [ ] Add conversation memory/context window management
- [ ] Implement conversation analytics and logging
- [ ] Add support for conversation branching (conditional flows)
- [ ] Integrate with CRM for lead tracking
- [ ] Add conversation summarization
- [ ] Implement sentiment analysis
- [ ] Add multi-turn conversation strategies
- [ ] Support for conversation interruptions
- [ ] Add voice activity detection (VAD)
- [ ] Implement conversation timeout handling

## Troubleshooting

### WebSocket connection fails
- Ensure backend is running: `npm run dev`
- Check port 4000 is not in use
- Verify CORS settings in `index.ts`

### No audio playback
- Check browser console for errors
- Verify microphone permissions
- Ensure Deepgram API key is valid
- Check Sarvam TTS API key

### LLM not responding
- Verify OpenAI API key or Ollama is running
- Check network connectivity
- Review backend logs for errors

### Starting script not personalized
- Verify lead profile is passed in START_CALL message
- Check occupation field matches expected patterns
- Review startingScript.ts templates

## License

Proprietary - Rupeezy
