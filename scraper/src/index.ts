import fs from 'fs/promises';
import path from 'path';
import { PAGES } from './pages.config';
import { scrapePage } from './crawler';
import { chunkText, KnowledgeChunk } from './chunker';
import { embedAndStore } from './embedder';
import { OBJECTION_SEEDS } from './seedObjections';

const OUTPUT_DIR = path.join(__dirname, '../output');
const RAW_DIR = path.join(OUTPUT_DIR, 'raw');
const CHUNKS_FILE = path.join(OUTPUT_DIR, 'chunks.json');

async function ensureDirs() {
  await fs.mkdir(RAW_DIR, { recursive: true });
}

async function runScrape() {
  console.log('--- Starting Scrape Phase ---');
  await ensureDirs();
  const allChunks: KnowledgeChunk[] = [];

  for (const pageConfig of PAGES) {
    const rawText = await scrapePage(pageConfig);
    
    // Save raw output for debugging
    const safeName = pageConfig.url.replace(/https?:\/\//, '').replace(/[^a-zA-Z0-9]/g, '_');
    await fs.writeFile(path.join(RAW_DIR, `${safeName}.txt`), rawText);
    
    // Chunk the text
    const chunks = chunkText(rawText, pageConfig.category);
    allChunks.push(...chunks);
    
    console.log(`Extracted ${chunks.length} chunks from ${pageConfig.url}`);
  }

  await fs.writeFile(CHUNKS_FILE, JSON.stringify(allChunks, null, 2));
  console.log(`\nSaved total ${allChunks.length} chunks to ${CHUNKS_FILE}`);
}

async function runEmbed() {
  console.log('\n--- Starting Embed Phase ---');
  try {
    const data = await fs.readFile(CHUNKS_FILE, 'utf-8');
    const chunks: KnowledgeChunk[] = JSON.parse(data);
    await embedAndStore(chunks);
  } catch (err) {
    console.error('Error reading chunks file. Did you run the scrape phase first?', err);
  }
}

async function runSeed() {
  console.log('\n--- Starting Objection Seed Phase ---');
  await embedAndStore(OBJECTION_SEEDS);
}

async function main() {
  const command = process.argv[2];

  switch (command) {
    case 'scrape':
      await runScrape();
      break;
    case 'embed':
      await runEmbed();
      break;
    case 'seed':
      await runSeed();
      break;
    case 'all':
      await runScrape();
      await runEmbed();
      await runSeed();
      break;
    default:
      console.log(`
Usage:
  npm run scrape        Scrape configured pages to output/raw/
  npm run embed         Embed generated chunks and push to Pinecone
  npm run seed          Push hardcoded objection seeds to Pinecone
  npm run all           Run all three steps sequentially
      `);
  }
}

main().catch(console.error);
