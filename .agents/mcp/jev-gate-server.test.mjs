import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function startServer(extraEnv = {}) {
  const env = { ...process.env };
  delete env.JEV_API_KEY; // tests must not depend on a live Jev key
  const child = spawn(process.execPath, [join(root, '.agents/mcp/jev-gate-server.mjs')], {
    cwd: root,
    env: { ...env, ...extraEnv },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const pending = new Map();
  const errors = [];
  let buffer = '';
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (!line.trim()) continue;
      try {
        const message = JSON.parse(line);
        const waiter = pending.get(message.id);
        if (waiter) {
          pending.delete(message.id);
          waiter(message);
        }
      } catch (error) {
        errors.push(`non-JSON stdout line: ${line} (${error.message})`);
      }
    }
  });
  child.stderr.resume();
  let nextId = 1;
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${method} response`)), 5000);
    pending.set(id, (message) => {
      clearTimeout(timer);
      resolve(message);
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
  const close = () => {
    child.kill('SIGTERM');
    assert.deepEqual(errors, [], 'server wrote non-JSON lines on stdout');
  };
  return { request, close };
}

test('initialize handshake returns server info and echoes protocol version', async (t) => {
  const server = startServer();
  t.after(() => server.close());
  const response = await server.request('initialize', { protocolVersion: '2024-11-05', capabilities: {} });
  assert.equal(response.result.serverInfo.name, 'jev-gate-server');
  assert.equal(response.result.protocolVersion, '2024-11-05');
  assert.ok(response.result.capabilities.tools);
});

test('tools/list exposes check_command_safety', async (t) => {
  const server = startServer();
  t.after(() => server.close());
  const response = await server.request('tools/list');
  const names = response.result.tools.map((tool) => tool.name);
  assert.deepEqual(names, ['check_command_safety']);
});

function parseToolPayload(response) {
  assert.notEqual(response.result.isError, true);
  assert.equal(response.result.content[0].type, 'text');
  return JSON.parse(response.result.content[0].text);
}

test('safe command is allowed by pattern whitelist (no Jev call)', async (t) => {
  const server = startServer();
  t.after(() => server.close());
  const response = await server.request('tools/call', {
    name: 'check_command_safety',
    arguments: { command: 'ls -la' },
  });
  const payload = parseToolPayload(response);
  assert.equal(payload.allowed, true);
  assert.equal(payload.method, 'pattern-whitelist');
});

test('dangerous command is denied fail-closed when Jev is unavailable', async (t) => {
  const server = startServer();
  t.after(() => server.close());
  const response = await server.request('tools/call', {
    name: 'check_command_safety',
    arguments: { command: 'rm -rf /tmp/anything' },
  });
  const payload = parseToolPayload(response);
  assert.equal(payload.allowed, false);
  assert.equal(payload.method, 'jev-unavailable');
});

test('override allows a dangerous command without calling Jev', async (t) => {
  const server = startServer();
  t.after(() => server.close());
  const response = await server.request('tools/call', {
    name: 'check_command_safety',
    arguments: { command: 'rm -rf /tmp/anything', override: true },
  });
  const payload = parseToolPayload(response);
  assert.equal(payload.allowed, true);
  assert.equal(payload.method, 'override');
});

test('unknown method with id returns JSON-RPC method-not-found', async (t) => {
  const server = startServer();
  t.after(() => server.close());
  const response = await server.request('resources/list');
  assert.equal(response.error.code, -32601);
});

test('unknown tool returns an isError tool result', async (t) => {
  const server = startServer();
  t.after(() => server.close());
  const response = await server.request('tools/call', { name: 'nope', arguments: {} });
  assert.equal(response.result.isError, true);
});
