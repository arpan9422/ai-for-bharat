# Redis Conversation History

## Overview

The conversation pipeline uses Redis to persist conversation history across turns, enabling context-aware responses and conversation continuity. History is loaded before LLM generation and saved after each turn.

## Architecture

```
User Input
    ↓
Detect → Input Guardrails → Decide
    ↓
[Load History from Redis] ← conversation_id
    ↓
Generate (with history context)
    ↓
[Save to Redis] → user message + assistant response
    ↓
Guardrails → Score → Decision → TTS
```

## Redis Schema

### Keys

**Session History (Recent Messages):**
```
session:{conversation_id}
```
Stores: Array of recent conversation messages (last 5 user-assistant pairs = 10 messages)
TTL: 1 hour (3600 seconds)

**Conversation Summary (Old Messages):**
```
summary:{conversation_id}
```
Stores: Summarized text of older conversation messages
TTL: 1 hour (3600 seconds)

**Lead Context:**
```
context:{conversation_id}
```
Stores: Lead profile information
TTL: 1 hour (3600 seconds)

### Sliding Window Architecture

The system maintains a **sliding window** of the last 5 user-assistant pairs (10 messages). When the history exceeds this limit, older messages are automatically summarized and moved to the summary key.

```
Turn 1-5:  [msg1, msg2, msg3, msg4, msg5, msg6, msg7, msg8, msg9, msg10]
           └─────────────── Recent History ──────────────────────┘

Turn 6:    [msg11, msg12] added
           ↓
           [Earlier: summary of msg1-2] + [msg3, msg4, ..., msg12]
           └──── Summary ────┘           └──── Recent (10) ─────┘

Turn 11:   [msg21, msg22] added
           ↓
           [Earlier: summary of msg1-12] + [msg13, msg14, ..., msg22]
           └────── Summary ──────┘         └───── Recent (10) ─────┘
```

### Benefits of Sliding Window

1. **Bounded Memory**: History never exceeds 10 messages + summary
2. **Context Preservation**: Important information from old messages preserved in summary
3. **Low Latency**: Loading 10 messages is fast (~1-5ms)
4. **Async Summarization**: Summarization happens in background, doesn't block conversation

### Data Structure

**Message Format:**
```typescript
{
  role: 'user' | 'assistant' | 'system',
  content: string
}
```

**Recent History Example:**
```json
[
  {
    "role": "user",
    "content": "What is the brokerage share?"
  },
  {
    "role": "assistant",
    "content": "As a Rupeezy Authorized Person, you get 100% brokerage share with daily payouts."
  },
  {
    "role": "user",
    "content": "How do I get daily payouts?"
  },
  {
    "role": "assistant",
    "content": "Daily payouts are processed automatically through the RISE portal."
  }
]
```

**Summary Format:**
```
[Earlier conversation]: User asked about AP program benefits and brokerage structure. 
Assistant explained 100% brokerage share, zero joining fee, and daily payout system.

[Earlier conversation]: User inquired about RISE portal features and client onboarding process. 
Assistant provided details on dashboard access and marketing support.
```

**Combined Context (Returned by getHistory):**
```json
[
  {
    "role": "system",
    "content": "Previous conversation summary: [Earlier conversation]: User asked about..."
  },
  {
    "role": "user",
    "content": "What is the brokerage share?"
  },
  {
    "role": "assistant",
    "content": "You get 100% brokerage share..."
  }
]
```

## Implementation

### Session Store Functions

Located in: `apps/backend/src/services/memory/sessionStore.ts`

#### 1. Initialize Session
```typescript
await initSession(callId, leadContext);
```
Creates empty history array, empty summary, and stores lead context.

#### 2. Append Message (with Auto-Summarization)
```typescript
await appendMessage(callId, 'user', 'What is the brokerage share?');
await appendMessage(callId, 'assistant', 'You get 100% brokerage share...');
```
Adds a message to the conversation history. **Automatically triggers summarization** when history exceeds 10 messages (5 pairs).

**Summarization Process:**
1. Check if history > 10 messages
2. If yes:
   - Extract oldest messages (beyond last 10)
   - Trigger async summarization (fire-and-forget)
   - Keep only last 10 messages in history
   - Append summary to summary key
3. If no: Just append message

**Async Behavior:**
- Summarization happens in background
- Doesn't block conversation flow
- Uses fast LLM model for quick summarization
- Errors are logged but don't affect conversation

