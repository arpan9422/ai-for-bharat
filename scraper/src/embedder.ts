import { Pinecone } from '@pinecone-database/pinecone';
import { createId } from '@paralleldrive/cuid2';
import { KnowledgeChunk } from './chunker';
import dotenv from 'dotenv';

dotenv.config();

const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_INDEX = process.env.PINECONE_INDEX || 'rupeezy-knowledge';
const EMBEDDING_MODEL = 'text-embedding-3-small'; // Standard default, adjust if AICredits expects something else

async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.AICREDITS_API_KEY;
  const body = JSON.stringify({ model: EMBEDDING_MODEL, input: texts });

  const response = await fetch("https://api.aicredits.in/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`AICredits API error: ${response.statusText} - ${await response.text()}`);
  }

  const json = await response.json() as any;
  return json.data.map((d: any) => d.embedding);
}

export async function embedAndStore(chunks: KnowledgeChunk[]) {
  if (!PINECONE_API_KEY) {
    console.warn('⚠️ PINECONE_API_KEY is not set. Skipping Pinecone upload.');
    return;
  }

  const pc = new Pinecone({ apiKey: PINECONE_API_KEY });
  const index = pc.index(PINECONE_INDEX);
  
  console.log(`Starting embedding for ${chunks.length} chunks...`);

  const batchSize = 100;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    
    try {
      const texts = batch.map(c => c.content);
      const embeddings = await generateEmbeddingsBatch(texts);

      const vectors = batch.map((chunk, idx) => ({
        id: createId(),
        values: embeddings[idx],
        metadata: { 
          content: chunk.content, 
          category: chunk.category 
        },
      }));

      await index.upsert(vectors);
      console.log(`Processed and upserted ${i + batch.length}/${chunks.length} chunks...`);
    } catch (err) {
      console.error(`Error embedding batch starting at chunk ${i}:`, err);
    }
  }

  console.log('✅ Embedding and upload complete!');
}
