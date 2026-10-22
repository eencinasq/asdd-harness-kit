#!/usr/bin/env node
/**
 * sync-knowledge.mjs — regenerate the knowledge index from .harness/ SoT.
 *
 * Usage:
 *   node .harness/scripts/sync-knowledge.mjs [--status] [--embed] [--backend=jsonl|sqlite|auto]
 *
 * Writes (GENERATED — never hand-edited):
 *   .harness/knowledge/nodes.jsonl    — slices, spec docs, REQs, ACs, features, files, sessions
 *   .harness/knowledge/edges.jsonl    — traceability / ownership / dependency
 *   .harness/knowledge/chunks.jsonl   — embeddable text units (hash-deduped)
 *   .harness/knowledge/meta.json      — generated_at, counts, embedding status
 *
 * Embeddings (optional): with --embed, chunks get an `embedding` field via an
 * OpenAI-compatible endpoint:
 *   KNOWLEDGE_EMBEDDINGS_URL    e.g. http://localhost:11434/v1/embeddings (Ollama)
 *   KNOWLEDGE_EMBEDDINGS_MODEL  e.g. nomic-embed-text
 *   KNOWLEDGE_EMBEDDINGS_KEY    optional bearer token
 * Existing embeddings are preserved by (id, hash) — only new/changed chunks are
 * embedded, so --embed is resumable and incremental. Without embeddings the
 * MCP server falls back to lexical search.
 *
 * Backend: JSONL is always written (portable interchange). With --backend=auto
 * (default) a SQLite sidecar (.harness/knowledge/knowledge.db) is also written
 * when node:sqlite is available (Node >= 22.5); --backend=jsonl disables it,
 * --backend=sqlite requires it. The MCP server prefers the sqlite sidecar.
 *
 * Called automatically at the end of sync-state.mjs runs (embeddings never
 * requested there — only preserved); use this script's --embed to (re)vectorize.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { scanKnowledge, KNOWLEDGE_DIR } from './knowledge-lib.mjs';
import { sqliteSupported, writeSqliteIndex } from './knowledge-store-sqlite.mjs';
import { kuzuAvailable, writeKuzuIndex } from './knowledge-store-kuzu.mjs';
import { loadEnv } from './env-loader.mjs';

loadEnv(); // KNOWLEDGE_EMBEDDINGS_* may live in .env/.env.local

function writeJsonl(path, rows) {
  writeFileSync(path, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));
}

function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

// Carry over embeddings for unchanged chunks — keyed by (id, content hash),
// so a plain re-sync never destroys vectors produced by an earlier --embed.
function preserveEmbeddings(root, chunks) {
  const previous = readJsonl(join(root, KNOWLEDGE_DIR, 'chunks.jsonl'));
  if (previous.length === 0) return 0;
  const vectors = new Map();
  for (const c of previous) {
    if (Array.isArray(c.embedding)) vectors.set(`${c.id}|${c.hash}`, c.embedding);
  }
  let carried = 0;
  for (const c of chunks) {
    if (c.embedding === undefined && vectors.has(`${c.id}|${c.hash}`)) {
      c.embedding = vectors.get(`${c.id}|${c.hash}`);
      carried += 1;
    }
  }
  return carried;
}

async function embedChunks(chunks) {
  const url = process.env.KNOWLEDGE_EMBEDDINGS_URL;
  const model = process.env.KNOWLEDGE_EMBEDDINGS_MODEL;
  if (!url || !model) {
    return { embedded: 0, reason: 'KNOWLEDGE_EMBEDDINGS_URL/MODEL not set' };
  }
  const headers = { 'content-type': 'application/json' };
  if (process.env.KNOWLEDGE_EMBEDDINGS_KEY) {
    headers.authorization = `Bearer ${process.env.KNOWLEDGE_EMBEDDINGS_KEY}`;
  }
  const pending = chunks.filter((c) => !Array.isArray(c.embedding));
  if (pending.length === 0) return { embedded: 0, reason: 'all chunks already embedded' };

  let embedded = 0;
  const batchSize = 32;
  for (let i = 0; i < pending.length; i += batchSize) {
    const batch = pending.slice(i, i + batchSize);
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, input: batch.map((c) => c.text) }),
    });
    if (!res.ok) {
      return { embedded, reason: `embedding endpoint ${res.status} — ${pending.length - embedded} chunks left unembedded` };
    }
    const data = await res.json();
    for (let j = 0; j < batch.length; j += 1) {
      const vec = data?.data?.[j]?.embedding;
      if (Array.isArray(vec)) {
        batch[j].embedding = vec;
        embedded += 1;
      }
    }
  }
  return { embedded };
}

/**
 * Scan .harness/ and write the knowledge index.
 * @param {string} root project root
 * @param {{ embed?: boolean, backend?: 'auto'|'jsonl'|'sqlite' }} opts
 * @returns {Promise<object>} meta written to meta.json
 */