#### 3. Get History (with Summary)
```typescript
const history = await getHistory(callId);
// Returns: [system message with summary, ...recent messages]
```
Retrieves full conversation context:
- If summary exists: Prepends as system message
- Returns recent messages (last 10)
- Combined context for LLM

#### 4. Get Recent History Only
```typescript
const recentHistory = await getRecentHistory(callId);
// Returns: Recent messages only (no summary)
```
Retrieves just the recent messages without summary.

#### 5. Get Summary Only
```typescript
const summary = await getSummary(callId);
// Returns: Summary text or empty string
```
Retrieves just the conversation summary.

#### 6. Get Lead Context
```typescript
const leadContext = await getLeadContext(callId);
```
Retrieves lead profile information.

#### 7. Clear Session (Testing)
```typescript
await clearSession(callId);
```
Deletes all session data (history, summary, context).

### Graph Integration

#### Load History Node (Node 5)

**Purpose:** Load conversation history from Redis before LLM generation

**Location:** `conversationGraph.ts` → `loadHistoryNode()`

**Process:**
1. Fetch history from Redis using `conversation_id`
2. Convert Redis format to graph format
3. Update state with loaded history
4. Log number of messages loaded

**Code:**
```typescript
async function loadHistoryNode(state: ConversationState) {
  const redisHistory = await getHistory(state.conversation_id);
  
  const history = redisHistory.map(msg => ({
    role: msg.role as 'user' | 'assistant',
    content: msg.content,
  }));
  
  return { history };
}
```

**Error Handling:**
- If Redis fails, uses existing state history
- Logs error but doesn't block conversation
- Graceful degradation

#### Generate Node (Node 6)

**Purpose:** Use history in LLM prompt and save new messages to Redis

**Process:**
1. Load history from state (populated by loadHistory node)
2. Build conversation context from last 6 messages
3. Add history to LLM prompt
4. Generate response
5. Save user message to Redis
6. Save assistant response to Redis
7. Update state history

**Code:**
```typescript
async function generateNode(state: ConversationState) {
  // Build context from history
  const historyContext = state.history
    .slice(-6) // Last 3 turns
    .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
    .join('\n');
  
  // Add to prompt
  enhancedPrompt += '\n\n=== CONVERSATION HISTORY ===\n' + historyContext;
  
  // Generate response
  const response = await streamSimpleReply(state.user_input, enhancedPrompt);
  
  // Save to Redis
  await appendMessage(state.conversation_id, 'user', state.user_input);
  await appendMessage(state.conversation_id, 'assistant', response);
  
  return { response, history: [...state.history, userMsg, assistantMsg] };
}
```

## Flow Example

### Turn 1-5: Building History

```
Turn 1: User: "What is AP program?"
        Redis: session:conv-123 = [msg1, msg2]

Turn 2: User: "What is brokerage share?"
        Redis: session:conv-123 = [msg1, msg2, msg3, msg4]

Turn 3: User: "How do I register?"
        Redis: session:conv-123 = [msg1, msg2, msg3, msg4, msg5, msg6]

Turn 4: User: "What is RISE portal?"
        Redis: session:conv-123 = [msg1, msg2, msg3, msg4, msg5, msg6, msg7, msg8]

Turn 5: User: "Tell me about payouts"
        Redis: session:conv-123 = [msg1, msg2, msg3, msg4, msg5, msg6, msg7, msg8, msg9, msg10]
```

### Turn 6: Triggering Summarization

```
Turn 6: User: "What about marketing support?"
        
        1. appendMessage() detects history.length = 10
        2. Trigger async summarization of msg1-2 (oldest pair)
        3. Keep msg3-10 + new msg11-12
        
        Redis: 
        - session:conv-123 = [msg3, msg4, msg5, msg6, msg7, msg8, msg9, msg10, msg11, msg12]
        - summary:conv-123 = "[Earlier conversation]: User asked about AP program. 
                              Assistant explained zero investment and 100% brokerage."
```

### Turn 11: Appending to Summary

```
Turn 11: User: "How many clients do I need?"
         
         1. appendMessage() detects history.length = 10
         2. Trigger async summarization of msg3-4 (oldest pair in current window)
         3. Keep msg5-12 + new msg21-22
         
         Redis:
         - session:conv-123 = [msg5, msg6, msg7, msg8, msg9, msg10, msg11, msg12, msg21, msg22]
         - summary:conv-123 = "[Earlier conversation]: User asked about AP program...
                               
                               [Earlier conversation]: User inquired about brokerage share 
                               and registration process. Assistant provided details on 
                               100% commission and RISE portal access."
```

