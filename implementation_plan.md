# Voice Agent — Call System Implementation Plan

Reference: doc_content.txt | Rupeezy AP Program AI Voice Agent

---

## What needs to be built

The test pipeline works. Now we need the actual production call brain:
1. Temp memory (per-call session)
2. Proper Priya persona prompt
3. Starting scripts (per lead profile)
4. Decision rules (objection detection, stage transitions, scoring triggers)
5. Post-call summary + handoff

---

## Component Map

```
voiceController.ts  (orchestrator — already exists, needs wiring)
│
├── sessionStore.ts         (temp memory — Redis, already exists, needs schema)
├── promptBuilder.ts        (NEW — builds full system prompt per turn)
├── startingScript.ts       (NEW — opening line based on lead profile)
├── decisionEngine.ts       (NEW — stage machine + objection detection)
├── scoringEngine.ts        (exists — needs real-time update wiring)
└── callSummary.ts          (NEW — post-call summary generation)
```

---

## 1. Temp Memory — `sessionStore.ts`

**What it holds (per call session, keyed by callId):**

```ts
type CallSession = {
  leadId: string
  phone: string
  language: 'hindi' | 'hinglish' | 'english'
  stage: CallStage           // current conversation stage
  history: Message[]         // full turn history
  objectionsRaised: string[] // which of the 5 objections came up
  objectionsResolved: string[]
  runningScore: ScoreBreakdown
  turnCount: number
  startedAt: number          // epoch ms
  callScript?: string        // RM-defined opening (from Lead.callScript)
}

type CallStage =
  | 'greeting'
  | 'pitch'
  | 'objection_handling'
  | 'qualification'
  | 'closing'
  | 'ended'
```

**Storage:** Redis (TTL 2 hours). On call end, flush to Postgres `Call` table.

**Actions needed in `sessionStore.ts`:**
- `initSession(callId, lead)` — already exists, extend schema
- `getSession(callId)` — return full `CallSession`
- `updateSession(callId, patch)` — partial update
- `appendMessage(callId, role, content)` — already exists
- `advanceStage(callId, newStage)` — update stage
- `addObjection(callId, objection)` — track raised objections
- `resolveObjection(callId, objection)` — mark resolved

---

## 2. Proper Priya Prompt — `promptBuilder.ts`

**Structure of the system prompt (rebuilt every turn):**

```
[PERSONA]
You are Priya, a warm and confident partner relationship executive at Rupeezy.
Speak naturally. Keep responses under 3 sentences unless explaining a benefit.
Use natural fillers: "haan", "bilkul", "dekho", "acha".
Never sound like a script reader.

[LANGUAGE]
Current language: {hindi | hinglish | english}
Switch seamlessly if the lead changes language. Do not announce the switch.

[STAGE INSTRUCTION]
Current stage: {stage}
Stage-specific instruction: {stageInstruction}

[LEAD CONTEXT]
Name: {name}
Background: {background} (MFD / insurance agent / sub-broker / etc.)
Current broker: {occupation}
Score so far: {score}/100
Objections raised: {objectionsRaised}
Objections resolved: {objectionsResolved}

[KNOWLEDGE BASE]
{ragChunks}  ← injected per turn from Pinecone

[RULES]
- Never fabricate product facts not in the knowledge base
- Never be pushy. If lead says stop, close gracefully.
- If lead asks for a link, confirm WhatsApp number and close
- If score >= 75, suggest RM callback
```

**Stage instructions (injected based on current stage):**

| Stage | Instruction injected |
|-------|---------------------|
| `greeting` | Greet warmly, confirm identity, deliver opening hook |
| `pitch` | Pitch the 3 core benefits: 100% brokerage, daily payout, zero joining fee |
| `objection_handling` | Objection detected: {objection}. Acknowledge, reframe using knowledge base |
| `qualification` | Gauge interest level. Ask one qualifying question. |
| `closing` | Lead is {HOT/WARM/COLD}. Close appropriately. |

---

## 3. Starting Scripts — `startingScript.ts`

Opening line is the highest-leverage moment. Personalised by lead profile.

**Logic:**
```
if lead.callScript exists (RM-defined) → use that
else → generate from profile template
```

**Profile templates:**

| Lead type | Opening |
|-----------|---------|
| MFD / distributor | "Namaste {name}! Main Priya bol rahi hoon Rupeezy se. Aap already distribution mein hain — ek cheez poochhna tha, aapka current broker aapko kitna brokerage share deta hai?" |
| Insurance agent | "Namaste {name}! Rupeezy ki taraf se call kar rahi hoon. Aap insurance mein hain — kya aapne kabhi equity distribution bhi explore kiya hai? Ek interesting opportunity hai." |
| Sub-broker | "Namaste {name}! Main Priya hoon Rupeezy se. Aap already market mein hain — toh directly poochhti hoon: kya aap 100% brokerage share aur daily payout mein interested honge?" |
| Unknown | "Namaste! Main Priya bol rahi hoon Rupeezy ki taraf se — ek partner program ke baare mein baat karni thi jo aapke liye relevant ho sakta hai. Kya aapke paas 2 minute hain?" |

