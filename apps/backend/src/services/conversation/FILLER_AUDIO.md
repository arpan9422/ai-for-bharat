# Filler Audio System

Natural conversation filler phrases that play when LLM processing takes > 500ms.

## Overview

The filler audio system provides a natural conversational experience by playing contextually appropriate filler phrases (like "Ek second...", "Let me check...") when the AI needs time to think.

### Why Fillers?

- **Reduces perceived latency** - User knows AI is processing
- **Natural conversation flow** - Mimics human conversation patterns
- **Prevents awkward silence** - Maintains engagement
- **Context-aware** - Different fillers for different situations

## Architecture

```
User speaks
    ↓
STT → transcript
    ↓
Start 500ms timer ⏱️
    ↓
LangGraph processing...
    ↓
    ├─ Response < 500ms → Cancel timer ✅
    │                     Send response
    │
    └─ Response > 500ms → Play filler 🔊
                          Then send response
```

## Filler Phrases

### Hindi/Hinglish (hi-IN)

| Key | Text | Use Case |
|-----|------|----------|
| `ek-second` | "Ek second..." | General, first turn |
| `haan-dekhti` | "Haan, abhi dekhti hoon." | Checking information |
| `samajh-gayi` | "Samajh gayi, ek moment." | Understanding objection |
| `bilkul` | "Bilkul, thoda wait karein." | Positive acknowledgment |
| `ji-haan` | "Ji haan, abhi batati hoon." | Polite response |
| `soch-rahi` | "Soch rahi hoon, ek second." | Thoughtful consideration |

### English (en-IN)

| Key | Text | Use Case |
|-----|------|----------|
| `one-moment` | "One moment please." | General, polite |
| `let-me-check` | "Let me check that for you." | Information lookup |
| `sure-thing` | "Sure, just a second." | Quick acknowledgment |
| `looking-into` | "I am looking into that for you." | Detailed inquiry |

## Context-Based Selection

The system intelligently selects fillers based on conversation context:

### Objection Handling
```typescript
context.is_objection = true
→ Uses thoughtful fillers: "samajh-gayi", "soch-rahi", "let-me-check"
```

### Confusion
```typescript
context.emotion = 'confused'
→ Uses reassuring fillers: "bilkul", "ji-haan", "sure-thing"
```

### Positive Emotion
```typescript
context.emotion = 'positive'
→ Uses quick fillers: "bilkul", "ek-second", "sure-thing"
```

### First Turn
```typescript
context.turn_count = 0
→ Uses polite fillers: "ek-second", "one-moment"
```

### Default
Random selection from available fillers, avoiding repetition.

## Implementation

### FillerPlayer Class

```typescript
const fillerPlayer = createFillerPlayer();

// Start timer
fillerPlayer.start(500, context, (audioBuffer, fillerKey) => {
  // Filler triggered - send to client
  send({ type: 'FILLER_AUDIO', payload: audioBuffer.toString('base64') });
});

// Cancel if response arrives in time
if (responseReady) {
  fillerPlayer.cancel();
}

// Mark as complete after playback
fillerPlayer.complete();
```

### Context Structure

```typescript
interface FillerContext {
  language: 'hindi' | 'hinglish' | 'english';
  intent?: string;
  emotion?: 'positive' | 'neutral' | 'negative' | 'confused';
  is_objection: boolean;
  turn_count: number;
  last_filler_used?: string;
}
```

## Storage

Filler audio files are pre-generated and stored in S3:

```
s3://bucket-name/fillers/
├── hi-IN/
│   ├── ek-second.wav
│   ├── haan-dekhti.wav
│   ├── samajh-gayi.wav
│   ├── bilkul.wav
│   ├── ji-haan.wav
│   └── soch-rahi.wav
└── en-IN/
    ├── one-moment.wav
    ├── let-me-check.wav
    ├── sure-thing.wav
    └── looking-into.wav
```

### Generation

Fillers are generated using Sarvam TTS and uploaded via:

```bash
npm run seed:fillers
```

Or programmatically:

```typescript
import { uploadAllFillerAudio } from './services/tts/fillerAudioService';

await uploadAllFillerAudio();
```

## WebSocket Protocol

### New Message Type

**Server → Client:**
```json
{
  "type": "FILLER_AUDIO",
  "payload": "<base64 wav audio>"
}
```

### Message Flow

