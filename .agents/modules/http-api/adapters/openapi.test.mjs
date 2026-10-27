import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import adapter, { citedEndpoints, normalizePath } from './openapi.mjs';

// Runs from .agents/modules/http-api/adapters (kit) or .agents/mcp/adapters (installed).
let repo = dirname(fileURLToPath(import.meta.url));
while (!existsSync(join(repo, '.harness/scripts/drift-lib.mjs')) && dirname(repo) !== repo) repo = dirname(repo);
const { readBinding } = await import(pathToFileURL(join(repo, '.harness/scripts/drift-lib.mjs')).href);

function write(root, rel, content) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`);
}

function fixture(bindings) {
  const root = mkdtempSync(join(tmpdir(), 'openapi-'));
  write(root, '.harness/specs/s1/requirements.md', [
    '- **REQ-001.** When a client sends `GET /users/{id}`, the API shall return the user.',
    '- **REQ-002.** When a client sends `POST /orders`, the API shall create an order.',
    '- **REQ-003.** The system shall log requests.',
  ].join('\n'));
  write(root, 'openapi.json', { openapi: '3.0.0', paths: { '/users/{userId}': { get: {} } } });
  write(root, '.harness/steering/quality-gates.project.md', bindings);
  return root;
}

const run = (root) => adapter.run({ root, sliceId: 's1', readBinding });

test('REQ-025: OpenAPI JSON is compared with endpoints cited by requirements', () => {
  const root = fixture('- Contract command: `…`\n- OpenAPI spec: `openapi.json`\n');
  try {
    const res = run(root);
    assert.equal(res.status, 'fail');
    assert.equal(res.endpoints_checked, 2);
    assert.deepEqual(res.findings.map((f) => f.node), ['req:s1:REQ-002']);
    assert.match(res.findings[0].message, /POST \/orders/);
    assert.ok(res.findings[0].id.startsWith('AUD-'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('REQ-025: a bound Contract command wins and its failures cite requirements', () => {
  const cmd = "node -e \"console.log('POST /orders: response 201 missing'); process.exit(1)\"";
  const root = fixture(`- Contract command: \`${cmd}\`\n- OpenAPI spec: \`openapi.json\`\n`);
  try {
    const res = run(root);
    assert.equal(res.source, 'contract-command');
    assert.equal(res.status, 'fail');
    assert.deepEqual(res.findings.map((f) => f.node), ['req:s1:REQ-002']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('REQ-025: passing contract command and unconfigured bindings', () => {
  let root = fixture('- Contract command: `node -e "process.exit(0)"`\n');
  try {
    assert.equal(run(root).status, 'pass');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  root = fixture('- Contract command: `…`\n- OpenAPI spec: `…`\n');
  try {
    assert.equal(run(root).status, 'unconfigured');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('helpers: path normalization and endpoint citations', () => {
  assert.equal(normalizePath('/users/{id}/'), '/users/{}');
  assert.equal(normalizePath('/users/:id'), '/users/{}');
  const root = fixture('');
  try {
    const { endpoints } = citedEndpoints(root, 's1');
    assert.deepEqual(endpoints.map((e) => [e.req, e.method, e.path]), [['REQ-001', 'GET', '/users/{id}'], ['REQ-002', 'POST', '/orders']]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