**Language variant:** same templates in English/Hinglish based on detected language.

---

## 4. Decision Engine — `decisionEngine.ts`

Runs after every turn. Returns stage transition + scoring signal.

### 4.1 Stage Machine

```
greeting → pitch           (after identity confirmed)
pitch → objection_handling (if objection keyword detected)
pitch → qualification      (after pitch delivered, no objection)
objection_handling → pitch (objection resolved, resume pitch)
objection_handling → qualification (all objections handled)
qualification → closing    (intent signal detected OR turn count > 12)
closing → ended            (call wrapped up)
```

### 4.2 Objection Detection

Run a lightweight LLM classifier (or keyword + semantic match) on each user turn:

```ts
type Objection =
  | 'already_with_broker'    // "main pehle se ek broker ke saath hoon"
  | 'not_enough_contacts'    // "mere paas contacts nahi hain"
  | 'client_support_concern' // "agar mere clients ko problem hogi"
  | 'trust_concern'          // "rupeezy kya hai, trusted hai?"
  | 'defer_decision'         // "soochna padega / baad mein call karo"
```

Detection prompt (fast, single-turn):
```
Classify this lead response into one of: already_with_broker | not_enough_contacts |
client_support_concern | trust_concern | defer_decision | none
Response: "{userTurn}"
Return JSON: { "objection": "..." }
```

### 4.3 Intent Signals (for scoring)

Detect per turn:
- `stated_intent`: "link bhejo", "kaise join karein", "sign up karna hai"
- `positive_affirmation`: "haan", "bilkul", "sounds good", "interesting hai"
- `asked_followup`: question about process, payout, onboarding
- `enthusiasm`: exclamation, "wah", "acha", "really?"

### 4.4 Turn-level scoring update

After each turn, call `computeScore()` with updated signals and persist to session.

---

## 5. Post-Call Summary — `callSummary.ts`

Generated at call end. Stored in `Call.summary` (JSON).

**Schema:**
```ts
type CallSummary = {
  leadName: string
  language: string
  durationSeconds: number
  finalScore: number
  status: 'HOT' | 'WARM' | 'COLD'
  keyPoints: string[]        // 3-5 bullet points of what was discussed
  objectionsRaised: string[]
  objectionsResolved: string[]
  statedIntent: string | null // exact quote if lead expressed interest
  recommendedRMOpener: string // suggested first sentence for RM follow-up
  nextAction: 'rm_queue' | 'whatsapp' | 'nurture'
}
```

**Generation:** single LLM call at call end with full transcript + scoring data.

**RM opener generation prompt:**
```
Given this conversation summary and lead profile, write one natural opening sentence
an RM should use when calling this lead back. Reference something specific from the
conversation. Language: {language}.
```

---

## 6. Handoff Actions — `handoffService.ts`

Triggered at call end based on final score:

| Score | Action |
|-------|--------|
| ≥ 75 (HOT) | Add to RM priority queue. Push full summary card to dashboard. |
| 45–74 (WARM) | Send WhatsApp message with program summary + sign-up link. |
| < 45 (COLD) | Tag in CRM. Schedule re-engage in 7 days. |

---

## Build Order

```
Week 1 — Core brain
  Day 1: sessionStore schema extension
  Day 2: promptBuilder + startingScript
  Day 3: decisionEngine (stage machine + objection detection)
  Day 4: Wire into voiceController — replace current stub logic
  Day 5: End-to-end test with real lead data

Week 2 — Intelligence + handoff
  Day 1: Real-time scoring update per turn
  Day 2: callSummary generation
  Day 3: handoffService (RM queue + WhatsApp trigger)
  Day 4: RM dashboard cards with summary data
  Day 5: Multi-turn memory (returning lead context load)
```

---

## Files to create

```
apps/backend/src/services/
  conversation/
    promptBuilder.ts      ← system prompt assembly
    startingScript.ts     ← opening line generator
    decisionEngine.ts     ← stage machine + objection detection
    callSummary.ts        ← post-call summary + RM opener
    handoffService.ts     ← score-based routing actions

apps/backend/src/services/memory/
  sessionStore.ts         ← extend existing with full CallSession schema
```

---

## Notes

- `voiceController.ts` is the orchestrator — all new services plug into it
- Keep each service independently testable
- Decision engine should be fast — use `OLLAMA_MODEL_FAST` for classification calls
- Scoring runs after every turn, not just at call end
- Multi-turn memory: on `initSession`, check Postgres for prior calls on same phone number and load last session context
