/**
 * knowledge-store.mjs — backend facade for the generated knowledge index.
 *
 * openStore(root) returns the best available backend:
 *   1. sqlite  — .harness/knowledge/knowledge.db when node:sqlite exists
 *                (Node >= 22.5) AND the DB is fresh (generated_at == meta.json)
 *   2. jsonl   — the always-written nodes/edges/chunks/meta projection
 *   3. null    — no index yet (run sync-knowledge.mjs)
 *
 * Both backends expose the same adapter interface:
 *   meta()                            → meta.json contents
 *   counts()                          → {nodes, edges, chunks, embedded_chunks}
 *   chunksForSearch(sliceId?)         → chunk rows (embedding may be Float32Array)
 *   nodeById(id)                      → node object | null
 *   edgesIncident(id)                 → [{from,to,rel,...}] either direction
 *   nodesBySlice(sliceId)             → node objects for one slice
 *   close()                           → release resources (no-op on jsonl)
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { KNOWLEDGE_DIR } from './knowledge-lib.mjs';
import { openSqliteIndex } from './knowledge-store-sqlite.mjs';
import { kuzuAvailable, openKuzuIndex } from './knowledge-store-kuzu.mjs';

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

// JSONL adapter — mtime-cached so a regenerated index is picked up live.
let cache = { root: '', key: '', data: null };

function openJsonlIndex(root) {
  const dir = join(root, KNOWLEDGE_DIR);
  const metaPath = join(dir, 'meta.json');
  if (!existsSync(metaPath)) return null;
  const key = `${root}|${statSync(metaPath).mtimeMs}`;
  if (cache.key === key && cache.data) return cache.data;

  const nodes = readJsonl(join(dir, 'nodes.jsonl'));
  const edges = readJsonl(join(dir, 'edges.jsonl'));
  const chunks = readJsonl(join(dir, 'chunks.jsonl'));
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  const incident = new Map();
  for (const e of edges) {
    for (const id of [e.from, e.to]) {
      if (!incident.has(id)) incident.set(id, []);
      incident.get(id).push(e);
    }
  }

  const adapter = {
    backend: 'jsonl',
    meta: () => meta,
    counts: () => ({
      nodes: nodes.length,
      edges: edges.length,
      chunks: chunks.length,
      embedded_chunks: chunks.filter((c) => Array.isArray(c.embedding)).length,
    }),
    chunksForSearch: (sliceId) =>
      sliceId ? chunks.filter((c) => c.slice_id === sliceId) : chunks,
    nodeById: (id) => nodesById.get(id) ?? null,
    edgesIncident: (id) => incident.get(id) ?? [],
    nodesBySlice: (sliceId) => nodes.filter((n) => n.slice_id === sliceId),
    close: () => {},
  };
  cache = { root, key, data: adapter };
  return adapter;
}

/**
 * Open the best available knowledge index backend for `root`.
 * Precedence: kuzu (graph+vector engine) → sqlite sidecar → JSONL.
 * @returns {Promise<object|null>} adapter or null when no index exists
 */
export async function openStore(root = process.cwd()) {
  if (kuzuAvailable()) {
    try {
      const k = await openKuzuIndex(root);
      if (k) return k;
    } catch {
      // kuzu store broken/missing — fall through
    }
  }
  try {
    const s = openSqliteIndex(root);
    if (s) return s;
  } catch {
    // sqlite sidecar broken/missing — fall back to JSONL
  }
  return openJsonlIndex(root);
}

export { sqliteSupported } from './knowledge-store-sqlite.mjs';
export { kuzuAvailable } from './knowledge-store-kuzu.mjs';
