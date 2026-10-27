import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER = join(dirname(fileURLToPath(import.meta.url)), 'spec-drift-auditor.mjs');

function write(root, rel, content) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`);
}

function git(root, ...args) {
  const r = spawnSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', ...args], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

/** Slice s1 on main; branch slice/s1/work changes a mapped file and adds an unmapped one. */
function fixture({ gate = 'node arch-check.mjs' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'sda-'));
  write(root, '.harness/state/manifest.json', { schema_version: '3.0', active_slices: [{ slice_id: 's1', phase: 'implementation', status: 'in_progress' }] });
  write(root, '.harness/state/registry.json', { slices: [{ slice_id: 's1' }] });
  write(root, '.harness/state/slices/s1/manifest.json', { slice_id: 's1', phase: 'implementation', status: 'in_progress' });
  write(root, '.harness/specs/s1/intent.md', '# s1\n\nMapped: `src/a.js`\n');
  write(root, '.harness/specs/s1/requirements.md', '- **REQ-001.** The system shall a.\n- **REQ-002.** The system shall b.\n');
  write(root, '.harness/features/s1.features.json', {
    schema_version: '1.0', slice_id: 's1', source_tasks: 'x',
    features: [{ id: 'F-01', title: 'a', user_visible_behavior: 'a', status: 'in_progress', priority: 1, verification: ['x'], req_ids: ['REQ-001'], scope_paths: ['src/a.js'] }],
  });
  write(root, '.harness/steering/domain-layer.md', '# Domain layer\n\nDomain must not import infrastructure.\n');
  write(root, '.harness/steering/domain-layer.project.md', `# Binding\n\n**Gate command:** \`${gate}\` (non-zero exit = not passing)\n`);
  write(root, '.harness/steering/quality-gates.md', '- **QG-DOM-01** domain pure\n- **QG-DRIFT-01** no unmapped files\n- **QG-SEC-01** other\n');
  write(root, 'arch-check.mjs', "console.log('src/a.js:3: domain imports infra');\nconsole.log('src/other.js:1: unrelated');\nprocess.exit(1);\n");
  write(root, 'src/a.js', 'export const a = 1;\n');
  write(root, 'test/a.test.js', '// covers REQ-001\n');
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'init');
  git(root, 'checkout', '-q', '-b', 'slice/s1/work');
  write(root, 'src/a.js', 'export const a = 2;\n');
  write(root, 'src/rogue.js', 'x\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'work');
  return root;
}

function snapshot(root) {
  const h = createHash('sha256');
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      if (name === '.git') continue;
      const abs = join(dir, name);
      if (statSync(abs).isDirectory()) walk(abs);
      else h.update(relative(root, abs)).update(readFileSync(abs));
    }
  };
  walk(root);
  return h.digest('hex');
}

