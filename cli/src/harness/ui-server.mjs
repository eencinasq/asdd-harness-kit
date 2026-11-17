#!/usr/bin/env node
/**
 * `asdd ui` — read-only local HTTP shell over harness state (slice asdd-ui / G18).
 * Node builtins only; binds 127.0.0.1. Write endpoints land in ui-gate-decisions.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, watch } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { runDrift } from './drift-lib.mjs';
import { search as knowledgeSearch } from './knowledge-query.mjs';
import { readPatterns } from './learning-lib.mjs';
import { renderPipelineHtml } from './pipeline-html.mjs';
import { computePipelineMetrics } from './pipeline-metrics.mjs';
import { readSessions } from './sync-state.mjs';

const ASDD_BIN = join(dirname(fileURLToPath(import.meta.url)), '../../bin/asdd.mjs');

/**
 * Spawn `asdd gate-decide` (REQ-002…004). Never writes sessions from the server itself.
 * @param {string} root
 * @param {{ slice_id?: string, phase?: string, note?: string }} body
 */
export function spawnGateDecide(root, body) {
  const sliceId = String(body.slice_id || '').trim();
  const phase = String(body.phase || '').trim();
  const note = String(body.note || '').trim();
  if (!sliceId || !phase || !note) {
    return { ok: false, error: 'slice_id, phase, and note are required' };
  }
  const r = spawnSync(
    process.execPath,
    [ASDD_BIN, 'gate-decide', sliceId, '--phase', phase, '--note', note],
    { cwd: root, encoding: 'utf8', env: process.env },
  );
  const output = `${r.stdout || ''}${r.stderr || ''}`.trim();
  if (r.status !== 0) {
    return { ok: false, error: `asdd gate-decide exited ${r.status}`, output };
  }
  return { ok: true, output };
}

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
 * Loopback Host + Origin/Referer check for write endpoints (REQ-005).
 * @param {import('node:http').IncomingMessage} req
 * @param {number} port bound listen port
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function assertLoopbackWrite(req, port) {
  const hostHeader = String(req.headers.host || '').trim().toLowerCase();
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  if (!allowedHosts.has(hostHeader)) {
    return { ok: false, reason: `invalid Host: ${hostHeader || '(missing)'}` };
  }

  const originRaw = String(req.headers.origin || '').trim();
  let origin = originRaw;
  if (!origin) {
    const referer = String(req.headers.referer || '').trim();
    if (referer) {
      try {
        const u = new URL(referer);
        origin = u.origin;
      } catch {
        return { ok: false, reason: 'invalid Referer' };
      }
    }
  }
  if (!origin) return { ok: false, reason: 'missing Origin and Referer' };

  let originUrl;
  try {
    originUrl = new URL(origin);
  } catch {
    return { ok: false, reason: 'invalid Origin' };
  }
  const allowedOrigins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
  if (!allowedOrigins.has(originUrl.origin)) {
    return { ok: false, reason: `invalid Origin: ${originUrl.origin}` };
  }
  return { ok: true };
}

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
 * Pending human gate decisions: WARN phases without acknowledged_by.
 * @param {string} root
 */
export function listPendingGates(root) {
  const registry = readJson(root, '.harness/state/registry.json') ?? { slices: [] };
  const slices = Array.isArray(registry.slices) ? registry.slices : [];
  const pending = [];

  for (const s of slices) {
    const id = s.slice_id;
    if (!id) continue;
    const manifest = readJson(root, `.harness/state/slices/${id}/manifest.json`) ?? {};
    const gates = manifest.gates && typeof manifest.gates === 'object' ? manifest.gates : {};
    const sliceDir = join(root, `.harness/state/slices/${id}`);
    let sessions = [];
    try {
      sessions = existsSync(sliceDir) ? readSessions(sliceDir) : [];
    } catch {
      sessions = [];
    }

    let drift = { drift_level: 'n/a', findings: 0 };
    try {
      const result = runDrift({ root, sliceIds: [id], base: process.env.HARNESS_DRIFT_BASE });
      drift = {
        drift_level: result.summary?.drift_level ?? 'unknown',
        findings: Array.isArray(result.findings) ? result.findings.length : 0,
      };
    } catch {
      drift = { drift_level: 'error', findings: 0 };
    }

    for (const [phase, gate] of Object.entries(gates)) {
      if (!gate || gate.status !== 'WARN') continue;
      if (gate.acknowledged_by) continue;
      const completed = [...sessions]
        .reverse()
        .find((x) => x.event_type === 'phase_completed' && x.phase === phase);
      const concerns = Array.isArray(gate.concerns)
        ? gate.concerns
        : Array.isArray(completed?.concerns)
          ? completed.concerns
          : [];
      pending.push({
        slice_id: id,
        phase,
        status: gate.status,
        concerns,
        evidence: completed?.evidence ?? gate.evidence ?? null,
        drift,
      });
    }
  }

  return { generated_at: new Date().toISOString(), pending };
}

function readBody(req, limit = 64_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * @param {string} root
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {URL} url
 * @param {{ port: number, decideRunner?: Function }} ctx
 */
async function handleApi(root, req, res, url, ctx) {
  const path = url.pathname;
  const method = (req.method || 'GET').toUpperCase();

  if (path === '/api/gates/decide' && method === 'POST') {
    const gate = assertLoopbackWrite(req, ctx.port);
    if (!gate.ok) {
      sendJson(res, 403, { ok: false, error: gate.reason });
      return;
    }
    let raw = '';
    try {
      raw = await readBody(req);
    } catch (err) {
      sendJson(res, 400, { ok: false, error: String(err?.message || err) });
      return;
    }
    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      sendJson(res, 400, { ok: false, error: 'invalid JSON' });
      return;
    }
    const runner = typeof ctx.decideRunner === 'function' ? ctx.decideRunner : spawnGateDecide;
    const result = await runner(root, body);
    sendJson(res, result.ok ? 200 : 422, result);
    return;
  }

  if (method !== 'GET' && method !== 'HEAD') {
    send(res, 405, 'method not allowed\n', {
      'content-type': 'text/plain; charset=utf-8',
      allow: 'GET, HEAD',
    });
    return;
  }

  if (path === '/api/gates') {
    sendJson(res, 200, listPendingGates(root));
    return;
  }

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
    const url = new URL(req.url || '/', `http://${HOST}`);
    const path = url.pathname;

    const run = async () => {
      // Bound port known only after listen; use placeholder until upgraded below.
      const boundPort = server.address()?.port ?? port;

      if (path.startsWith('/api/')) {
        await handleApi(root, req, res, url, {
          port: boundPort,
          decideRunner: opts.decideRunner,
        });
        return;
      }

      if (method !== 'GET' && method !== 'HEAD') {
        send(res, 405, 'method not allowed\n', {
          'content-type': 'text/plain; charset=utf-8',
          allow: 'GET, HEAD',
        });
        return;
      }

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
  process.stdout.write(`asdd ui → ${handle.url} (${HOST}; gate writes via asdd gate-decide)\n`);
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
