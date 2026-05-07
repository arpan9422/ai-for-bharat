import Redis from 'ioredis';
import dotenv from 'dotenv';
import { ConversationMessage } from '../llm/llmService';
import { generateSimpleReply } from '../llm/llmService';

dotenv.config();

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const TTL_SECONDS = 3600; // 1 hour
const MAX_HISTORY_PAIRS = 5; // Keep last 5 user-assistant pairs (10 messages)

export async function initSession(callId: string, leadContext: any): Promise<void> {
  const key = `session:${callId}`;
  const summaryKey = `summary:${callId}`;
  
  await redis.set(key, JSON.stringify([]), 'EX', TTL_SECONDS);
  await redis.set(summaryKey, '', 'EX', TTL_SECONDS);
  await redis.set(`context:${callId}`, JSON.stringify(leadContext), 'EX', TTL_SECONDS);
}

/**
 * Summarize old conversation history into a concise summary
 */
async function summarizeHistory(messages: ConversationMessage[]): Promise<string> {
  try {
    const conversationText = messages
      .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n');
    
    const prompt = `Summarize the following conversation in 2-3 sentences. Focus on key topics discussed and user's main questions/concerns:

${conversationText}

Summary:`;

    const summary = await generateSimpleReply(prompt, 'You are a conversation summarizer. Create concise, factual summaries.');
    
    console.log('[SessionStore] Generated summary:', summary);
    return summary;
  } catch (error) {
    console.error('[SessionStore] Summarization error:', error);
    // Fallback: simple concatenation
    return messages.map(m => m.content).join('. ').substring(0, 200) + '...';
  }
}

/**
 * Append message and maintain sliding window with async summarization
 */
export async function appendMessage(callId: string, role: 'user' | 'assistant' | 'system', content: string): Promise<void> {
  const key = `session:${callId}`;
  const summaryKey = `summary:${callId}`;
  
  const historyStr = await redis.get(key);
  const history: ConversationMessage[] = historyStr ? JSON.parse(historyStr) : [];
  
  // Add new message
  history.push({ role, content });
  
  // Check if we need to summarize (more than MAX_HISTORY_PAIRS * 2 messages)
  const maxMessages = MAX_HISTORY_PAIRS * 2;
  
  if (history.length > maxMessages) {
    console.log(`[SessionStore] History size (${history.length}) exceeds limit (${maxMessages}), triggering summarization`);
    
    // Get current summary
    const currentSummary = await redis.get(summaryKey) || '';
    
    // Calculate how many messages to summarize
    const messagesToSummarize = history.slice(0, history.length - maxMessages);
    const remainingMessages = history.slice(history.length - maxMessages);
    
    console.log(`[SessionStore] Summarizing ${messagesToSummarize.length} old messages, keeping ${remainingMessages.length} recent messages`);
    
    // Trigger async summarization (don't await - fire and forget)
    summarizeOldMessages(callId, summaryKey, currentSummary, messagesToSummarize).catch(err => {
      console.error('[SessionStore] Async summarization failed:', err);
    });
    
    // Update history with only recent messages
    await redis.set(key, JSON.stringify(remainingMessages), 'EX', TTL_SECONDS);
  } else {
    // Just update history
    await redis.set(key, JSON.stringify(history), 'EX', TTL_SECONDS);
  }
}

/**
 * Async function to summarize old messages and append to summary
 */
async function summarizeOldMessages(
  callId: string,
  summaryKey: string,
  currentSummary: string,
  oldMessages: ConversationMessage[]
): Promise<void> {
  try {
    const newSummary = await summarizeHistory(oldMessages);
    
    // Append to existing summary
    const updatedSummary = currentSummary 
      ? `${currentSummary}\n\n[Earlier conversation]: ${newSummary}`
      : `[Earlier conversation]: ${newSummary}`;
    
    await redis.set(summaryKey, updatedSummary, 'EX', TTL_SECONDS);
    
    console.log(`[SessionStore] Updated summary for ${callId}`);
  } catch (error) {
    console.error('[SessionStore] Failed to update summary:', error);
  }
}

/**
 * Get full conversation context (summary + recent history)
 */
export async function getHistory(callId: string): Promise<ConversationMessage[]> {
  const key = `session:${callId}`;
  const summaryKey = `summary:${callId}`;
  
  const historyStr = await redis.get(key);
  const history: ConversationMessage[] = historyStr ? JSON.parse(historyStr) : [];
  
  // Get summary if it exists
  const summary = await redis.get(summaryKey);
  
  if (summary && summary.trim()) {
    // Prepend summary as a system message
    return [
      { role: 'system', content: `Previous conversation summary: ${summary}` },
      ...history
    ];
  }
  
  return history;
}

/**
 * Get just the recent messages without summary
 */
export async function getRecentHistory(callId: string): Promise<ConversationMessage[]> {
  const key = `session:${callId}`;
  const historyStr = await redis.get(key);
  return historyStr ? JSON.parse(historyStr) : [];
}

/**
 * Get just the summary
 */
export async function getSummary(callId: string): Promise<string> {
  const summaryKey = `summary:${callId}`;
  return await redis.get(summaryKey) || '';
}

export async function getLeadContext(callId: string): Promise<any> {
  const ctxStr = await redis.get(`context:${callId}`);
  return ctxStr ? JSON.parse(ctxStr) : null;
}

/**
 * Clear session (for testing)
 */
export async function clearSession(callId: string): Promise<void> {
  await redis.del(`session:${callId}`);
  await redis.del(`summary:${callId}`);
  await redis.del(`context:${callId}`);
}