export async function writeKnowledgeIndex(root = process.cwd(), { embed = false, backend = 'auto' } = {}) {
  const { nodes, edges, chunks, stats } = scanKnowledge(root);

  const carried = preserveEmbeddings(root, chunks);
  let embeddingInfo = { embedded: 0, carried, reason: 'skipped (pass --embed)' };
  if (embed) {
    embeddingInfo = { ...(await embedChunks(chunks)), carried };
  }
  embeddingInfo.total = chunks.filter((c) => Array.isArray(c.embedding)).length;

  const outDir = join(root, KNOWLEDGE_DIR);
  mkdirSync(outDir, { recursive: true });
  writeJsonl(join(outDir, 'nodes.jsonl'), nodes);
  writeJsonl(join(outDir, 'edges.jsonl'), edges);
  writeJsonl(join(outDir, 'chunks.jsonl'), chunks);

  const meta = {
    schema_version: '1.0',
    generated_at: new Date().toISOString(),
    source: 'scanKnowledge(.harness/)',
    ...stats,
    embeddings: embeddingInfo,
  };
  writeFileSync(join(outDir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);

  // Embedded tier: query-optimized backends alongside the JSONL.
  // kuzu = required embedded graph+vector engine; sqlite = node:sqlite sidecar
  // (with sqlite-vec ANN table when the extension is installed).
  meta.backends = ['jsonl'];
  if (backend !== 'jsonl') {
    if (kuzuAvailable()) {
      const { dim } = await writeKuzuIndex(root, { nodes, edges, chunks, meta });
      meta.backends.push('kuzu');
      if (dim) meta.vec_dim = dim;
    } else if (backend === 'kuzu') {
      throw new Error('--backend=kuzu requires the kuzu package (npm i kuzu)');
    } else {
      meta.kuzu_skipped = 'kuzu package not installed';
    }

    if (backend !== 'kuzu' && sqliteSupported()) {
      writeSqliteIndex(root, { nodes, edges, chunks, meta });
      meta.backends.push('sqlite');
    } else if (backend === 'sqlite' && !sqliteSupported()) {
      throw new Error('--backend=sqlite requires node:sqlite (Node >= 22.5)');
    }
  }
  writeFileSync(join(outDir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
  return meta;
}

function argValue(args, name) {
  const eq = args.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const root = process.cwd();
  const args = process.argv.slice(2);
  const backend = argValue(args, '--backend') ?? 'auto';
  if (!['auto', 'jsonl', 'sqlite', 'kuzu'].includes(backend)) {
    console.error(`unknown --backend: ${backend} (auto|jsonl|sqlite|kuzu)`);
    process.exit(1);
  }

  if (args.includes('--status')) {
    const metaPath = join(root, KNOWLEDGE_DIR, 'meta.json');
    const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : null;
    console.log(meta ? JSON.stringify(meta, null, 2) : 'no knowledge index — run sync-knowledge.mjs');
    return;
  }

  const meta = await writeKnowledgeIndex(root, { embed: args.includes('--embed'), backend });
  console.log(
    `WRITE ${KNOWLEDGE_DIR}/ — ${meta.nodes} nodes, ${meta.edges} edges, ${meta.chunks} chunks, ${meta.embeddings.total} embedded [${(meta.backends ?? []).join('+')}]`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`sync-knowledge failed: ${error?.message ?? error}`);
    process.exit(1);
  });
}
