# RAG Integration Guide

## Overview

The conversation graph now integrates RAG (Retrieval-Augmented Generation) to provide accurate, context-aware responses using the Rupeezy knowledge base.

## How It Works

### 1. Input Validation (Input Guardrails Node)
Before processing, the system validates that user input is relevant:
- Checks if input is related to finance/trading/Rupeezy
- Blocks off-topic queries (cooking, politics, etc.)
- Returns polite redirect message if blocked

### 2. Intent Detection (Detect Node)
The system analyzes user input to determine intent:
- `query_investment` - Questions about investment/fees
- `query_earnings` - Questions about brokerage/commission
- `information_request` - General information queries
- `objection_already_have` - User mentions existing broker

### 3. RAG Retrieval (Decide Node)
When RAG is needed, the system:
1. Calls `retrieveRelevantChunks(userInput, 3)` from `ragService.ts`
2. Retrieves top 3 most relevant chunks from Pinecone vector database
3. Stores chunks in `state.rag_context`

### 4. Response Generation (Generate Node)
The LLM receives:
- System prompt with persona and guidelines
- Conversation history (last 6 messages)
- Intent-specific instructions
- **RAG context chunks** (if available)

The RAG context is appended to the prompt:
```
=== KNOWLEDGE BASE CONTEXT ===
[Chunk 1]

---

[Chunk 2]

---

[Chunk 3]

Use the above context to answer the user's question accurately.
Only mention information from the context.
```

## Knowledge Base Categories

The RAG system contains data in these categories:
- `ap_program` - Authorized Person program details (100% brokerage, daily payout, RISE portal)
- `brokerage_charges` - Pricing for equity, F&O, MTF, commodities
- `trust_signals` - Company info, team, awards, testimonials
- `mfd_program` - Mutual Fund Distributor program details

## RAG Fallback

If Pinecone returns low relevance scores (< 0.40), the system automatically falls back to Tavily web search (if configured).

## Setup Instructions

### 1. Ensure Chunks Are Embedded

The knowledge base data is in `scraper/output/chunks.json`. To embed and upload to Pinecone:

```bash
cd scraper
npm run embed
```

This will:
- Read chunks from `chunks.json`
- Generate embeddings using AICredits API
- Upload vectors to Pinecone index

### 2. Environment Variables

Required in `apps/backend/.env`:
```env
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_INDEX=rupeezy-knowledge
AICREDITS_API_KEY=your_aicredits_api_key
```

Optional (for web fallback):
```env
TAVILY_API=your_tavily_api_key
```

### 3. Test RAG Retrieval

You can test RAG retrieval directly:

```typescript
import { retrieveRelevantChunks } from './services/rag/ragService';

const chunks = await retrieveRelevantChunks('What is the brokerage share?', 3);
console.log(chunks);
```

## Example Conversation Flow

**User**: "What is the recipe for biryani?"

1. **Detect Node**: Intent = `unknown`, Emotion = `neutral`
2. **Input Guardrails Node**: `input_blocked = true` (off-topic)
3. **Response**: "I apologize, but I can only help with questions about Rupeezy and financial services..."
4. **TTS Node**: Convert to audio and send

---

**User**: "What is the brokerage share for APs?"

1. **Detect Node**: Intent = `query_earnings`, Emotion = `neutral`
2. **Input Guardrails Node**: `input_blocked = false` (relevant)
3. **Decide Node**: `use_rag = true`, retrieves 3 chunks about AP program
4. **Generate Node**: LLM receives chunks mentioning "100% brokerage share"
5. **Response**: "As a Rupeezy Authorized Person, you get 100% brokerage share with daily payouts..."

## Monitoring

The system logs RAG operations:
```
[Graph] Decide node - routing to data sources
[Graph] Retrieving RAG context for: What is the brokerage share?
[Graph] Retrieved 3 RAG chunks
[Graph] Generate node - creating LLM response
[Graph] Added 3 RAG chunks to prompt
```

## Performance

- RAG retrieval adds ~200-500ms latency
- Embedding API call: ~100-200ms
- Pinecone query: ~100-300ms
- This is acceptable as filler audio plays after 500ms

## Future Enhancements

1. **Caching**: Cache frequent queries to reduce latency
2. **Hybrid Search**: Combine vector search with keyword search
3. **Re-ranking**: Use a re-ranker model to improve relevance
4. **Dynamic Top-K**: Adjust number of chunks based on query complexity
5. **Category Filtering**: Filter by category (e.g., only search `ap_program` for AP queries)
