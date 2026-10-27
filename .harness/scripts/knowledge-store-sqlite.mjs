/**
 * knowledge-store-sqlite.mjs — embedded SQLite backend for the knowledge index.
 *
 * Optional tier: uses the builtin `node:sqlite` module (Node >= 22.5). When
 * unavailable the system transparently stays on the JSONL projection
 * (knowledge-store.mjs falls back). JSONL is ALWAYS written — it is the
 * portable interchange format; knowledge.db is a query-optimized sidecar.
 *
 * Same node/edge/chunk contract as the JSONL files. Embeddings are stored as
 * Float32 BLOBs; with the sqlite-vec extension installed a vec0 table serves
 * nearest-neighbour search, otherwise the server scores cosine in JS.
 *
 * Freshness: meta.generated_at in the DB must equal meta.json's generated_at —
 * a stale DB (e.g. JSONL regenerated on an old Node) is ignored.
 */
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KNOWLEDGE_DIR } from './knowledge-lib.mjs';

const require = createRequire(import.meta.url);

export function sqliteSupported() {
  try {
    const m = require('node:sqlite');
    return typeof m.DatabaseSync === 'function';
  } catch {
    return false;
  }
}

export function sqliteVecSupported() {
  try {
    const m = require('sqlite-vec');
    return typeof m.getLoadablePath === 'function' || typeof m.load === 'function';
  } catch {
    return false;
  }
}

// Attach sqlite-vec extension when the package is installed. Returns the
// vec virtual table name on success, null otherwise.
function attachVec(db) {
  if (!sqliteVecSupported()) return null;
  try {
    const sqliteVec = require('sqlite-vec');
    const ext = typeof sqliteVec.getLoadablePath === 'function'
      ? sqliteVec.getLoadablePath()
      : sqliteVec.loadablePath();
    if (typeof db.loadExtension !== 'function') return null;
    db.loadExtension(ext);
    return 'vec_chunks';
  } catch {
    return null;
  }
}

