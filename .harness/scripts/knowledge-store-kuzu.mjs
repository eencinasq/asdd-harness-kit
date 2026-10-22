/**
 * knowledge-store-kuzu.mjs — Kuzu embedded graph backend (required tier).
 *
 * Kuzu is an embedded graph DB (its own engine — no node:sqlite needed, works
 * on Node >= 18). Activated when the `kuzu` package resolves; the JSONL
 * projection remains the portable interchange + fallback.
 *
 * Storage: .harness/knowledge/kuzu (Kuzu database) + kuzu.meta.json (freshness
 * stamp compared against meta.json generated_at).
 *
 * Concurrency (https://docs.kuzudb.com/concurrency):
 *   - Readers open the live path read-only (many processes OK).
 *   - Writers build into `kuzu.building` then rename over `kuzu`, so a live
 *     knowledge MCP does not block sync-knowledge.
 *
 * Schema (generic — same contract as JSONL):
 *   Entity(id PK, type, slice_id, data JSON)
 *   Rel(FROM Entity TO Entity, rel, data JSON)
 *   Chunk(id PK, node_id, slice_id, text, hash, embedding FLOAT[dim], meta JSON)
 *
 * Vectors: array_cosine_similarity pushed into Cypher when embeddings exist —
 * no external vector DB needed. HNSW (CREATE VECTOR INDEX) is a later opt.
 */
import { createRequire } from 'node:module';
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { KNOWLEDGE_DIR } from './knowledge-lib.mjs';

const require = createRequire(import.meta.url);

/** @type {{ root: string, stamp: string, adapter: object } | null} */
let openCache = null;

export function kuzuAvailable() {
  try {
    const m = require('kuzu');
    return typeof m.Database === 'function' && typeof m.Connection === 'function';
  } catch {
    return false;
  }
}

function kuzuPath(root) {
  return join(root, KNOWLEDGE_DIR, 'kuzu');
}

function buildingPath(root) {
  return `${kuzuPath(root)}.building`;
}

function stampPath(root) {
  return join(root, KNOWLEDGE_DIR, 'kuzu.meta.json');
}

function esc(s) {
  return String(s).replaceAll("'", "''");
}

function lockHint(error) {
  const msg = error?.message ?? String(error);
  if (!/lock/i.test(msg)) return msg;
  return (
    `${msg}\n` +
    'Hint: the knowledge MCP (or another process) still holds the Kuzu file. ' +
    'Disable Settings → MCP → knowledge, retry sync, then re-enable. ' +
    'See https://docs.kuzudb.com/concurrency'
  );
}

/**
 * Full rewrite of the Kuzu store from the scanned projection.
 * Builds into `kuzu.building` then renames onto `kuzu` so readers can keep
 * their open fds (stale inode) without blocking the writer.
 * Async — Kuzu queries return promises.
 */
