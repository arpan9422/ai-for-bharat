import dotenv from 'dotenv';

dotenv.config();

/**
 * 1. Input Guardrail — rule-based, no LLM (saves ~2s per turn)
 * Only blocks clearly off-topic messages. Fails open for anything ambiguous.
 */
export async function checkInputRelevance(userMessage: string): Promise<boolean> {
  const t = userMessage.toLowerCase().trim();

  // Very short inputs are always fine (yes/no/haan/ok)
  if (t.length < 15) return true;

  // Hard block list — clearly off-topic domains
  const offTopicPatterns = [
    /\b(recipe|cooking|cricket|football|movie|song|weather|politics|religion)\b/i,
    /\b(write.*code|python|javascript|html|css|sql)\b/i,
    /\b(joke|funny|meme)\b/i,
  ];

  for (const pattern of offTopicPatterns) {
    if (pattern.test(t)) {
      console.log('[Guardrails] Input blocked by rule:', pattern.source);
      return false;
    }
  }

  return true;
}

/**
 * 2. Web Search Result Guardrail — rule-based filter
 */
export async function filterWebSearchResults(searchResults: string[]): Promise<string[]> {
  const competitorPattern = /\b(zerodha|groww|upstox|angel\s*one|5paisa|sharekhan)\b.*\b(better|best|top|#1|leading)\b/gi;
  return searchResults
    .map(r => r.replace(competitorPattern, '[competitor removed]'))
    .filter(r => r.trim().length > 0);
}

/**
 * 3. Output Guardrail — regex-based compliance word replacement
 */
export async function sanitizeOutput(agentResponse: string): Promise<string> {
  const replacements: [RegExp, string][] = [
    [/\bguarantee[d]?\b/gi, 'aim to provide'],
    [/\b100%\s*sure\b/gi, 'confident'],
    [/\bzero[\s-]risk\b/gi, 'managed risk'],
    [/\brisk[\s-]free\b/gi, 'managed risk'],
    [/\bpromise\b/gi, 'strive to'],
  ];
  let result = agentResponse;
  for (const [pattern, replacement] of replacements) {
    result = result.replace(pattern, replacement);
  }
  return result;
}