function openDb(dbPath) {
  const { DatabaseSync } = require('node:sqlite');
  // allowExtension required at construction for loadExtension() (sqlite-vec).
  return new DatabaseSync(dbPath, { allowExtension: true });
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  slice_id TEXT,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
CREATE INDEX IF NOT EXISTS idx_nodes_slice ON nodes(slice_id);
CREATE TABLE IF NOT EXISTS edges (
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  rel TEXT NOT NULL,
  data TEXT,
  PRIMARY KEY (from_id, rel, to_id)
);
CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_id);
CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_id);
CREATE INDEX IF NOT EXISTS idx_edges_rel ON edges(rel);
CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  node_id TEXT,
  slice_id TEXT,
  text TEXT NOT NULL,
  hash TEXT,
  embedding BLOB,
  meta TEXT
);
CREATE INDEX IF NOT EXISTS idx_chunks_slice ON chunks(slice_id);
CREATE INDEX IF NOT EXISTS idx_chunks_node ON chunks(node_id);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
`;

function nodeSliceId(n) {
  return n.slice_id ?? (n.type === 'slice' ? n.slice_id : null);
}

/**
 * Replace the whole knowledge.db content with the scanned projection.
 * Called by sync-knowledge.mjs after JSONL files are written.
 */
export function writeSqliteIndex(root, { nodes, edges, chunks, meta }) {
  const dbPath = join(root, KNOWLEDGE_DIR, 'knowledge.db');
  const db = openDb(dbPath);
  try {
    db.exec(SCHEMA);
    db.exec('BEGIN');
    db.exec('DELETE FROM nodes; DELETE FROM edges; DELETE FROM chunks; DELETE FROM meta;');

    // OR IGNORE: the JSONL projection tolerates duplicate ids (same REQ in two
    // docs); PK columns can't.
    const insNode = db.prepare('INSERT OR IGNORE INTO nodes (id, type, slice_id, data) VALUES (?, ?, ?, ?)');
    for (const n of nodes) {
      insNode.run(n.id, n.type, nodeSliceId(n), JSON.stringify(n));
    }
    const insEdge = db.prepare('INSERT OR IGNORE INTO edges (from_id, to_id, rel, data) VALUES (?, ?, ?, ?)');
    for (const e of edges) {
      insEdge.run(e.from, e.to, e.rel, JSON.stringify(e));
    }
    const insChunk = db.prepare(
      'INSERT OR IGNORE INTO chunks (id, node_id, slice_id, text, hash, embedding, meta) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    for (const c of chunks) {
      const { embedding, id, node, slice_id, text, hash, ...rest } = c;
      const blob = Array.isArray(embedding)
        ? Buffer.from(new Float32Array(embedding).buffer)
        : null;
      insChunk.run(id, node ?? null, slice_id ?? null, text, hash ?? null, blob, JSON.stringify(rest));
    }
    // OR REPLACE: meta may already carry vec_dim, which is written again below.
    const insMeta = db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)');
    for (const [k, v] of Object.entries(meta)) {
      insMeta.run(k, JSON.stringify(v));
    }

    // sqlite-vec ANN table when the extension is installed and a consistent
    // embedding dimension exists — vec0 requires a fixed FLOAT[N].
    const vecTable = attachVec(db);
    const dims = new Map();
    for (const c of chunks) {
      if (Array.isArray(c.embedding)) {
        dims.set(c.embedding.length, (dims.get(c.embedding.length) ?? 0) + 1);
      }
    }
    const dim = [...dims.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    if (vecTable && dim) {
      db.exec('DROP TABLE IF EXISTS vec_chunks');
      db.exec(
        `CREATE VIRTUAL TABLE vec_chunks USING vec0(chunk_id TEXT PRIMARY KEY, embedding FLOAT[${dim}] distance_metric=cosine)`
      );
      const insVec = db.prepare('INSERT INTO vec_chunks (chunk_id, embedding) VALUES (?, ?)');
      for (const c of chunks) {
        if (Array.isArray(c.embedding) && c.embedding.length === dim) {
          insVec.run(c.id, Buffer.from(new Float32Array(c.embedding).buffer));
        }
      }
      insMeta.run('vec_dim', String(dim));
    }

    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  } finally {
    db.close();
  }
}

function blobToVec(blob) {
  if (!blob) return undefined;
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

function rowToChunk(r) {
  return {
    id: r.id,
    node: r.node_id,
    slice_id: r.slice_id,
    text: r.text,
    hash: r.hash,
    embedding: blobToVec(r.embedding),
    ...(r.meta ? JSON.parse(r.meta) : {}),
  };
}

/**
 * Open the sqlite index if supported, present, and fresh vs meta.json.
 * @returns {{ store: object|null, reason: string|null }} reason says why no
 *   store was opened (caller falls back to JSONL and reports it)
 */
export function openSqliteIndex(root) {
  if (!sqliteSupported()) return { store: null, reason: 'node:sqlite unavailable (Node >= 22.5)' };
  const dir = join(root, KNOWLEDGE_DIR);
  const dbPath = join(dir, 'knowledge.db');
  const metaPath = join(dir, 'meta.json');
  if (!existsSync(metaPath)) return { store: null, reason: null };
  if (!existsSync(dbPath)) return { store: null, reason: 'knowledge.db missing — run sync-knowledge.mjs' };

  let jsonMeta;
  try {
    jsonMeta = JSON.parse(readFileSync(metaPath, 'utf8'));
  } catch (error) {
    return { store: null, reason: `meta.json unreadable: ${error.message}` };
  }

  let db;
  let vecLoaded;
  try {
    db = openDb(dbPath);
    vecLoaded = Boolean(attachVec(db)); // vec0 only exists in connections that loaded the extension
    const row = db.prepare("SELECT value FROM meta WHERE key = 'generated_at'").get();
    const dbGeneratedAt = row ? JSON.parse(row.value) : null;
    if (dbGeneratedAt !== jsonMeta.generated_at) {
      db.close();
      return { store: null, reason: 'knowledge.db is stale (last sqlite write failed?) — rerun sync-knowledge.mjs' };
    }
  } catch (error) {
    try { db?.close(); } catch {}
    return { store: null, reason: `knowledge.db unreadable: ${error.message}` };
  }

  const scalar = (sql, ...params) => db.prepare(sql).get(...params)?.n ?? 0;
  const nodeFromRow = (r) => JSON.parse(r.data);
  const edgeFromRow = (r) => ({ from: r.from_id, to: r.to_id, rel: r.rel, ...(r.data ? JSON.parse(r.data) : {}) });

  const store = {
    backend: 'sqlite',

    meta: () => jsonMeta,

    counts: () => ({
      nodes: scalar('SELECT COUNT(*) AS n FROM nodes'),
      edges: scalar('SELECT COUNT(*) AS n FROM edges'),
      chunks: scalar('SELECT COUNT(*) AS n FROM chunks'),
      embedded_chunks: scalar('SELECT COUNT(*) AS n FROM chunks WHERE embedding IS NOT NULL'),
    }),

    chunksForSearch: (sliceId) => {
      const rows = sliceId
        ? db.prepare('SELECT * FROM chunks WHERE slice_id = ?').all(sliceId)
        : db.prepare('SELECT * FROM chunks').all();
      return rows.map(rowToChunk);
    },

    nodeById: (id) => {
      const r = db.prepare('SELECT data FROM nodes WHERE id = ?').get(id);
      return r ? nodeFromRow(r) : null;
    },

    edgesIncident: (id) =>
      db
        .prepare('SELECT * FROM edges WHERE from_id = ? OR to_id = ?')
        .all(id, id)
        .map(edgeFromRow),

    nodesBySlice: (sliceId) =>
      db.prepare('SELECT data FROM nodes WHERE slice_id = ?').all(sliceId).map(nodeFromRow),

    // ANN via sqlite-vec when the vec_chunks virtual table was written.
    // Returns null when not applicable (no extension/table, or a slice filter:
    // KNN picks k globally before the join, so the caller's exact cosine over
    // the slice pool is used instead). Real query errors throw.
    vectorSearch: (queryVec, k, sliceId) => {
      if (!vecLoaded || sliceId) return null;
      const hasVec = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='vec_chunks'")
        .get();
      if (!hasVec) return null;
      const q = Buffer.from(new Float32Array(queryVec).buffer);
      const rows = db
        .prepare(
          `SELECT c.*, v.distance AS distance FROM vec_chunks v
           JOIN chunks c ON c.id = v.chunk_id
           WHERE v.embedding MATCH ? AND v.k = ?
           ORDER BY v.distance`
        )
        .all(q, Number(k));
      return rows.map((r) => ({ ...rowToChunk(r), score: 1 - Number(r.distance) }));
    },

    close: () => db.close(),
  };
  return { store, reason: null };
}
