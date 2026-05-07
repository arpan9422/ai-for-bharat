# Guardrails System

## Overview

The conversation pipeline implements a comprehensive guardrails system to ensure safe, compliant, and relevant interactions. Guardrails operate at two critical points: **input validation** (before processing) and **output sanitization** (after generation).

## Architecture

```
User Input
    ↓
[Input Guardrails] ← Blocks off-topic queries
    ↓
Intent Detection
    ↓
RAG Retrieval
    ↓
LLM Generation
    ↓
[Output Guardrails] ← Sanitizes compliance risks
    ↓
TTS & Response
```

## Input Guardrails (Node 3)

### Purpose
Validate that user input is relevant to finance, trading, or Rupeezy services. Block completely off-topic queries to prevent wasted processing and maintain conversation focus.

### Implementation
Located in: `apps/backend/src/services/guardrails/guardrailsService.ts`

Function: `checkInputRelevance(userMessage: string): Promise<boolean>`

### How It Works
1. User input is sent to a fast LLM (llama3.1:8b)
2. LLM determines if input is related to:
   - Finance, trading, stock markets
   - Rupeezy services (AP program, brokerage, etc.)
   - Mutual funds, investments
   - General greetings
3. Returns `RELEVANT` or `IRRELEVANT`

### Examples

**Allowed (RELEVANT):**
- "What is the brokerage share?"
- "How do I become an AP?"
- "Tell me about daily payouts"
- "Hello, how are you?"
- "क्या मुझे कोई investment fee देनी होगी?"

**Blocked (IRRELEVANT):**
- "What's the recipe for biryani?"
- "Who will win the election?"
- "How do I code in Python?"
- "Tell me a joke"
- "What's the weather today?"

### Response When Blocked
If input is blocked, the system:
1. Sets `input_blocked = true` in state
2. Skips RAG retrieval and LLM generation
3. Returns a polite redirect message:
   ```
   "I apologize, but I can only help with questions about Rupeezy 
   and financial services. Is there anything about our partner 
   program or trading services I can help you with?"
   ```
4. Routes directly to TTS node

### Graph Flow

```
Detect → Input Guardrails
              ↓
         [Check Relevance]
              ↓
         ┌────┴────┐
         ↓         ↓
    RELEVANT   IRRELEVANT
         ↓         ↓
      Decide     TTS (with redirect message)
```

### Performance
- Latency: ~100-300ms (fast model)
- Fail-open: If LLM fails, allows input through (prevents dropped calls)

## Output Guardrails (Node 6)

### Purpose
Validate and sanitize LLM-generated responses to ensure:
1. Appropriate length (not too short, not too long)
2. Relevant context (mentions Rupeezy/brokerage/partner)
3. No inappropriate content
4. Compliance with financial regulations

### Implementation
Located in: `apps/backend/src/services/conversation/conversationGraph.ts`

Function: `guardrailsNode(state: ConversationState)`

### Checks Performed

#### 1. Length Validation
- **Too short** (< 3 words): Replace with clarification request
- **Too long** (> 100 words): Truncate to first 3 sentences

#### 2. Context Validation
- Ensure response mentions "Rupeezy", "brokerage", or "partner"
- If missing during opening stage, prepend "This is from Rupeezy."

#### 3. Content Filtering
- Block inappropriate words: "spam", "scam", "fraud"
- Replace with: "I apologize for any confusion. Let me connect you with our relationship manager for accurate information."

### Compliance Sanitization

For high-risk compliance words, use `sanitizeOutput()` from guardrailsService:

**Replacements:**
- "guarantee", "guaranteed" → "potential", "likely"
- "100% sure", "surety" → "confident", "historically seen"
- "zero risk", "risk free" → "calculated risk", "managed risk"
- "promise" → "aim to provide", "strive to"

**Example:**
```
Before: "We guarantee 100% returns with zero risk!"
After:  "We aim to provide potential returns with managed risk."
```

## Web Search Guardrails

### Purpose
Filter web search results (from Tavily) to remove competitor promotions and inappropriate content.

### Implementation
Function: `filterWebSearchResults(searchResults: string[]): Promise<string[]>`

### What It Filters
- Aggressive promotion of competitors (Zerodha, Groww, Upstox, Angel One)
- Highly inappropriate content
- Misleading information

### Usage
Called in `ragService.ts` when falling back to Tavily web search:
```typescript
const webResults = await tavilySearch(query);
const filtered = await filterWebSearchResults(webResults);
```

## Configuration

### Environment Variables
```env
OLLAMA_BASE_URL=https://your-ollama-cloud-host
OLLAMA_API_KEY=your_api_key
OLLAMA_MODEL_FAST=llama3.1:8b
```

### Fail-Open Strategy
All guardrails are designed to **fail open**:
- If LLM is down, allow input through
- If sanitization fails, use regex fallback
- Prevents dropped calls due to guardrail failures

## Monitoring

### Logs
```
[Graph] Input Guardrails node - checking relevance
[Graph] Input blocked - off-topic query
[Graph] Input passed guardrails
[Graph] Guardrails node - validating response
[Graph] Guardrails - passed: true
```

### Metrics to Track
1. **Input block rate**: % of inputs blocked as off-topic
2. **Guardrail latency**: Time spent in guardrail checks
3. **Fail-open rate**: How often guardrails fail and allow through
4. **Compliance triggers**: How often output sanitization is needed

## Testing

### Test Input Guardrails
```typescript
import { checkInputRelevance } from './services/guardrails/guardrailsService';

// Should return true
await checkInputRelevance('What is the brokerage share?');

// Should return false
await checkInputRelevance('What is the recipe for biryani?');
```

### Test Output Guardrails
```typescript
import { sanitizeOutput } from './services/guardrails/guardrailsService';

const risky = 'We guarantee 100% returns with zero risk!';
const safe = await sanitizeOutput(risky);
console.log(safe); // "We aim to provide potential returns with managed risk."
```

## Future Enhancements

1. **PII Detection**: Block inputs containing phone numbers, emails, addresses
2. **Sentiment Analysis**: Detect and handle abusive language
3. **Multi-language Support**: Guardrails for Hindi/Hinglish content
4. **Custom Blocklists**: Configurable list of blocked topics/words
5. **Rate Limiting**: Prevent spam/abuse from single users
6. **Audit Logging**: Log all blocked inputs for compliance review

## Best Practices

1. **Always fail open**: Don't drop calls due to guardrail failures
2. **Log everything**: Track what gets blocked and why
3. **Keep it fast**: Input guardrails should add < 300ms latency
4. **Be polite**: Redirect messages should be friendly, not accusatory
5. **Test regularly**: Ensure guardrails don't block legitimate queries
6. **Monitor false positives**: Track when relevant queries get blocked

## Related Files

- `apps/backend/src/services/guardrails/guardrailsService.ts` - Core guardrail functions
- `apps/backend/src/services/conversation/conversationGraph.ts` - Graph integration
- `apps/backend/src/services/rag/ragService.ts` - Web search filtering
