#!/usr/bin/env node
/**
 * Knowledge MCP Server (zero-dependency stdio server).
 *
 * Serves the generated knowledge index (.harness/knowledge/*.jsonl) built by
 * .harness/scripts/sync-knowledge.mjs. Files under .harness/ stay the source
 * of truth — this server only reads the generated projection.
 *
 * Tools:
 *   knowledge_search  — semantic (cosine over stored embeddings) or lexical
 *                       token search over spec/session/feature chunks
 *   knowledge_trace   — BFS over traceability edges (req→feature→file, etc.)
 *   knowledge_slice   — context bundle for one slice (specs, features, sessions)
 *   knowledge_status  — index counts + generated_at + embedding coverage
 *
 * Protocol: MCP over line-delimited JSON-RPC 2.0 on stdio
 *   (initialize / notifications/initialized / ping / tools/list / tools/call).
 */
import { createInterface } from 'node:readline';
import { openStore } from '../../.harness/scripts/knowledge-store.mjs';
import { loadEnv } from '../../.harness/scripts/env-loader.mjs';

loadEnv(); // KNOWLEDGE_EMBEDDINGS_* may live in .env/.env.local

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'knowledge-server', version: '3.1.0' };

const TOOLS = [
  {
    name: 'knowledge_search',
    description:
      'Search harness knowledge chunks (specs, EARS requirements, features, sessions, logs). Uses stored embeddings when present, otherwise lexical token matching.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural-language query or keywords' },
        k: { type: 'integer', description: 'Max results', default: 5 },
        slice_id: { type: 'string', description: 'Restrict results to one slice' },
      },
      required: ['query'],
    },
  },
  {
    name: 'knowledge_trace',
    description:
      'Traverse the traceability graph from a node id (e.g. req:<slice>:REQ-001, feature:<slice>:F-01, slice:<id>, file:<path>). Returns nodes and edges within `depth` hops.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Node id to start from' },
        depth: { type: 'integer', description: 'Max hops (1-4)', default: 2 },
      },
      required: ['id'],
    },
  },
  {
    name: 'knowledge_slice',
    description:
      'Context bundle for one slice: manifest summary, spec docs, requirements, features with status, and session count. JIT loading — pull only what the current phase needs.',
    inputSchema: {
      type: 'object',
      properties: {
        slice_id: { type: 'string', description: 'Slice identifier (dir under .harness/specs or state)' },
      },
      required: ['slice_id'],
    },
  },
  {
    name: 'knowledge_status',
    description: 'Index stats: node/edge/chunk counts, generated_at, embedding coverage.',
    inputSchema: { type: 'object', properties: {} },
  },
];

// ------------------------------------------------------------------
// Index access — sqlite → JSONL via the store facade
// ------------------------------------------------------------------
function loadIndex() {
  return openStore(process.cwd());
}

// ------------------------------------------------------------------
// Search: cosine over stored embeddings, else lexical scoring
// ------------------------------------------------------------------
const STOPWORDS = new Set(
  'the a an and or of to in on for with by is are was were be been shall when if then that this it its as at from'.split(' ')
);

function tokenize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúñü_-]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function lexicalScore(queryTokens, querySet, text) {
  const docTokens = tokenize(text);
  if (docTokens.length === 0 || queryTokens.length === 0) return 0;
  const docSet = new Set(docTokens);
  let overlap = 0;
  for (const t of queryTokens) if (docSet.has(t)) overlap += 1;
  const coverage = overlap / querySet.size;
  const tf = docTokens.filter((t) => querySet.has(t)).length / docTokens.length;
  return coverage * 0.7 + Math.min(tf * 20, 1) * 0.3;
}

function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

// Degradations are reported in the tool result and on stderr — never hidden.
function warn(message) {
  process.stderr.write(`knowledge-server: ${message}\n`);
  return message;
}

const embeddingsConfigured = () =>
  Boolean(process.env.KNOWLEDGE_EMBEDDINGS_URL && process.env.KNOWLEDGE_EMBEDDINGS_MODEL);