export async function writeKuzuIndex(root, { nodes, edges, chunks, meta }) {
  const kuzu = require('kuzu');
  const dbPath = kuzuPath(root);
  const stagePath = buildingPath(root);

  // Leftover staging from a crashed sync
  rmSync(stagePath, { recursive: true, force: true });

  let db;
  let conn;
  try {
    db = new kuzu.Database(stagePath);
    conn = new kuzu.Connection(db);
  } catch (error) {
    throw new Error(lockHint(error));
  }

  // Kuzu enforces PK uniqueness — the flat JSONL projection tolerates
  // duplicates (same REQ id appearing in two spec docs, sessions emitted in
  // overlapping scans). Dedupe on the PK columns before insert.
  nodes = [...new Map(nodes.map((n) => [n.id, n])).values()];
  edges = [...new Map(edges.map((e) => [`${e.from}|${e.rel}|${e.to}`, e])).values()];
  chunks = [...new Map(chunks.map((c) => [c.id, c])).values()];

  try {
    // Fresh rebuild: drop and recreate (full regen, same contract as JSONL)
    await conn.query('DROP TABLE IF EXISTS Chunk').catch(() => {});
    await conn.query('DROP TABLE IF EXISTS Rel').catch(() => {});
    await conn.query('DROP TABLE IF EXISTS Entity').catch(() => {});

    await conn.query(
      `CREATE NODE TABLE Entity(id STRING PRIMARY KEY, type STRING, slice_id STRING, data STRING)`
    );
    await conn.query(`CREATE REL TABLE Rel(FROM Entity TO Entity, rel STRING, data STRING)`);

    const insNode = await conn.prepare(
      'CREATE (n:Entity {id: $id, type: $type, slice_id: $slice, data: $data})'
    );
    for (const n of nodes) {
      await conn.execute(insNode, {
        id: n.id,
        type: n.type,
        slice: n.slice_id ?? (n.type === 'slice' ? n.slice_id : ''),
        data: JSON.stringify(n),
      });
    }
    const insEdge = await conn.prepare(
      `MATCH (a:Entity {id: $from}), (b:Entity {id: $to})
       CREATE (a)-[r:Rel {rel: $rel, data: $data}]->(b)`
    );
    for (const e of edges) {
      await conn.execute(insEdge, { from: e.from, to: e.to, rel: e.rel, data: JSON.stringify(e) });
    }

    // Chunks: embedding column needs fixed dim — take the dominant dim present
    const dims = new Map();
    for (const c of chunks) {
      if (Array.isArray(c.embedding)) {
        dims.set(c.embedding.length, (dims.get(c.embedding.length) ?? 0) + 1);
      }
    }
    const dim = [...dims.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    if (dim) {
      await conn.query(
        `CREATE NODE TABLE Chunk(id STRING PRIMARY KEY, node_id STRING, slice_id STRING, text STRING, hash STRING, embedding FLOAT[${dim}], meta STRING)`
      );
    } else {
      await conn.query(
        `CREATE NODE TABLE Chunk(id STRING PRIMARY KEY, node_id STRING, slice_id STRING, text STRING, hash STRING, meta STRING)`
      );
    }
    const insChunk = await conn.prepare(
      dim
        ? `CREATE (c:Chunk {id: $id, node_id: $node, slice_id: $slice, text: $text, hash: $hash, embedding: $emb, meta: $meta})`
        : `CREATE (c:Chunk {id: $id, node_id: $node, slice_id: $slice, text: $text, hash: $hash, meta: $meta})`
    );
    for (const c of chunks) {
      const { embedding, id, node, slice_id, text, hash, ...rest } = c;
      const params = {
        id,
        node: node ?? '',
        slice: slice_id ?? '',
        text,
        hash: hash ?? '',
        meta: JSON.stringify(rest),
      };
      if (dim) params.emb = Array.isArray(embedding) && embedding.length === dim ? embedding : null;
      await conn.execute(insChunk, params);
    }

    // Drop prepared handles before rename. Avoid close() — kuzu@0.11.x can
    // segfault on teardown after prepared writes; process exit is safe.
    conn = null;
    db = null;

    try {
      renameSync(stagePath, dbPath);
    } catch (error) {
      throw new Error(lockHint(error));
    }

    writeFileSync(stampPath(root), JSON.stringify({ generated_at: meta.generated_at, engine: 'kuzu' }));
    // Bust reader cache so the next openStore picks up the new file
    if (openCache?.root === root) openCache = null;
    return { dim };
  } catch (error) {
    rmSync(stagePath, { recursive: true, force: true });
    throw error instanceof Error && /Hint:/.test(error.message) ? error : new Error(lockHint(error));
  }
}

function parseMeta(node) {
  try {
    return node.meta ? JSON.parse(node.meta) : {};
  } catch {
    return {};
  }
}

/**
 * Open the Kuzu index when the package resolves and the store is fresh
 * (stamp.generated_at === meta.json.generated_at). Async adapter.
 * Opens read-only so multiple MCP processes can share the file.
 */
export async function openKuzuIndex(root) {
  if (!kuzuAvailable()) return null;
  const dir = join(root, KNOWLEDGE_DIR);
  const metaPath = join(dir, 'meta.json');
  if (!existsSync(kuzuPath(root)) || !existsSync(stampPath(root)) || !existsSync(metaPath)) {
    return null;
  }
  let jsonMeta, stamp;
  try {
    jsonMeta = JSON.parse(readFileSync(metaPath, 'utf8'));
    stamp = JSON.parse(readFileSync(stampPath(root), 'utf8'));
  } catch {
    return null;
  }
  if (stamp.generated_at !== jsonMeta.generated_at) return null; // stale

  const stampKey = stamp.generated_at;
  if (openCache?.root === root && openCache.stamp === stampKey && openCache.adapter) {
    return openCache.adapter;
  }

  const kuzu = require('kuzu');
  // positional: path, bufferManagerSize, enableCompression, readOnly
  let db;
  try {
    db = new kuzu.Database(kuzuPath(root), 0, true, true);
  } catch (error) {
    throw new Error(lockHint(error));
  }
  const conn = new kuzu.Connection(db);

  // kuzu's conn.query takes no params — route everything through
  // prepare/execute (params work) and getAll() for results.
  const all = async (cypher, params = {}) => {
    const stmt = await conn.prepare(cypher);
    const res = await conn.execute(stmt, params);
    return res.getAll();
  };
  const scalar = async (cypher, params = {}) => {
    const rows = await all(cypher, params);
    return Number(Object.values(rows[0] ?? { n: 0 })[0] ?? 0);
  };
  const nodeFromRow = (r) => JSON.parse(r['n.data'] ?? r.data ?? '{}');
  const chunkFromRow = (r) => ({
    id: r['c.id'] ?? r.id,
    node: r['c.node_id'] ?? r.node_id,
    slice_id: r['c.slice_id'] ?? r.slice_id,
    text: r['c.text'] ?? r.text,
    hash: r['c.hash'] ?? r.hash,
    embedding: r['c.embedding'] ?? r.embedding ?? undefined,
    ...parseMeta({ meta: r['c.meta'] ?? r.meta }),
  });

  const adapter = {
    backend: 'kuzu',

    meta: () => jsonMeta,

    counts: async () => ({
      nodes: await scalar('MATCH (n:Entity) RETURN COUNT(*) AS n'),
      edges: await scalar('MATCH ()-[r:Rel]->() RETURN COUNT(*) AS n'),
      chunks: await scalar('MATCH (c:Chunk) RETURN COUNT(*) AS n'),
      embedded_chunks: 0, // filled lazily by caller if needed
    }),

    chunksForSearch: async (sliceId) => {
      const rows = sliceId
        ? await all(
            'MATCH (c:Chunk) WHERE c.slice_id = $s RETURN c.id, c.node_id, c.slice_id, c.text, c.hash, c.embedding, c.meta',
            { s: sliceId }
          ).catch(() =>
            all('MATCH (c:Chunk) WHERE c.slice_id = $s RETURN c.id, c.node_id, c.slice_id, c.text, c.hash, c.meta', {
              s: sliceId,
            })
          )
        : await all('MATCH (c:Chunk) RETURN c.id, c.node_id, c.slice_id, c.text, c.hash, c.embedding, c.meta').catch(() =>
            all('MATCH (c:Chunk) RETURN c.id, c.node_id, c.slice_id, c.text, c.hash, c.meta')
          );
      return rows.map(chunkFromRow);
    },

    nodeById: async (id) => {
      const rows = await all('MATCH (n:Entity) WHERE n.id = $id RETURN n.data', { id });
      return rows[0] ? nodeFromRow(rows[0]) : null;
    },

    edgesIncident: async (id) => {
      const rows = await all(
        'MATCH (a:Entity)-[r:Rel]->(b:Entity) WHERE a.id = $id OR b.id = $id RETURN a.id AS from, b.id AS to, r.rel AS rel, r.data AS data',
        { id }
      );
      return rows.map((r) => ({
        from: r.from ?? r['from'],
        to: r.to ?? r['to'],
        rel: r.rel,
        ...(r.data ? JSON.parse(r.data) : {}),
      }));
    },

    nodesBySlice: async (sliceId) => {
      const rows = await all('MATCH (n:Entity) WHERE n.slice_id = $s RETURN n.data', { s: sliceId });
      return rows.map(nodeFromRow);
    },

    // Vector search pushed into Cypher (array_cosine_similarity). Returns null
    // when the Chunk table has no embedding column (no vectors this sync).
    vectorSearch: async (queryVec, k, sliceId) => {
      try {
        const where = sliceId ? 'WHERE c.slice_id = $s AND c.embedding IS NOT NULL' : 'WHERE c.embedding IS NOT NULL';
        const rows = await all(
          `MATCH (c:Chunk) ${where}
           RETURN c.id, c.node_id, c.slice_id, c.text, c.hash, c.meta,
                  array_cosine_similarity(c.embedding, $q) AS score
           ORDER BY score DESC LIMIT $k`,
          { q: queryVec, k: Number(k), s: sliceId ?? '' }
        );
        return rows.map((r) => ({ ...chunkFromRow(r), score: Number(r.score) }));
      } catch {
        return null; // no embedding column / kuzu vec fn unavailable → JS cosine
      }
    },

    // Intentionally a no-op — see writeKuzuIndex: kuzu close() can segfault;
    // the long-lived MCP server keeps the connection open anyway.
    close: async () => {},
  };

  openCache = { root, stamp: stampKey, adapter };
  return adapter;
}