function startServer(cwd, env) {
  const child = spawn(process.execPath, [SERVER], {
    cwd,
    env: env ? { ...process.env, ...env } : process.env,
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
  const request = (method, params) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => reject(new Error(`timeout waiting for ${method} response`)), 10000);
      pending.set(id, (message) => {
        clearTimeout(timer);
        resolve(message);
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  const call = async (name, args = {}) => {
    const response = await request('tools/call', { name, arguments: args });
    return { isError: response.result.isError === true, payload: JSON.parse(response.result.content[0].text) };
  };
  const close = () => {
    child.kill('SIGTERM');
    assert.deepEqual(errors, [], 'server wrote non-JSON lines on stdout');
  };
  return { request, call, close };
}

function withServer(fn, opts) {
  return async (t) => {
    const root = fixture(opts);
    const env = typeof opts?.env === 'function' ? opts.env(root) : opts?.env;
    const server = startServer(root, env);
    t.after(() => {
      server.close();
      rmSync(root, { recursive: true, force: true });
    });
    await fn(server, root);
  };
}

test('initialize declares tools, resources, and prompts', withServer(async (server) => {
  const res = await server.request('initialize', { protocolVersion: '2024-11-05', capabilities: {} });
  assert.equal(res.result.serverInfo.name, 'spec-drift-auditor');
  assert.ok(res.result.capabilities.tools && res.result.capabilities.resources && res.result.capabilities.prompts);
}));

test('REQ-012 REQ-016 REQ-017 REQ-024: tools, resources, and prompts are listed', withServer(async (server) => {
  const tools = (await server.request('tools/list')).result.tools.map((t) => t.name).sort();
  assert.deepEqual(tools, ['audit_diff', 'audit_finding', 'audit_report', 'generate_ci_gate', 'verify_architecture_rules', 'verify_spec_compliance']);
  const resources = (await server.request('resources/list')).result.resources.map((r) => r.uri);
  for (const uri of ['spec://manifest', 'spec://rules/architecture', 'spec://drift/latest-report']) assert.ok(resources.includes(uri), uri);
  const prompts = (await server.request('prompts/list')).result.prompts.map((p) => p.name).sort();
  assert.deepEqual(prompts, ['architecture-review', 'pr-review', 'spec-alignment']);
}));

test('REQ-012 REQ-019: audit_diff author mode reports drift and the summary', withServer(async (server) => {
  const { payload } = await server.call('audit_diff', { base_branch: 'main' });
  assert.equal(payload.mode, 'author');
  const drift01 = payload.findings.filter((f) => f.check === 'DRIFT-01');
  assert.deepEqual(drift01.map((f) => f.paths), [['src/rogue.js']]);
  assert.ok(drift01[0].id.startsWith('AUD-'));
  assert.equal(payload.summary.files_analyzed, 2);
  assert.equal(payload.summary.drift_level, 'blocking');
  assert.ok('spec_compliance' in payload.summary);
  const arch = payload.findings.filter((f) => f.check === 'ARCH');
  assert.deepEqual(arch.map((f) => f.paths[0]), ['src/a.js'], 'architecture findings are scoped to changed files');
}));

test('REQ-012: audit_diff review mode links slices and flags unlinked PRs', withServer(async (server, root) => {
  let { payload } = await server.call('audit_diff', { base_branch: 'main', mode: 'review' });
  assert.deepEqual(payload.summary.linked_slices, ['s1']);
  assert.ok(!payload.findings.some((f) => f.check === 'DRIFT-07'));
  git(root, 'checkout', '-q', '-b', 'feature/unlinked');
  ({ payload } = await server.call('audit_diff', { base_branch: 'main', mode: 'review' }));
  assert.ok(payload.findings.some((f) => f.check === 'DRIFT-07'));
}));

test('REQ-012 REQ-022: review mode suppresses dismissed findings until their files change', withServer(async (server, root) => {
  const { payload } = await server.call('audit_diff', { base_branch: 'main', mode: 'review' });
  const target = payload.findings.find((f) => f.check === 'DRIFT-01');
  const { pathsHash } = await import('../../.harness/scripts/audit-lib.mjs');
  write(root, '.harness/audits/triage.json', {
    [target.id]: { decision: 'dismissed', reason: 'spike', by: 'tl', at: '2026-10-21', paths_hash: pathsHash(root, target.paths) },
  });
  let res = (await server.call('audit_diff', { base_branch: 'main', mode: 'review' })).payload;
  assert.ok(!res.findings.some((f) => f.id === target.id));
  assert.deepEqual(res.suppressed.map((f) => f.id), [target.id]);
  write(root, 'src/rogue.js', 'changed\n');
  res = (await server.call('audit_diff', { base_branch: 'main', mode: 'review' })).payload;
  assert.ok(res.findings.some((f) => f.id === target.id), 'dismissal expires when the file changes');
}));

test('REQ-013: verify_architecture_rules runs the bound Gate command', withServer(async (server) => {
  const { payload } = await server.call('verify_architecture_rules', { paths: ['src/a.js'] });
  assert.equal(payload.status, 'fail');
  assert.deepEqual(payload.findings.map((f) => [f.paths[0], f.line]), [['src/a.js', 3]]);
}));

test('REQ-013: verify_architecture_rules is unconfigured (not a pass) without a Gate command', withServer(async (server) => {
  const { payload } = await server.call('verify_architecture_rules', {});
  assert.equal(payload.status, 'unconfigured');
  assert.ok(payload.sources.some((s) => s.id === 'domain-layer' && s.filled));
  assert.match(payload.message, /This is not a pass/);
}, { gate: '…' }));

test('REQ-013: verify_architecture_rules loads the installing app bindings and skips stubs', withServer(async (server, root) => {
  write(root, '.harness/config/project.json', {
    bindings: {
      product: 'docs/product.md',
      structure: '.harness/steering/structure.md',
      tech: '../outside.md',
      domain_layer: 'docs/layers.md',
    },
  });
  write(root, 'docs/product.md', '# Payments\n\nActors settle chips.\n');
  write(root, 'docs/layers.md', '# Layers\n\nDomain lives in `src/domain`.\n\n**Gate command:** `node arch-check.mjs`\n');
  write(root, '.harness/steering/structure.md', '# Project structure (stub)\n\n…\n');
  write(root, '.harness/steering/tech.md', '# Stack\n\nRuntime is Node 22. This default must not be used.\n');
  const { payload } = await server.call('verify_architecture_rules', { paths: ['src/a.js'] });
  assert.equal(payload.status, 'fail');
  const byId = Object.fromEntries(payload.sources.map((s) => [s.id, s]));
  assert.equal(byId.product.path, 'docs/product.md');
  assert.equal(byId.product.filled, true);
  assert.match(byId.product.text, /Actors settle chips/);
  assert.equal(byId['domain-layer.project'].path, 'docs/layers.md');
  assert.match(byId['domain-layer.project'].text, /src\/domain/);
  assert.equal(byId.structure.filled, false);
  assert.equal(byId.structure.text, undefined);
  assert.equal(byId.tech.path, '.harness/steering/tech.md', 'a binding path outside the repo falls back to the steering file');
  assert.match(byId.tech.text, /Node 22/);
  const rules = (await server.request('resources/read', { uri: 'spec://rules/architecture' })).result.contents[0].text;
  assert.match(rules, /Actors settle chips/);
  assert.match(rules, /structure\.md \(unfilled; not product truth\)/);
  assert.doesNotMatch(rules, /Project structure \(stub\)/);
}));

test('REQ-013: verify_architecture_rules generates Semgrep rules and returns violations with fixes', withServer(async (server, root) => {
  const { payload } = await server.call('verify_architecture_rules', { paths: ['src/a.js'] });
  assert.equal(payload.status, 'fail');
  assert.equal(payload.semgrep.source, 'generated');
  assert.match(payload.semgrep.yaml, /import \$X from \\"pg\\"/);
  const hit = payload.findings.find((f) => f.check === 'SEMGREP');
  assert.equal(hit.paths[0], 'src/a.js');
  assert.equal(hit.line, 3);
  assert.equal(hit.fix, 'import { Db } from "./port.js";');
  assert.equal(hit.remediation, 'use a port');
  assert.equal(existsSync(join(root, '.semgrep.yml')), false, 'generated config stays out of the repo');
}, {
  gate: '…',
  env(root) {
    write(root, '.harness/steering/domain-layer.project.md', '# Layers\n\n| Paths | Must not import |\n|-------|-----------------|\n| `src/domain/**` | `pg` |\n');
    write(root, '.harness/steering/tech.md', '# Stack\n\n| Layer | Technology |\n|-------|------------|\n| Language | TypeScript |\n');
    const bin = join(root, 'fake-semgrep.mjs');
    write(root, 'fake-semgrep.mjs', `#!/usr/bin/env node
import { readFileSync } from 'node:fs';
const config = process.argv[process.argv.indexOf('--config') + 1];
const yaml = readFileSync(config, 'utf8');
if (!yaml.includes('pg')) process.exit(2);
process.stdout.write(JSON.stringify({ results: [{ check_id: 'harness-arch-typescript-1', path: 'src/a.js', start: { line: 3 }, extra: { message: 'domain imports pg', severity: 'ERROR', fix: 'import { Db } from "./port.js";', metadata: { remediation: 'use a port' } } }] }));
`);
    chmodSync(bin, 0o755);
    return { HARNESS_SEMGREP: bin };
  },
}));

test('REQ-014: verify_spec_compliance runs the ears adapter', withServer(async (server) => {
  const { payload } = await server.call('verify_spec_compliance', { slice_id: 's1' });
  assert.equal(payload.adapters.ears.must_requirements, 2);
  assert.equal(payload.adapters.ears.spec_compliance, 0.5);
  assert.ok(payload.adapters.ears.findings.some((f) => f.check === 'DRIFT-03' && f.node === 'req:s1:REQ-002'));
  assert.equal((await server.call('verify_spec_compliance', { slice_id: 'ghost' })).isError, true);
  assert.equal((await server.call('verify_spec_compliance', { slice_id: 's1', adapter: 'nope' })).isError, true);
}));

test('REQ-014: module adapters load only for enabled modules', withServer(async (server, root) => {
  const adapter = (id, status) => `export default { id: '${id}', run: ({ sliceId }) => ({ status: '${status}', findings: [{ id: 'AUD-00000001', check: 'CONTRACT', severity: 'fail', slice_id: sliceId, paths: [], message: 'x' }] }) };\n`;
  write(root, '.harness/config/project.json', { modules: { 'http-api': true, 'web-ui': false } });
  write(root, '.agents/modules/http-api/adapters/fake.mjs', adapter('fake', 'fail'));
  write(root, '.agents/modules/web-ui/adapters/off.mjs', adapter('off', 'fail'));
  write(root, '.agents/mcp/adapters/local.mjs', adapter('local', 'fail'));
  let { payload } = await server.call('verify_spec_compliance', { slice_id: 's1' });
  assert.deepEqual(Object.keys(payload.adapters).sort(), ['ears', 'fake', 'local']);
  assert.equal(payload.summary.drift_level, 'blocking');
  ({ payload } = await server.call('verify_spec_compliance', { slice_id: 's1', adapter: 'fake' }));
  assert.deepEqual(Object.keys(payload.adapters), ['fake']);
}));

test('REQ-015: generate_ci_gate returns text for github and gitlab', withServer(async (server) => {
  for (const provider of ['github', 'gitlab']) {
    const { payload } = await server.call('generate_ci_gate', { provider });
    assert.match(payload.content, /check-invariants\.mjs/);
    assert.match(payload.content, /HARNESS_PR_BRANCH/);
  }
  assert.equal((await server.call('generate_ci_gate', { provider: 'jenkins' })).isError, true);
}));

test('REQ-016: resources read manifest, architecture rules, and the latest report', withServer(async (server) => {
  const read = async (uri) => (await server.request('resources/read', { uri })).result.contents[0].text;
  assert.equal(JSON.parse(await read('spec://manifest')).slices.s1.slice_id, 's1');
  const rules = await read('spec://rules/architecture');
  assert.match(rules, /Domain must not import infrastructure/);
  assert.match(rules, /QG-DRIFT-01/);
  assert.doesNotMatch(rules, /QG-SEC-01/);
  assert.equal(JSON.parse(await read('spec://drift/latest-report')).source, 'fresh check-spec-drift');
  await server.call('audit_diff', { base_branch: 'main' });
  assert.equal(JSON.parse(await read('spec://drift/latest-report')).source, 'audit_diff (this session)');
  assert.equal((await server.request('resources/read', { uri: 'spec://nope' })).error.code, -32002);
}));

test('REQ-017: prompts render with arguments and reject missing required ones', withServer(async (server) => {
  const res = await server.request('prompts/get', { name: 'pr-review', arguments: { base_branch: 'main', target_branch: 'slice/s1/work' } });
  assert.match(res.result.messages[0].content.text, /audit_diff/);
  assert.match(res.result.messages[0].content.text, /mode "review"/);
  assert.equal((await server.request('prompts/get', { name: 'spec-alignment', arguments: {} })).error.code, -32602);
}));

test('REQ-024: audit_report filters the latest report; audit_finding returns one finding', withServer(async (server, root) => {
  assert.equal((await server.call('audit_report', {})).isError, true, 'no report yet');
  const finding = (id, severity, last_seen) => ({ id, check: 'UNOWNED', severity, slice_id: null, node: null, paths: ['src/a.js'], message: id, last_seen });
  write(root, '.harness/audits/2026-10-01T00-00-00-000Z.json', { generated_at: '2026-10-01', findings: [finding('AUD-00000000', 'warn', '2026-10-01')] });
  write(root, '.harness/audits/2026-10-20T00-00-00-000Z.json', {
    generated_at: '2026-10-20',
    findings: [finding('AUD-11111111', 'fail', '2026-10-20'), finding('AUD-22222222', 'advisory', '2026-10-10')],
  });
  let { payload } = await server.call('audit_report', {});
  assert.equal(payload.path, '.harness/audits/2026-10-20T00-00-00-000Z.json');
  assert.equal(payload.findings.length, 2);
  ({ payload } = await server.call('audit_report', { severity: 'fail' }));
  assert.deepEqual(payload.findings.map((f) => f.id), ['AUD-11111111']);
  ({ payload } = await server.call('audit_report', { since: '2026-10-15' }));
  assert.deepEqual(payload.findings.map((f) => f.id), ['AUD-11111111']);
  ({ payload } = await server.call('audit_finding', { id: 'AUD-22222222' }));
  assert.equal(payload.finding.severity, 'advisory');
  assert.equal((await server.call('audit_finding', { id: 'AUD-99999999' })).isError, true);
}));

const UI_CAPS = { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } } };

test('REQ-026 REQ-027: MCP Apps hosts get the dashboard; results keep the JSON text', withServer(async (server) => {
  await server.request('initialize', { protocolVersion: '2026-01-26', capabilities: UI_CAPS });
  const tools = (await server.request('tools/list')).result.tools;
  const linked = tools.filter((t) => t._meta?.ui?.resourceUri === 'ui://spec-drift/dashboard').map((t) => t.name).sort();
  assert.deepEqual(linked, ['audit_diff', 'audit_finding', 'audit_report', 'generate_ci_gate', 'verify_architecture_rules', 'verify_spec_compliance']);
  const resources = (await server.request('resources/list')).result.resources;
  assert.ok(resources.some((r) => r.uri === 'ui://spec-drift/dashboard' && r.mimeType === 'text/html;profile=mcp-app'));
  const [content] = (await server.request('resources/read', { uri: 'ui://spec-drift/dashboard' })).result.contents;
  assert.equal(content.mimeType, 'text/html;profile=mcp-app');
  assert.match(content.text, /^<!doctype html>/i);
  assert.match(content.text, /ui\/initialize/);
  assert.doesNotMatch(content.text, /<script[^>]+src=/, 'single self-contained file');
  const res = (await server.request('tools/call', { name: 'audit_diff', arguments: { base_branch: 'main' } })).result;
  assert.deepEqual(JSON.parse(res.content[0].text), res.structuredContent);
  const gate = (await server.request('tools/call', { name: 'generate_ci_gate', arguments: { provider: 'github' } })).result;
  assert.equal(gate.structuredContent.provider, 'github');
}));

const UI_BUDGET = 8000;

test('REQ-026: MCP Apps results fit the inline budget; the same tool pages in the rest', withServer(async (server, root) => {
  await server.request('initialize', { protocolVersion: '2026-01-26', capabilities: UI_CAPS });
  const paths = Array.from({ length: 40 }, (_, i) => `apps/api/src/module-${i}/handler.ts`);
  const findings = Array.from({ length: 120 }, (_, i) => ({
    id: `AUD-${String(i).padStart(8, '0')}`, source: i % 10 ? 'computational' : 'inferential', check: 'UNOWNED',
    severity: ['fail', 'warn', 'advisory'][i % 3], slice_id: null, node: null, paths, message: `finding ${i} `.repeat(8),
  }));
  write(root, '.harness/audits/2026-10-20T00-00-00-000Z.json', {
    generated_at: '2026-10-20', commit: 'abc1234', summary: { files_analyzed: 10 }, findings,
    recurring: findings.slice(0, 30).map((f) => f.id), hotspots: [], commands: [], notes: ['n'],
  });
  const res = (await server.request('tools/call', { name: 'audit_report', arguments: {} })).result;
  assert.ok(res.content[0].text.length <= UI_BUDGET, `text is ${res.content[0].text.length} bytes`);
  const first = res.structuredContent;
  assert.deepEqual(first.page.by_severity, { fail: 40, warn: 40, advisory: 40 });
  assert.equal(first.page.by_source.inferential, 12);
  assert.equal(first.recurring, 30);
  assert.equal(first.findings[0].recurring, true);
  assert.equal(first.findings[0].paths.length, 5);
  assert.equal(first.findings[0].paths_total, 40);
  assert.equal(first.page.tool, 'audit_report');
  const ids = first.findings.map((f) => f.id);
  let offset = first.page.count;
  while (offset !== null) {
    const { payload } = await server.call('audit_report', { page_token: first.page.token, offset });
    assert.ok(payload.findings.length > 0);
    assert.equal(payload.findings[0].paths.length, 40, 'pages keep every path');
    ids.push(...payload.findings.map((f) => f.id));
    offset = payload.next;
  }
  assert.deepEqual(ids, findings.map((f) => f.id));
  assert.equal((await server.call('audit_report', { page_token: 'nope' })).isError, true);
}));

test('REQ-026: MCP Apps architecture results omit source texts; source returns them', withServer(async (server) => {
  await server.request('initialize', { protocolVersion: '2026-01-26', capabilities: UI_CAPS });
  const res = (await server.request('tools/call', { name: 'verify_architecture_rules', arguments: {} })).result;
  assert.ok(res.content[0].text.length <= UI_BUDGET);
  const domain = res.structuredContent.sources.find((s) => s.id === 'domain-layer');
  assert.equal(domain.filled, true);
  assert.equal(domain.text, undefined);
  const { payload: list } = await server.call('verify_architecture_rules', { source: 'list' });
  assert.ok(list.sources.find((s) => s.id === 'domain-layer').bytes > 0);
  const { payload: one } = await server.call('verify_architecture_rules', { source: 'domain-layer' });
  assert.match(one.text, /must not import infrastructure/);
  assert.equal((await server.call('verify_architecture_rules', { source: 'nope' })).isError, true);
  const { payload: full } = await server.call('verify_architecture_rules', { include_text: true });
  assert.match(full.sources.find((s) => s.id === 'domain-layer').text, /must not import/);
}));

test('REQ-027: hosts without MCP Apps get plain tools and text results', withServer(async (server) => {
  await server.request('initialize', { protocolVersion: '2024-11-05', capabilities: {} });
  const tools = (await server.request('tools/list')).result.tools;
  assert.ok(tools.every((t) => !t._meta));
  const resources = (await server.request('resources/list')).result.resources;
  assert.ok(!resources.some((r) => r.uri.startsWith('ui://')));
  const res = (await server.request('tools/call', { name: 'audit_diff', arguments: { base_branch: 'main' } })).result;
  assert.equal(res.structuredContent, undefined);
  assert.equal(JSON.parse(res.content[0].text).mode, 'author');
}));

test('REQ-018: the server is read-only', withServer(async (server, root) => {
  const before = snapshot(root);
  await server.call('audit_diff', { base_branch: 'main', mode: 'review' });
  await server.call('verify_architecture_rules', {});
  await server.call('verify_spec_compliance', { slice_id: 's1' });
  await server.call('generate_ci_gate', { provider: 'github' });
  await server.call('audit_report', {});
  await server.request('resources/read', { uri: 'spec://drift/latest-report' });
  assert.equal(snapshot(root), before);
}));
