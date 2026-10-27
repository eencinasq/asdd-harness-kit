import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isProductFile, runAudit, writeReport } from './audit-codebase.mjs';

const here = dirname(fileURLToPath(import.meta.url));

function write(root, rel, content) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`);
}

function git(root, ...args) {
  const r = spawnSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', ...args], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

/** Slice s1 at qa owns src/a.js; REQ-002 has no feature; lib/orphan.js is unowned. */
function fixture({ auditCommands } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'audit-'));
  write(root, '.harness/state/manifest.json', { schema_version: '3.0', active_slices: [{ slice_id: 's1', phase: 'qa', status: 'in_progress' }] });
  write(root, '.harness/state/slices/s1/manifest.json', { slice_id: 's1', phase: 'qa', status: 'in_progress' });
  write(root, '.harness/specs/s1/intent.md', '# s1\n\nMapped: `src/a.js`\n');
  write(root, '.harness/specs/s1/requirements.md', '- **REQ-001.** The system shall a.\n- **REQ-002.** The system shall b.\n');
  write(root, '.harness/features/s1.features.json', {
    schema_version: '1.0', slice_id: 's1', source_tasks: 'x',
    features: [{ id: 'F-01', title: 'a', user_visible_behavior: 'a', status: 'in_progress', priority: 1, verification: ['x'], req_ids: ['REQ-001'], scope_paths: ['src/a.js'] }],
  });
  if (auditCommands) write(root, '.harness/steering/quality-gates.project.md', `- Audit commands: ${auditCommands}\n`);
  write(root, 'src/a.js', 'export const a = 1;\n');
  write(root, 'lib/orphan.js', 'export const o = 1;\n');
  write(root, 'test/a.test.js', '// covers REQ-001\n');
  write(root, 'README.md', '# docs are not product code\n');
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'init');
  write(root, 'src/a.js', 'export const a = 2;\n');
  git(root, 'commit', '-q', '-am', 'churn');
  return root;
}

function withFixture(fn, opts) {
  return () => {
    const root = fixture(opts);
    try {
      fn(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };
}

const byCheck = (report, check) => report.findings.filter((f) => f.check === check);

test('REQ-020: report covers drift over all slices, unowned code, unconfigured commands, and hotspots', withFixture((root) => {
  const report = runAudit({ root, now: '2026-10-21T09:00:00.000Z' });
  assert.deepEqual(byCheck(report, 'DRIFT-03').map((f) => f.node), ['req:s1:REQ-002']);
  const unowned = byCheck(report, 'UNOWNED');
  assert.deepEqual(unowned.map((f) => f.paths), [['lib/orphan.js']], 'tests and README are not unowned product code');
  assert.ok(!unowned.some((f) => f.paths.includes('src/a.js')));
  assert.deepEqual(report.unconfigured.sort(), ['architecture', 'audit-commands', 'semgrep']);
  assert.equal(report.semgrep.status, 'unconfigured');
  assert.equal(report.hotspots[0].path, 'src/a.js');
  assert.equal(report.hotspots[0].churn, 2);
  assert.equal(report.hotspots[0].req_links, 1);
  assert.ok(report.commit);
  const rel = writeReport(root, report);
  assert.match(rel, /^\.harness\/audits\/2026-10-21T09-00-00-000Z\.json$/);
  assert.equal(JSON.parse(readFileSync(join(root, rel), 'utf8')).summary.spec_compliance, 0.5);
}));

test('REQ-021: finding IDs are stable and occurrences carry over', withFixture((root) => {
  const first = runAudit({ root, now: '2026-10-21T09:00:00.000Z' });
  writeReport(root, first);
  const second = runAudit({ root, now: '2026-10-22T09:00:00.000Z' });
  const a = byCheck(first, 'UNOWNED')[0];
  const b = byCheck(second, 'UNOWNED')[0];
  assert.equal(a.id, b.id);
  assert.equal(b.occurrences, 2);
  assert.equal(b.first_seen, '2026-10-21T09:00:00.000Z');
  assert.equal(b.last_seen, '2026-10-22T09:00:00.000Z');
  write(root, 'lib/second.js', 'x\n');
  git(root, 'add', '-A');
  const third = runAudit({ root });
  assert.equal(byCheck(third, 'UNOWNED')[0].id, a.id, 'a new file in the same directory keeps the ID');
}));

test('REQ-022: audit-triage dismissal suppresses a finding until its files change', withFixture((root) => {
  const report = runAudit({ root });
  writeReport(root, report);
  const id = byCheck(report, 'UNOWNED')[0].id;
  const triage = (...args) => spawnSync(process.execPath, [join(here, 'audit-triage.mjs'), ...args], { cwd: root, encoding: 'utf8' });
  assert.equal(triage(id, '--dismiss').status, 1, 'dismissal requires a reason');
  assert.equal(triage(id, '--dismiss', '--reason', 'legacy, ADR-001').status, 0);
  let next = runAudit({ root });
  assert.ok(!next.findings.some((f) => f.id === id));
  assert.deepEqual(next.suppressed.map((f) => f.id), [id]);
  write(root, 'lib/orphan.js', 'export const o = 2;\n');
  next = runAudit({ root });
  assert.ok(next.findings.some((f) => f.id === id), 'changed file brings the finding back');
  assert.equal(triage(id, '--clear').status, 0);
  assert.deepEqual(JSON.parse(readFileSync(join(root, '.harness/audits/triage.json'), 'utf8')), {});
}));

test('REQ-020: bound audit commands run; failures become findings', withFixture((root) => {
  const report = runAudit({ root });
  assert.deepEqual(report.commands.map((c) => [c.name, c.status]), [['ok', 'pass'], ['deps', 'fail']]);
  assert.deepEqual(byCheck(report, 'AUDIT-CMD').map((f) => [f.node, f.severity]), [['command:deps', 'fail']]);
  assert.deepEqual(report.unconfigured, ['architecture', 'semgrep']);
}, { auditCommands: '`ok=node -e "process.exit(0)"`, `deps=node -e "process.exit(3)"`' }));

test('REQ-020: codebase audit runs Semgrep and keeps the problem and the fix', withFixture((root) => {
  write(root, '.semgrep.yml', 'rules: []\n');
  const bin = join(root, 'fake-semgrep.mjs');
  write(root, 'fake-semgrep.mjs', `#!/usr/bin/env node