/** @returns {Promise<{ vector: number[]|null, error?: string }>} */
async function embedQuery(text) {
  const url = process.env.KNOWLEDGE_EMBEDDINGS_URL;
  const model = process.env.KNOWLEDGE_EMBEDDINGS_MODEL;
  if (!url || !model) {
    return { vector: null, error: 'index has embeddings but KNOWLEDGE_EMBEDDINGS_URL/MODEL are not set' };
  }
  const headers = { 'content-type': 'application/json' };
  if (process.env.KNOWLEDGE_EMBEDDINGS_KEY) {
    headers.authorization = `Bearer ${process.env.KNOWLEDGE_EMBEDDINGS_KEY}`;
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, input: [text] }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { vector: null, error: `query embedding failed: endpoint returned ${res.status}` };
    const data = await res.json();
    const vector = data?.data?.[0]?.embedding;
    return Array.isArray(vector)
      ? { vector }
      : { vector: null, error: 'query embedding failed: response has no data[0].embedding' };
  } catch (error) {
    return { vector: null, error: `query embedding failed: ${error?.message ?? error}` };
  }
}

/** @returns {Promise<{ results: object[], search_mode: string, warnings: string[] }>} */
async function searchChunks(index, query, k, sliceId) {
  const pool = await index.chunksForSearch(sliceId);
  const warnings = [];
  const strip = (rows) => rows.map(({ embedding, ...rest }) => rest);

  // Semantic path: only when the index carries embeddings AND we can embed the query
  const hasVectors = pool.some((c) => c.embedding && c.embedding.length);
  const { vector: qvec, error } = hasVectors ? await embedQuery(query) : { vector: null };
  if (error) warnings.push(warn(`${error} — fell back to lexical search`));
  if (qvec) {
    // sqlite-vec ANN when the backend can serve it; else exact JS cosine.
    if (typeof index.vectorSearch === 'function') {
      try {
        const rows = await index.vectorSearch(qvec, k, sliceId);
        if (rows) return { results: strip(rows), search_mode: 'semantic-ann', warnings };
      } catch (err) {
        warnings.push(warn(`vector index query failed: ${err?.message ?? err} — used JS cosine`));
      }
    }
    const results = pool
      .filter((c) => c.embedding && c.embedding.length)
      .map((c) => ({ ...c, score: cosine(qvec, c.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
    return { results: strip(results), search_mode: 'semantic-cosine', warnings };
  }

  const queryTokens = tokenize(query);
  const querySet = new Set(queryTokens);
  const results = pool
    .map((c) => ({ ...c, score: lexicalScore(queryTokens, querySet, c.text) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
  return { results: strip(results), search_mode: 'lexical', warnings };
}

// ------------------------------------------------------------------
// Graph traversal
// ------------------------------------------------------------------
async function trace(index, startId, depth) {
  const clamped = Math.max(1, Math.min(Number(depth) || 2, 4));
  const seenNodes = new Set([startId]);
  const outEdges = [];
  const seenEdges = new Set();
  let frontier = [startId];
  for (let d = 0; d < clamped && frontier.length; d += 1) {
    const next = [];
    for (const id of frontier) {
      for (const e of await index.edgesIncident(id)) {
        const key = `${e.from}|${e.rel}|${e.to}`;
        if (!seenEdges.has(key)) {
          seenEdges.add(key);
          outEdges.push(e);
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
  return { start, found: start !== null, nodes, edges: outEdges };
}

async function sliceBundle(index, sliceId) {
  const sliceNode = await index.nodeById(`slice:${sliceId}`);
  const related = (await index.nodesBySlice(sliceId)).filter((n) => n.type !== 'slice');
  const byType = {};
  for (const n of related) {
    byType[n.type] ??= [];
    byType[n.type].push(n);
  }
  return {
    slice: sliceNode,
    spec_docs: byType.spec_doc ?? [],
    requirements: byType.requirement ?? [],
    acceptance_criteria: byType.acceptance_criterion ?? [],
    features: byType.feature ?? [],
    sessions: (byType.session ?? []).length,
    log_entries: byType.log_entry ?? [],
  };
}

// ------------------------------------------------------------------
// JSON-RPC plumbing (same contract as jev-gate-server)
// ------------------------------------------------------------------
function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function reply(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function replyError(id, code, message) {
  send({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
}

function toolResult(payload, isError = false) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    isError,
  };
}

async function requireIndex(id) {
  const index = await loadIndex();
  if (index?.fallback_reason) warn(`serving JSONL: ${index.fallback_reason}`);
  if (!index) {
    reply(
      id,
      toolResult(
        { error: 'no knowledge index — run: node .harness/scripts/sync-knowledge.mjs' },
        true
      )
    );
    return null;
  }
  return index;
}

async function handleToolCall(id, params) {
  const name = params?.name;
  const args = params?.arguments ?? {};

  if (name === 'knowledge_status') {
    const index = await requireIndex(id);
    if (!index) return;
    const counts = await index.counts();
    const warnings = [];
    if (index.fallback_reason) warnings.push(`serving JSONL: ${index.fallback_reason}`);
    if (counts.embedded_chunks > 0 && !embeddingsConfigured()) {
      warnings.push('index has embeddings but KNOWLEDGE_EMBEDDINGS_URL/MODEL are not set — searches are lexical');
    }
    reply(
      id,
      toolResult({
        backend: index.backend,
        generated_at: index.meta()?.generated_at ?? null,
        stats: index.meta() ?? {},
        ...counts,
        search_mode: counts.embedded_chunks > 0 && embeddingsConfigured() ? 'semantic' : 'lexical',
        warnings,
      })
    );
    return;
  }

  if (name === 'knowledge_search') {
    const index = await requireIndex(id);
    if (!index) return;
    if (typeof args.query !== 'string' || !args.query.trim()) {
      reply(id, toolResult({ error: 'arguments.query must be a non-empty string' }, true));
      return;
    }
    try {
      const search = await searchChunks(
        index,
        args.query,
        Math.max(1, Math.min(Number(args.k) || 5, 25)),
        typeof args.slice_id === 'string' ? args.slice_id : undefined
      );
      if (index.fallback_reason) search.warnings.unshift(`serving JSONL: ${index.fallback_reason}`);
      reply(id, toolResult(search));
    } catch (error) {
      replyError(id, -32603, error?.message || 'search failed');
    }
    return;
  }

  if (name === 'knowledge_trace') {
    const index = await requireIndex(id);
    if (!index) return;
    if (typeof args.id !== 'string' || !args.id.trim()) {
      reply(id, toolResult({ error: 'arguments.id must be a non-empty string' }, true));
      return;
    }
    reply(id, toolResult(await trace(index, args.id, args.depth)));
    return;
  }

  if (name === 'knowledge_slice') {
    const index = await requireIndex(id);
    if (!index) return;
    if (typeof args.slice_id !== 'string' || !args.slice_id.trim()) {
      reply(id, toolResult({ error: 'arguments.slice_id must be a non-empty string' }, true));
      return;
    }
    reply(id, toolResult(await sliceBundle(index, args.slice_id)));
    return;
  }

  reply(id, toolResult({ error: `Unknown tool: ${name}` }, true));
}

async function handleMessage(message) {
  if (!message || typeof message !== 'object') return;
  const { id, method, params } = message;
  const isNotification = id === undefined || id === null;

  switch (method) {
    case 'initialize':
      reply(id, {
        protocolVersion: params?.protocolVersion || PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
      return;
    case 'ping':
      if (!isNotification) reply(id, {});
      return;
    case 'tools/list':
      reply(id, { tools: TOOLS });
      return;
    case 'tools/call':
      await handleToolCall(id, params);
      return;
    default:
      if (isNotification) return;
      replyError(id, -32601, `Method not found: ${method}`);
  }
}

// Serialize stdio handlers: MCP stdio clients expect in-order responses even
// when several lines are piped before any reply.
let messageChain = Promise.resolve();

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  messageChain = messageChain.then(async () => {
    let message;
    try {
      message = JSON.parse(trimmed);
    } catch (error) {
      replyError(null, -32700, `Parse error: ${error.message}`);
      return;
    }
    try {
      await handleMessage(message);
    } catch (error) {
      replyError(message?.id ?? null, -32603, error?.message || 'internal error');
    }
  });
});

process.stderr.write('Knowledge MCP Server started (stdio)\n');
