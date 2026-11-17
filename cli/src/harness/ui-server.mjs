#!/usr/bin/env node
/**
 * `asdd ui` — read-only local HTTP shell over harness state (slice asdd-ui / G18).
 * Node builtins only; binds 127.0.0.1. Write endpoints land in ui-gate-decisions.
 */
import { existsSync, mkdirSync, readFileSync, watch } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { runDrift } from './drift-lib.mjs';
import { search as knowledgeSearch } from './knowledge-query.mjs';
import { readPatterns } from './learning-lib.mjs';
import { renderPipelineHtml } from './pipeline-html.mjs';
import { computePipelineMetrics } from './pipeline-metrics.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const UI_DIR = join(HERE, 'ui');
const DEFAULT_PORT = 7474;
const HOST = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/**
 * @param {string[]} argv
 * @returns {{ port: number }}
 */
export function parseUiArgs(argv = []) {
  let port = DEFAULT_PORT;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port' && argv[i + 1]) {
      port = Number(argv[++i]);
    } else if (a.startsWith('--port=')) {
      port = Number(a.slice('--port='.length));
    }
  }
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`invalid --port: ${port}`);
  }
  return { port };
}

function send(res, status, body, headers = {}) {
  const payload = body == null ? '' : Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  res.writeHead(status, {
    'content-length': payload.length,
    ...headers,
  });
  res.end(payload);
}

function sendJson(res, status, obj) {
  send(res, status, `${JSON.stringify(obj)}\n`, { 'content-type': 'application/json; charset=utf-8' });
}

