#!/usr/bin/env node
/**
 * knowledge-query.mjs — read the generated knowledge index (.harness/knowledge/, built by sync-knowledge.mjs)
 * and the learning loop. This is what agents and skills run; the `knowledge` MCP server (tools/knowledge)
 * vendors this file, so both give the same answers.
 *
 *   asdd knowledge status
 *   asdd knowledge search "<query>" [--k 5] [--slice <id>]
 *   asdd knowledge trace <node-id> [--depth 2]      e.g. req:<slice>:REQ-001, file:<path>
 *   asdd knowledge slice <slice-id>
 *   asdd knowledge patterns [--status open|watching|proposed|accepted|rejected|applied|verified]
 *
 * Prints JSON. Exit 1 when there is no index (run sync-knowledge.mjs) or the arguments are invalid.
 * Search is semantic (exact cosine) when the index has embeddings and
 * KNOWLEDGE_EMBEDDINGS_URL/MODEL are set (also read from .env / .env.local); otherwise lexical.
 * Degradations are listed in `warnings` and printed to stderr, never hidden.
 */
import { openStore } from './knowledge-store.mjs';
import { derivePatterns, failureSignatures } from './learning-lib.mjs';
import { loadEnv } from './env-loader.mjs';

export const PATTERN_STATUSES = ['open', 'watching', 'proposed', 'accepted', 'rejected', 'applied', 'verified'];

const NO_INDEX = {
  payload: { error: 'no knowledge index — run: asdd knowledge sync' },
  failed: true,
};

const warn = (message) => {
  process.stderr.write(`knowledge: ${message}\n`);
  return message;
};

const STOPWORDS = new Set(
  'the a an and or of to in on for with by is are was were be been shall when if then that this it its as at from'.split(' ')
);

export const tokenize = (text) =>
  String(text)
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúñü_-]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));

/** 70% query coverage + 30% term frequency (capped), 0 when nothing overlaps. */
export const lexicalScore = (queryTokens, text) => {
  const docTokens = tokenize(text);
  if (docTokens.length === 0 || queryTokens.length === 0) return 0;
  const querySet = new Set(queryTokens);
  const docSet = new Set(docTokens);
  let overlap = 0;
  for (const t of queryTokens) if (docSet.has(t)) overlap += 1;
  const coverage = overlap / querySet.size;
  const tf = docTokens.filter((t) => querySet.has(t)).length / docTokens.length;
  return coverage * 0.7 + Math.min(tf * 20, 1) * 0.3;
};

export const cosine = (a, b) => {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
};

export const clampK = (k) => Math.max(1, Math.min(Math.trunc(Number(k)) || 5, 25));
export const clampDepth = (d) => Math.max(1, Math.min(Math.trunc(Number(d)) || 2, 4));

const embeddingsConfigured = () => Boolean(process.env.KNOWLEDGE_EMBEDDINGS_URL && process.env.KNOWLEDGE_EMBEDDINGS_MODEL);
const hasVector = (c) => Boolean(c.embedding?.length);
const strip = (rows) => rows.map(({ embedding: _e, ...rest }) => rest);