process.stdout.write(JSON.stringify({ results: [{
  check_id: 'layers.domain',
  path: 'src/a.js',
  start: { line: 1 },
  extra: {
    message: 'domain imports pg',
    severity: 'ERROR',
    lines: 'import pg from "pg";',
    fix: 'import { Db } from "./port.js";',
    metadata: { remediation: 'use a port' }
  }
}] }));
`);
  chmodSync(bin, 0o755);
  const previous = process.env.HARNESS_SEMGREP;
  process.env.HARNESS_SEMGREP = bin;
  try {
    const report = runAudit({ root, now: '2026-10-21T09:00:00.000Z' });
    const hit = byCheck(report, 'SEMGREP')[0];
    assert.equal(hit.rule, 'layers.domain');
    assert.equal(hit.paths[0], 'src/a.js');
    assert.equal(hit.line, 1);
    assert.equal(hit.code, 'import pg from "pg";');
    assert.equal(hit.fix, 'import { Db } from "./port.js";');
    assert.equal(hit.remediation, 'use a port');
    assert.equal(hit.severity, 'fail');
    assert.equal(report.semgrep.status, 'fail');
    assert.equal(report.semgrep.source, 'selected');
    assert.equal(report.semgrep.path, '.semgrep.yml');
    assert.ok(!report.unconfigured.includes('semgrep'));
    assert.equal(report.summary.drift_level, 'blocking');
    const saved = JSON.parse(readFileSync(join(root, writeReport(root, report)), 'utf8'));
    assert.equal(saved.findings.find((f) => f.check === 'SEMGREP').fix, 'import { Db } from "./port.js";');
    assert.equal(saved.semgrep.yaml, undefined, 'the audit report does not store generated YAML');
  } finally {
    if (previous === undefined) delete process.env.HARNESS_SEMGREP;
    else process.env.HARNESS_SEMGREP = previous;
  }
}));

test('product file classification', () => {
  assert.ok(isProductFile('src/a.ts'));
  assert.ok(isProductFile('scripts/build.sh'));
  for (const f of ['.harness/scripts/x.mjs', '.agents/skills/a/SKILL.md', 'docs/x.md', 'README.md', 'package.json', '.gitignore']) {
    assert.ok(!isProductFile(f), f);
  }
});