function readJson(root, rel) {
  const p = join(root, rel);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function safeJoin(root, reqPath) {
  const decoded = decodeURIComponent((reqPath || '/').split('?')[0]);
  const rel = decoded.replace(/^\/+/, '');
  const candidate = normalize(join(root, rel));
  const rootNorm = normalize(root + sep);
  if (candidate !== normalize(root) && !candidate.startsWith(rootNorm)) return null;
  return candidate;
}

function serveFile(res, filePath) {
  if (!existsSync(filePath)) {
    send(res, 404, 'not found\n', { 'content-type': 'text/plain; charset=utf-8' });
    return;
  }
  const ext = extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  send(res, 200, readFileSync(filePath), { 'content-type': type });
}

function progressText(root) {
  const p = join(root, '.harness/PROGRESS.md');
  if (!existsSync(p)) return null;
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

/**
 * @param {string} root
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {URL} url
 */
async function handleApi(root, req, res, url) {
  const path = url.pathname;

  if (path === '/api/status') {
    const registry = readJson(root, '.harness/state/registry.json') ?? { slices: [] };
    const metrics = computePipelineMetrics({ root, slices: registry.slices });
    sendJson(res, 200, {
      generated_at: new Date().toISOString(),
      slices: registry.slices ?? [],
      metrics,
      progress: progressText(root),
    });
    return;
  }

  if (path === '/api/pipeline') {
    send(res, 200, renderPipelineHtml({ root }), { 'content-type': 'text/html; charset=utf-8' });
    return;
  }

  if (path === '/api/drift') {
    const result = runDrift({
      root,
      base: process.env.HARNESS_DRIFT_BASE,
    });
    sendJson(res, 200, result);
    return;
  }

  if (path === '/api/learn') {
    const data = readPatterns(root) ?? { patterns: [] };
    const patterns = Array.isArray(data.patterns) ? data.patterns : [];
    const open = patterns.filter((p) => p.status === 'open');
    sendJson(res, 200, { ...data, patterns, open });
    return;
  }

  if (path === '/api/knowledge') {
    const q = url.searchParams.get('q') ?? '';
    const k = Number(url.searchParams.get('k') || 5);
    try {
      const out = await knowledgeSearch(root, q, { k });
      sendJson(res, 200, out?.payload ?? out ?? { results: [], error: 'no knowledge index' });
    } catch (err) {
      sendJson(res, 200, { results: [], error: String(err?.message || err) });
    }
    return;
  }

  send(res, 404, 'not found\n', { 'content-type': 'text/plain; charset=utf-8' });
}

/**
 * @param {{ root?: string, port?: number }} [opts]
 * @returns {Promise<{ server: import('node:http').Server, address: import('node:net').AddressInfo, url: string, close: () => Promise<void> }>}
 */
export async function startUiServer(opts = {}) {
  const root = opts.root ?? process.cwd();
  const port = opts.port ?? DEFAULT_PORT;
  /** @type {Set<import('node:http').ServerResponse>} */
  const sseClients = new Set();
  let debounce = null;

  const stateDir = join(root, '.harness/state');
  if (!existsSync(stateDir)) mkdirSync(stateDir, { recursive: true });

  const broadcastReload = () => {
    const payload = `event: reload\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`;
    for (const client of sseClients) {
      try {
        client.write(payload);
      } catch {
        sseClients.delete(client);
      }
    }
  };

  const onStateChange = () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(broadcastReload, 75);
  };

  let watcher = null;
  try {
    watcher = watch(stateDir, { recursive: true }, onStateChange);
  } catch {
    try {
      watcher = watch(stateDir, onStateChange);
    } catch {
      watcher = null;
    }
  }

  const server = createServer((req, res) => {
    const method = (req.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      send(res, 405, 'method not allowed\n', {
        'content-type': 'text/plain; charset=utf-8',
        allow: 'GET, HEAD',
      });
      return;
    }

    const url = new URL(req.url || '/', `http://${HOST}`);
    const path = url.pathname;

    const run = async () => {
      if (path === '/' || path === '/index.html') {
        serveFile(res, join(UI_DIR, 'index.html'));
        return;
      }

      if (path.startsWith('/ui/')) {
        const file = safeJoin(UI_DIR, path.slice('/ui'.length));
        if (!file) {
          send(res, 403, 'forbidden\n', { 'content-type': 'text/plain; charset=utf-8' });
          return;
        }
        serveFile(res, file);
        return;
      }

      if (path === '/events') {
        res.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        });
        res.write(`event: hello\ndata: ${JSON.stringify({ ok: true })}\n\n`);
        sseClients.add(res);
        req.on('close', () => {
          sseClients.delete(res);
        });
        return;
      }

      if (path.startsWith('/api/')) {
        await handleApi(root, req, res, url);
        return;
      }

      // Optional static reuse of built spec-drift dashboards (read-only).
      if (path.startsWith('/vendor/spec-drift/')) {
        const dist = join(root, 'tools/spec-drift/dist');
        const file = safeJoin(dist, path.slice('/vendor/spec-drift'.length));
        if (!file) {
          send(res, 403, 'forbidden\n', { 'content-type': 'text/plain; charset=utf-8' });
          return;
        }
        serveFile(res, file);
        return;
      }

      send(res, 404, 'not found\n', { 'content-type': 'text/plain; charset=utf-8' });
    };

    run().catch((err) => {
      if (!res.headersSent) {
        sendJson(res, 500, { error: String(err?.message || err) });
      }
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, HOST, resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('failed to bind UI server');
  }

  return {
    server,
    address,
    url: `http://${HOST}:${address.port}/`,
    close: () =>
      new Promise((resolve, reject) => {
        if (debounce) clearTimeout(debounce);
        try {
          watcher?.close();
        } catch {
          /* ignore */
        }
        for (const client of sseClients) {
          try {
            client.end();
          } catch {
            /* ignore */
          }
        }
        sseClients.clear();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

async function main(argv) {
  const { port } = parseUiArgs(argv);
  const root = process.cwd();
  const handle = await startUiServer({ root, port });
  process.stdout.write(`asdd ui → ${handle.url} (read-only, ${HOST})\n`);
  const stop = async () => {
    await handle.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err?.message || err);
    process.exit(1);
  });
}