### Turn 15: LLM Receives Full Context

```
Turn 15: User: "Remind me about the brokerage again?"
         
         1. Load History node calls getHistory()
         2. Returns:
            [
              { role: 'system', content: 'Previous conversation summary: [Earlier...]' },
              { role: 'user', content: 'msg from turn 6' },
              { role: 'assistant', content: 'response from turn 6' },
              ...
              { role: 'user', content: 'Remind me about the brokerage again?' }
            ]
         
         3. LLM sees:
            - Summary of turns 1-5 (condensed)
            - Full messages from turns 6-14 (recent)
            - Current question
         
         4. LLM can reference information from early conversation via summary
```

## Benefits

### 1. Context Continuity
- LLM has access to full conversation history (summary + recent)
- Can reference previous questions/answers from any turn
- Maintains conversation flow across long conversations
- Summary preserves key information from early turns

### 2. Bounded Memory Usage
- History never exceeds 10 messages + summary text
- Predictable memory footprint per conversation
- Scales to long conversations without memory explosion
- Summary is typically 100-300 characters

### 3. Low Latency
- Loading 10 messages is fast (~1-5ms)
- Summarization happens asynchronously (doesn't block)
- No performance degradation as conversation grows
- LLM prompt size stays manageable

### 4. Persistence
- History survives server restarts
- Can resume conversations after disconnects
- 1-hour TTL prevents stale data
- Summary preserved across sessions

### 5. Intelligent Compression
- LLM-based summarization preserves semantic meaning
- Key topics and user concerns captured in summary
- Better than simple truncation or FIFO queue
- Maintains conversation coherence

## Configuration

### Environment Variables

```env
REDIS_URL=redis://localhost:6379
```

For production with authentication:
```env
REDIS_URL=redis://:password@host:port
```

For Redis Cluster:
```env
REDIS_URL=redis://host1:port1,host2:port2,host3:port3
```

### TTL Configuration

Default: 1 hour (3600 seconds)

To change, update `sessionStore.ts`:
```typescript
const TTL_SECONDS = 7200; // 2 hours
```

### Sliding Window Configuration

Default: Last 5 user-assistant pairs (10 messages)

To change, update `sessionStore.ts`:
```typescript
const MAX_HISTORY_PAIRS = 10; // Keep last 10 pairs (20 messages)
```

**Considerations:**
- Larger window = more context but higher memory usage
- Smaller window = less memory but more frequent summarization
- Recommended: 5-10 pairs for most use cases

## Performance

### Latency
- **Load History**: ~1-5ms (Redis read for 10 messages + summary)
- **Save Message**: ~1-5ms (Redis write)
- **Summarization**: ~200-500ms (async, doesn't block)
- **Total overhead per turn**: ~10-20ms

### Memory Usage
- **Per message**: ~100-500 bytes
- **Per conversation (10 messages)**: ~2-5 KB
- **Per summary**: ~100-300 bytes
- **1000 concurrent conversations**: ~2-5 MB (bounded!)

### Summarization Frequency
- Triggered every 2 messages after reaching 10 messages
- Example: Turn 6, 8, 10, 12, 14, 16...
- Async execution prevents blocking
- Typical summarization time: 200-500ms

### Throughput
- Redis can handle 100k+ ops/sec
- Conversation pipeline is not Redis-bottlenecked
- Summarization uses fast LLM model (low latency)
- Scales to thousands of concurrent conversations

## Monitoring

### Logs
```
[SessionStore] History size (12) exceeds limit (10), triggering summarization
[SessionStore] Summarizing 2 old messages, keeping 10 recent messages
[SessionStore] Generated summary: User asked about AP program benefits...
[SessionStore] Updated summary for conv-123
[Graph] Load History node - fetching from Redis
[Graph] Loaded 11 messages from Redis (1 summary + 10 recent)
[Graph] Using 11 messages from history
[Graph] Saved user message to Redis
[Graph] Saved assistant response to Redis
```

### Metrics to Track
1. **Redis connection failures**: Monitor connection errors
2. **History load latency**: Track time to load history
3. **History size**: Average messages per conversation
4. **Summarization frequency**: How often summarization is triggered
5. **Summarization latency**: Time to generate summaries
6. **Summary size**: Average summary length
7. **TTL expiry rate**: How often conversations expire

### Redis Commands for Debugging

**View recent conversation history:**
```bash
redis-cli GET session:conv-123
```

**View conversation summary:**
```bash
redis-cli GET summary:conv-123
```

**View lead context:**
```bash
redis-cli GET context:conv-123
```

**Check TTL:**
```bash
redis-cli TTL session:conv-123
redis-cli TTL summary:conv-123
```

**List all sessions:**
```bash
redis-cli KEYS session:*
redis-cli KEYS summary:*
```

**Delete session:**
```bash
redis-cli DEL session:conv-123 summary:conv-123 context:conv-123
```

**Monitor Redis operations in real-time:**
```bash
redis-cli MONITOR
```

## Error Handling

### Redis Connection Failure
- Load History: Uses empty history, logs error
- Save Message: Logs error, continues conversation
- Fail-open strategy prevents dropped calls

### Redis Timeout
- Set timeout in Redis client config
- Default: 5 seconds
- Fallback to empty history if timeout

### Data Corruption
- JSON parse errors handled gracefully
- Returns empty array if parse fails
- Logs error for debugging

## Testing

### Unit Tests
```typescript
import { initSession, appendMessage, getHistory } from './sessionStore';

// Test session initialization
await initSession('test-123', { name: 'John' });
const history = await getHistory('test-123');
expect(history).toEqual([]);

// Test message append
await appendMessage('test-123', 'user', 'Hello');
await appendMessage('test-123', 'assistant', 'Hi there!');
const updated = await getHistory('test-123');
expect(updated.length).toBe(2);
```

### Integration Tests
```typescript
// Test sliding window and summarization
const graph = buildConversationGraph();
const state = createConversationState('lead-1', 'conv-123');

// Initialize
await initSession('conv-123', {});

// Add 12 messages (should trigger summarization at message 11)
for (let i = 1; i <= 6; i++) {
  await appendMessage('conv-123', 'user', `Question ${i}`);
  await appendMessage('conv-123', 'assistant', `Answer ${i}`);
}

// Check that history is bounded to 10 messages
const recentHistory = await getRecentHistory('conv-123');
expect(recentHistory.length).toBe(10);

// Check that summary exists
const summary = await getSummary('conv-123');
expect(summary).toContain('[Earlier conversation]');

// Check that getHistory returns summary + recent
const fullHistory = await getHistory('conv-123');
expect(fullHistory.length).toBe(11); // 1 summary + 10 recent
expect(fullHistory[0].role).toBe('system');
expect(fullHistory[0].content).toContain('Previous conversation summary');
```

## Best Practices

1. **Use conversation_id consistently**: Ensures history is tied to correct conversation
2. **Set appropriate TTL**: Balance between persistence and memory usage (default: 1 hour)
3. **Monitor Redis health**: Set up alerts for connection failures
4. **Log all operations**: Track history loads/saves and summarizations for debugging
5. **Handle errors gracefully**: Never drop calls due to Redis failures
6. **Clean up old sessions**: Use TTL to prevent memory leaks
7. **Tune sliding window size**: Adjust MAX_HISTORY_PAIRS based on conversation length needs
8. **Monitor summarization quality**: Review generated summaries periodically
9. **Test with long conversations**: Ensure summarization works correctly
10. **Use async summarization**: Don't block conversation flow for summarization

## Tuning Guidelines

### Short Conversations (< 10 turns)
- MAX_HISTORY_PAIRS = 5 (default)
- No summarization needed
- Low memory usage

### Medium Conversations (10-20 turns)
- MAX_HISTORY_PAIRS = 5-7
- Occasional summarization
- Balanced memory/context

### Long Conversations (> 20 turns)
- MAX_HISTORY_PAIRS = 5
- Frequent summarization
- Summary captures early context
- Recent messages stay detailed

## Future Enhancements

1. **Adaptive window size**: Adjust MAX_HISTORY_PAIRS based on conversation complexity
2. **Multi-level summarization**: Summarize summaries for very long conversations
3. **Semantic chunking**: Group related messages before summarization
4. **Summary quality scoring**: Evaluate and improve summarization quality
5. **Configurable summarization**: Allow custom summarization prompts per use case
6. **History export**: Export full conversations (summary + messages) for analysis
7. **Redis Cluster**: Scale to multiple Redis nodes for high availability
8. **Compression**: Compress old summaries to save memory
9. **Smart summarization triggers**: Trigger based on topic changes, not just message count
10. **Summary caching**: Cache frequently accessed summaries

## Related Files

- `apps/backend/src/services/memory/sessionStore.ts` - Redis session store implementation
- `apps/backend/src/services/conversation/conversationGraph.ts` - Graph integration
- `apps/backend/src/services/llm/llmService.ts` - LLM service using history
