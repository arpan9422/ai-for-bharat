import { Pinecone } from '@pinecone-database/pinecone';

const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_INDEX = process.env.PINECONE_INDEX || 'rupeezy-knowledge';
const EMBEDDING_MODEL = 'text-embedding-3-small'; // Adjust if using different model for retrieval

export async function retrieveRelevantChunks(
  query: string,
  topK = 3
): Promise<string[]> {
  if (!PINECONE_API_KEY) {
    console.warn('PINECONE_API_KEY not set. Skipping RAG retrieval.');
    return [];
  }

  const pc = new Pinecone({ apiKey: PINECONE_API_KEY });
  const index = pc.index(PINECONE_INDEX);

  try {
    // Embed the query via AICredits API (matching scraper logic)
    const apiKey = process.env.AICREDITS_API_KEY;
    const embRes = await fetch("https://api.aicredits.in/v1/embeddings", {
      method: 'POST',
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: [query] }),
    });

    if (!embRes.ok) {
      throw new Error(`Embedding API error: ${embRes.statusText}`);
    }

    const json = await embRes.json() as any;
    const embedding = json.data[0].embedding;

    // Query Pinecone — returns top-K nearest vectors + metadata + scores
    const queryRes = await index.query({
      vector: embedding,
      topK,
      includeMetadata: true,
      includeValues: false,
    });

    const matches = queryRes.matches || [];
    const bestScore = matches.length > 0 ? (matches[0].score || 0) : 0;

    // Skip Tavily fallback — it adds 8-10s latency and Pinecone index may be empty
    // When Pinecone has data, lower threshold will return relevant chunks
    const RELEVANCE_THRESHOLD = 0.30;

    if (bestScore < RELEVANCE_THRESHOLD) {
      console.log(`RAG score (${bestScore.toFixed(3)}) below threshold. Skipping (no fallback).`);
      return [];
    }

    // Extract the stored text content from metadata
    return matches
      .map(m => m.metadata?.content as string)
      .filter(Boolean);
  } catch (error) {
    console.error('Error during RAG retrieval:', error);
    return [];
  }
}

async function tavilySearch(query: string): Promise<string[]> {
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API?.trim(),
        query: query,
        search_depth: 'basic',
        include_answer: true,
        max_results: 3
      })
    });

    if (!res.ok) {
      console.error('Tavily API error:', await res.text());
      return [];
    }

    const data = await res.json() as any;

    const results: string[] = [];
    if (data.answer) {
      results.push(`Web Answer: ${data.answer}`);
    }

    if (data.results && Array.isArray(data.results)) {
      data.results.forEach((r: any) => {
        results.push(`Source (${r.url}): ${r.content}`);
      });
    }

    return results;
  } catch (error) {
    console.error('Tavily Search failed:', error);
    return [];
  }
}