```
1. User stops speaking
2. Server: { type: "TRANSCRIPT", payload: "..." }
3. [500ms delay]
4. Server: { type: "FILLER_AUDIO", payload: "..." }  ← If needed
5. [LLM processing]
6. Server: { type: "AUDIO_PLAY", payload: "..." }
7. Server: { type: "TURN_DONE" }
```

## Performance

### Timing

- **Filler delay**: 500ms (configurable)
- **S3 fetch**: ~50-100ms
- **Audio size**: ~10-30 KB per filler
- **Playback duration**: 1-2 seconds

### Optimization

- Fillers cached in S3 (no generation delay)
- Async fetch (doesn't block LLM)
- Small file sizes (quick download)
- Pre-generated (no TTS latency)

## Configuration

### Adjust Delay

```typescript
// Default: 500ms
fillerPlayer.start(500, context, callback);

// Faster: 300ms
fillerPlayer.start(300, context, callback);

// Slower: 1000ms
fillerPlayer.start(1000, context, callback);
```

### Add New Fillers

1. Add to `FILLER_PHRASES` in `fillerAudioService.ts`:

```typescript
{
  key: 'new-filler',
  text: 'New filler text',
  language: 'hi-IN'
}
```

2. Generate and upload:

```bash
npm run seed:fillers
```

3. Use in selection logic (optional):

```typescript
// In fillerManager.ts
const customKeys = ['new-filler', 'other-filler'];
const custom = candidates.filter(f => customKeys.includes(f.key));
```

## Monitoring

### Metrics to Track

- **Filler trigger rate**: % of turns that trigger filler
- **Average processing time**: Time from user input to response
- **Filler effectiveness**: User engagement after filler
- **Filler variety**: Distribution of filler usage

### Logging

```typescript
console.log('[FillerManager] Selected filler:', fillerKey);
console.log('[FillerManager] Filler cancelled - response in time');
console.log('[FillerManager] Filler playback complete');
```

### Analytics

```typescript
// Track in conversation state
{
  filler_played: boolean,
  processing_time_ms: number,
  filler_key_used?: string
}
```

## Testing

### Manual Testing

1. Open test UI: `http://localhost:4000/test-voice-pipeline`
2. Start call and speak
3. Observe filler playback in logs
4. Check timing: "⏳ Playing filler audio (thinking...)"

### Simulate Slow Response

```typescript
// In conversationGraph.ts - generateNode
await new Promise(resolve => setTimeout(resolve, 1000)); // Force delay
```

### Test Different Contexts

```typescript
// Objection
userInput: "I'm not interested"
→ Should use thoughtful filler

// Confusion
userInput: "I don't understand"
→ Should use reassuring filler

// Positive
userInput: "Tell me more!"
→ Should use quick filler
```

## Troubleshooting

### Filler Not Playing

Check:
1. Processing time > 500ms?
2. S3 bucket accessible?
3. Filler files uploaded?
4. WebSocket connection active?

### Wrong Filler Selected

Check:
1. Context passed correctly?
2. Language mapping correct?
3. Selection logic in `selectFiller()`?

### Audio Not Playing in Browser

Check:
1. Audio format supported (WAV)?
2. Base64 encoding correct?
3. Browser console for errors?
4. Audio autoplay policy?

## Best Practices

### Do's ✅

- Use context-appropriate fillers
- Avoid repeating same filler consecutively
- Keep filler duration short (1-2 seconds)
- Pre-generate and cache in S3
- Log filler usage for analytics

### Don'ts ❌

- Don't play filler for fast responses (< 500ms)
- Don't use same filler repeatedly
- Don't make fillers too long (> 3 seconds)
- Don't generate fillers on-demand (use cache)
- Don't block conversation flow on filler errors

## Future Enhancements

- [ ] Dynamic delay based on query complexity
- [ ] User preference for filler frequency
- [ ] A/B testing different filler strategies
- [ ] Multi-filler sequences for very long delays
- [ ] Filler audio compression (reduce size)
- [ ] CDN caching for faster delivery
- [ ] Real-time filler generation (fallback)
- [ ] Emotion-based voice modulation
- [ ] Personalized fillers per lead
- [ ] Analytics dashboard for filler effectiveness

## References

- Filler Audio Service: `services/tts/fillerAudioService.ts`
- Filler Manager: `services/conversation/fillerManager.ts`
- Voice Pipeline Handler: `services/conversation/voicePipelineHandler.ts`
- Seed Script: `scripts/seedFillerAudio.ts`
