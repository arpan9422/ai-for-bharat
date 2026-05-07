export interface KnowledgeChunk {
  content: string;
  category: string;
}

export function chunkText(text: string, category: string): KnowledgeChunk[] {
  // Normalize whitespace
  const cleanText = text.replace(/\s+/g, ' ').trim();
  
  // Split into rough sentences based on punctuation, keeping the delimiter
  const sentences = cleanText.split(/(?<=[.!?|।])\s+/);
  
  const chunks: KnowledgeChunk[] = [];
  let currentChunk = '';
  
  // ~400 characters per chunk as a rough approximation of 100-200 tokens
  const CHUNK_SIZE_CHARS = 400;

  for (const sentence of sentences) {
    if ((currentChunk + ' ' + sentence).length > CHUNK_SIZE_CHARS) {
      if (currentChunk) {
        chunks.push({ content: currentChunk.trim(), category });
      }
      currentChunk = sentence;
    } else {
      currentChunk = currentChunk ? `${currentChunk} ${sentence}` : sentence;
    }
  }
  
  if (currentChunk) {
    chunks.push({ content: currentChunk.trim(), category });
  }
  
  return chunks;
}