/** Embed the query with the OpenAI-compatible endpoint the index was built with. */
async function embedQuery(text) {
  const url = process.env.KNOWLEDGE_EMBEDDINGS_URL;
  const model = process.env.KNOWLEDGE_EMBEDDINGS_MODEL;
  if (!url || !model) return { vector: null, error: 'index has embeddings but KNOWLEDGE_EMBEDDINGS_URL/MODEL are not set' };
  const headers = { 'content-type': 'application/json' };
  if (process.env.KNOWLEDGE_EMBEDDINGS_KEY) headers.authorization = `Bearer ${process.env.KNOWLEDGE_EMBEDDINGS_KEY}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, input: [text] }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { vector: null, error: `query embedding failed: endpoint returned ${res.status}` };
    const data = await res.json();
    const vector = data?.data?.[0]?.embedding;
    return Array.isArray(vector) ? { vector } : { vector: null, error: 'query embedding failed: response has no data[0].embedding' };
  } catch (error) {
    return { vector: null, error: `query embedding failed: ${error instanceof Error ? error.message : error}` };
  }
}

/** Open the best backend for one call (sqlite → JSONL), closing it afterwards. */
async function withIndex(root, run) {
  loadEnv(root); // KNOWLEDGE_EMBEDDINGS_* may live in the gitignored .env / .env.local
  const index = await openStore(root);
  if (!index) return NO_INDEX;
  const warnings = [];
  if (index.fallback_reason) warnings.push(warn(`serving JSONL: ${index.fallback_reason}`));
  try {
    return await run(index, warnings);
  } finally {
    index.close();
  }
}

/** Every answer is `{ payload, failed }`. */
export function status(root) {
  return withIndex(root, async (index, warnings) => {
    const counts = await index.counts();
    const embedded = (counts.embedded_chunks ?? 0) > 0;
    if (embedded && !embeddingsConfigured()) {
      warnings.push('index has embeddings but KNOWLEDGE_EMBEDDINGS_URL/MODEL are not set — searches are lexical');
    }
    const meta = index.meta();
    return {
      payload: {
        backend: index.backend,
        generated_at: meta?.generated_at ?? null,
        stats: meta ?? {},
        ...counts,
        search_mode: embedded && embeddingsConfigured() ? 'semantic' : 'lexical',
        warnings,
      },
      failed: false,
    };
  });
}

/** Semantic (exact cosine) when the index has vectors and the query embeds; else lexical. No npm dependency. */
export function search(root, query, { k = 5, sliceId } = {}) {
  return withIndex(root, async (index, warnings) => {
    const pool = await index.chunksForSearch(sliceId);
    const { vector, error } = pool.some(hasVector) ? await embedQuery(query) : { vector: null };
    if (error) warnings.push(warn(`${error} — fell back to lexical search`));
    if (vector) {
      const results = pool
        .filter(hasVector)
        .map((c) => ({ ...c, score: cosine(vector, c.embedding) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, k);
      return { payload: { results: strip(results), search_mode: 'semantic-cosine', warnings }, failed: false };
    }
    const tokens = tokenize(query);
    const results = pool
      .map((c) => ({ ...c, score: lexicalScore(tokens, c.text) }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
    return { payload: { results: strip(results), search_mode: 'lexical', warnings }, failed: false };
  });
}

/** Breadth-first walk over traceability edges, both directions, up to `depth` hops. */
export function trace(root, startId, { depth = 2 } = {}) {
  return withIndex(root, async (index) => {
    const seenNodes = new Set([startId]);
    const seenEdges = new Set();
    const edges = [];
    let frontier = [startId];
    for (let d = 0; d < depth && frontier.length; d += 1) {
      const next = [];
      for (const id of frontier) {
        for (const e of await index.edgesIncident(id)) {
          const key = `${e.from}|${e.rel}|${e.to}`;
          if (!seenEdges.has(key)) {
            seenEdges.add(key);
            edges.push(e);
          }
          const other = e.from === id ? e.to : e.from;
          if (!seenNodes.has(other)) {
            seenNodes.add(other);
            next.push(other);
          }
        }
      }
      frontier = next;
    }
    const start = await index.nodeById(startId);
    const nodes = [];
    for (const id of seenNodes) {
      const n = await index.nodeById(id);
      if (n) nodes.push(n);
    }
    return { payload: { start, found: start !== null, nodes, edges }, failed: false };
  });
}

/** Context bundle for one slice: spec docs, requirements, criteria, features, session count, log entries. */
export function slice(root, sliceId) {
  return withIndex(root, async (index) => {
    const sliceNode = await index.nodeById(`slice:${sliceId}`);
    const byType = {};
    for (const n of await index.nodesBySlice(sliceId)) {
      if (n.type === 'slice') continue;
      const type = n.type ?? 'unknown';
      byType[type] ??= [];
      byType[type].push(n);
    }
    return {
      payload: {
        slice: sliceNode,
        spec_docs: byType.spec_doc ?? [],
        requirements: byType.requirement ?? [],
        acceptance_criteria: byType.acceptance_criterion ?? [],
        features: byType.feature ?? [],
        sessions: (byType.session ?? []).length,
        log_entries: byType.log_entry ?? [],
      },
      failed: false,
    };
  });
}

/** Learning patterns, computed live from the sources of truth: needs no knowledge index. */
export async function patterns(root, { status: wanted } = {}) {
  loadEnv(root);
  const { patterns: all, unsigned_failures } = derivePatterns(root);
  return {
    payload: {
      patterns: all.filter((p) => (wanted ? p.status === wanted : p.status !== 'watching')),
      unsigned_failures,
      // Reuse one of these verbatim in a new failure-log entry so repeats are counted (QG-DEB-05).
      failure_signatures: failureSignatures(root),
    },
    failed: false,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [command, ...rest] = process.argv.slice(2);
  const flag = (name) => {
    const i = rest.indexOf(name);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  const positional = rest.filter((a, i) => !a.startsWith('--') && !rest[i - 1]?.startsWith('--')).join(' ').trim();
  const usage = (message) => {
    if (message) console.error(message);
    console.error(
      'Usage: asdd knowledge status | search "<query>" [--k N] [--slice <id>] | trace <id> [--depth N] | slice <slice-id> | patterns [--status <s>]'
    );
    process.exit(1);
  };
  const root = process.cwd();
  let answer;
  if (command === 'status') answer = await status(root);
  else if (command === 'search') {
    if (!positional) usage('search needs a query');
    answer = await search(root, positional, { k: clampK(flag('--k')), sliceId: flag('--slice') });
  } else if (command === 'trace') {
    if (!positional) usage('trace needs a node id');
    answer = await trace(root, positional, { depth: clampDepth(flag('--depth')) });
  } else if (command === 'slice') {
    if (!positional) usage('slice needs a slice id');
    answer = await slice(root, positional);
  } else if (command === 'patterns') {
    const wanted = flag('--status');
    if (wanted && !PATTERN_STATUSES.includes(wanted)) usage(`--status must be one of: ${PATTERN_STATUSES.join(', ')}`);
    answer = await patterns(root, { status: wanted });
  } else usage(command ? `unknown command: ${command}` : '');
  console.log(JSON.stringify(answer.payload, null, 2));
  process.exit(answer.failed ? 1 : 0);
}
