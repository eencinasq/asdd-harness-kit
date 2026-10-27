import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { globToRegExp, linkedSlices, readBinding, runDrift, specPaths } from './drift-lib.mjs';

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

function fixture({ phase = 'implementation', features, requirements, intent, withGit = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'drift-lib-'));
  write(root, '.harness/state/manifest.json', {
    schema_version: '3.0',
    active_slices: [{ slice_id: 's1', phase, status: 'in_progress' }],
  });
  write(root, '.harness/state/slices/s1/manifest.json', { slice_id: 's1', phase, status: 'in_progress' });
  write(root, '.harness/specs/s1/intent.md', intent ?? '# s1\n\nMapped: `src/a.js`, `lib/`\n');
  write(root, '.harness/specs/s1/requirements.md', requirements ?? '- **REQ-001.** The system shall a.\n- **REQ-002.** The system shall b.\n- **REQ-003.** (SHOULD) The system shall c.\n');
  write(root, '.harness/features/s1.features.json', {
    schema_version: '1.0',
    slice_id: 's1',
    source_tasks: '.harness/specs/s1/tasks.md',
    features: features ?? [
      { id: 'F-01', title: 'a', user_visible_behavior: 'a', status: 'in_progress', priority: 1, verification: ['x'], req_ids: ['REQ-001'], scope_paths: ['src/a.js'] },
    ],
  });
  write(root, 'src/a.js', 'export const a = 1;\n');
  write(root, 'test/a.test.js', '// covers REQ-001\n');
  if (withGit) {
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'init');
  }
  return root;
}

const checks = (res, check) => res.findings.filter((f) => f.check === check);

test('REQ-004 DRIFT-01: unmapped changed product file fails, mapped and exempt files pass', () => {
  const root = fixture();
  try {
    write(root, 'src/a.js', 'export const a = 2;\n');
    write(root, 'lib/util.js', 'x\n');
    write(root, '.harness/specs/s1/notes.md', 'exempt harness record\n');
    assert.deepEqual(checks(runDrift({ root }), 'DRIFT-01'), []);
    write(root, 'src/rogue.js', 'x\n');
    const res = runDrift({ root });
    const f = checks(res, 'DRIFT-01');
    assert.equal(f.length, 1);
    assert.deepEqual(f[0].paths, ['src/rogue.js']);
    assert.equal(f[0].severity, 'fail');
    assert.equal(res.summary.drift_level, 'blocking');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('REQ-004 (drift-consistency) DRIFT-01: a test file naming a REQ of the editing slice is mapped', () => {
  const root = fixture();
  try {
    write(root, 'test/a.test.js', '// covers REQ-001\nexport const more = 1;\n'); // changed, names a slice REQ
    write(root, 'test/b.spec.js', "test('REQ-003 refresh', () => {});\n"); // new, names a SHOULD REQ
    assert.deepEqual(checks(runDrift({ root }), 'DRIFT-01'), []);

    write(root, 'test/c.test.js', '// no requirement named\n');
    write(root, 'test/d.test.js', '// covers REQ-999 of another slice\n');
    write(root, 'src/helper.js', '// REQ-001 in a non-test file is not enough\n');
    const paths = checks(runDrift({ root }), 'DRIFT-01').map((f) => f.paths[0]).sort();
    assert.deepEqual(paths, ['src/helper.js', 'test/c.test.js', 'test/d.test.js']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('REQ-004 DRIFT-01: files the kit installer manages are exempt in installed projects', () => {
  const root = fixture();
  try {
    write(root, '.harness/config/installed-versions.json', { kit_version: '3.4.0', artifacts: {}, managed_files: ['scripts/install-into.sh', '.harness/scripts/drift-lib.mjs'] });
    write(root, 'scripts/install-into.sh', '#!/bin/sh\n');
    write(root, '.harness/scripts/drift-lib.mjs', '// kit\n');
    write(root, 'scripts/project-tool.sh', '#!/bin/sh\n');
    assert.deepEqual(checks(runDrift({ root }), 'DRIFT-01').map((f) => f.paths[0]), ['scripts/project-tool.sh']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('REQ-004 DRIFT-01: installer seeds are exempt only while unedited', () => {
  const root = fixture();
  try {
    const seed = '# Portability\n';
    const sha = createHash('sha256').update(seed).digest('hex');
    write(root, '.harness/config/installed-versions.json', { kit_version: '3.5.1', artifacts: {}, managed_files: [], seeded_files: { 'docs/seed.md': sha, 'docs/gone.md': sha } });
    write(root, 'docs/seed.md', seed);
    assert.deepEqual(checks(runDrift({ root }), 'DRIFT-01'), []);
    write(root, 'docs/seed.md', `${seed}Project edit.\n`);
    assert.deepEqual(checks(runDrift({ root }), 'DRIFT-01').map((f) => f.paths[0]), ['docs/seed.md']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('REQ-004 DRIFT-01: skipped while no slice is editing; an in_progress feature counts as editing', () => {
  const idle = [{ id: 'F-01', title: 'a', user_visible_behavior: 'a', status: 'not_started', priority: 1, verification: ['x'], scope_paths: ['src/a.js'] }];
  const root = fixture({ phase: 'design', features: idle });
  try {
    write(root, 'src/rogue.js', 'x\n');
    assert.deepEqual(checks(runDrift({ root }), 'DRIFT-01'), []);
    write(root, '.harness/features/s1.features.json', {
      schema_version: '1.0', slice_id: 's1', source_tasks: 'x',
      features: [{ ...idle[0], status: 'in_progress' }],
    });
    assert.equal(checks(runDrift({ root }), 'DRIFT-01').length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('REQ-005 DRIFT-02: passing feature reopens when owned files change after evidence_commit', () => {
  const root = fixture();
  try {
    const sha = git(root, 'rev-parse', 'HEAD');
    write(root, '.harness/features/s1.features.json', {
      schema_version: '1.0', slice_id: 's1', source_tasks: 'x',
      features: [{ id: 'F-01', title: 'a', user_visible_behavior: 'a', status: 'passing', priority: 1, verification: ['x'], evidence: 'ok', evidence_commit: sha, req_ids: ['REQ-001'], scope_paths: ['src'] }],
    });
    assert.deepEqual(checks(runDrift({ root }), 'DRIFT-02'), [], 'features file is a harness record');
    write(root, 'src/new.js', 'untracked\n');
    let f = checks(runDrift({ root }), 'DRIFT-02');
    assert.equal(f.length, 1);
    assert.deepEqual(f[0].paths, ['src/new.js']);
    rmSync(join(root, 'src/new.js'));
    write(root, 'src/a.js', 'changed\n');
    git(root, 'commit', '-q', '-am', 'later change');
    f = checks(runDrift({ root }), 'DRIFT-02');
    assert.deepEqual(f[0].paths, ['src/a.js']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('REQ-005 DRIFT-02: unknown evidence_commit fails', () => {
  const root = fixture({
    features: [{ id: 'F-01', title: 'a', user_visible_behavior: 'a', status: 'passing', priority: 1, verification: ['x'], evidence: 'ok', evidence_commit: 'deadbeefdeadbeef', scope_paths: ['src/a.js'] }],
  });
  try {
    assert.match(checks(runDrift({ root }), 'DRIFT-02')[0].message, /not in this repository/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('REQ-006 REQ-007 DRIFT-03/04: requirement coverage at qa, SHOULD excluded from DRIFT-03', () => {
  const root = fixture({ phase: 'qa' });
  try {
    const res = runDrift({ root });
    assert.deepEqual(checks(res, 'DRIFT-03').map((f) => f.node), ['req:s1:REQ-002']);
    assert.deepEqual(checks(res, 'DRIFT-04').map((f) => f.node).sort(), ['req:s1:REQ-002', 'req:s1:REQ-003']);
    assert.equal(checks(res, 'DRIFT-04')[0].severity, 'warn');
    assert.equal(res.summary.spec_compliance, 0.5);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('REQ-006 DRIFT-03: not emitted during implementation unless forced', () => {
  const root = fixture();
  try {
    assert.deepEqual(checks(runDrift({ root }), 'DRIFT-03'), []);
    assert.equal(checks(runDrift({ root, requirementChecks: true }), 'DRIFT-03').length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('REQ-008 DRIFT-05: passing feature owning a missing path fails; planned paths do not', () => {
  const root = fixture({
    features: [
      { id: 'F-01', title: 'a', user_visible_behavior: 'a', status: 'passing', priority: 1, verification: ['x'], evidence: 'ok', scope_paths: ['src/gone.js'] },
      { id: 'F-02', title: 'b', user_visible_behavior: 'b', status: 'not_started', priority: 2, verification: ['x'], scope_paths: ['src/planned.js'] },
    ],
  });
  try {
    const f = checks(runDrift({ root }), 'DRIFT-05');
    assert.equal(f.length, 1);
    assert.deepEqual(f[0].paths, ['src/gone.js']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('REQ-008 DRIFT-05: a glob scope exists when at least one file matches it', () => {
  const globs = ['src/**', '**/*.test.js', 'test/**/*.js', 'gone/**', '**/*.spec.ts'];
  for (const withGit of [true, false]) {
    const root = fixture({
      withGit,
      features: [
        { id: 'F-01', title: 'a', user_visible_behavior: 'a', status: 'passing', priority: 1, verification: ['x'], evidence: 'ok', scope_paths: globs },
      ],
    });
    try {
      const f = checks(runDrift({ root }), 'DRIFT-05');
      assert.deepEqual(f.map((x) => x.paths[0]).sort(), ['**/*.spec.ts', 'gone/**'], `withGit=${withGit}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test('REQ-001 REQ-002 DRIFT-06: contract findings follow drift.contract', () => {
  const root = fixture({
    features: [{ id: 'F-01', title: 'a', user_visible_behavior: 'a', status: 'passing', priority: 1, verification: ['x'], evidence: 'ok' }],
  });
  try {
    let f = checks(runDrift({ root }), 'DRIFT-06');
    assert.equal(f.length, 2);
    assert.ok(f.every((x) => x.severity === 'warn'));
    write(root, '.harness/config/project.json', { drift: { contract: 'fail' } });
    f = checks(runDrift({ root }), 'DRIFT-06');
    assert.ok(f.every((x) => x.severity === 'fail'));
    assert.deepEqual(checks(runDrift({ root, includeContract: false }), 'DRIFT-06'), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('REQ-009 DRIFT-07: PR must name an active slice', () => {
  const root = fixture();
  try {
    git(root, 'checkout', '-q', '-b', 'feature/x');
    write(root, 'src/a.js', 'pr change\n');
    git(root, 'commit', '-q', '-am', 'pr');
    assert.equal(checks(runDrift({ root, prBranch: 'feature/x' }), 'DRIFT-07').length, 1);
    assert.equal(checks(runDrift({ root, prBranch: 'feature/x', prBody: 'Fixes it\nSlice: ghost\n' }), 'DRIFT-07').length, 1);
    assert.deepEqual(checks(runDrift({ root, prBranch: 'slice/s1/login' }), 'DRIFT-07'), []);
    const res = runDrift({ root, prBranch: 'feature/x', prBody: 'Slice: s1' });
    assert.deepEqual(checks(res, 'DRIFT-07'), []);
    assert.deepEqual(res.summary.linked_slices, ['s1']);
    assert.equal(res.summary.base, 'main');
    assert.equal(res.summary.files_analyzed, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('REQ-010: outside a git work tree, git checks are skipped with one WARN', () => {
  const root = fixture({ withGit: false });
  try {
    const res = runDrift({ root });
    assert.deepEqual(res.findings.map((f) => f.check), ['DRIFT-00']);
    assert.equal(res.findings[0].severity, 'warn');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('REQ-011: check-spec-drift --json reports findings and exits 1 on FAIL', () => {
  const root = fixture();
  try {
    write(root, 'src/rogue.js', 'x\n');
    const r = spawnSync(process.execPath, [join(here, 'check-spec-drift.mjs'), '--json'], { cwd: root, encoding: 'utf8' });
    assert.equal(r.status, 1);
    const out = JSON.parse(r.stdout);
    assert.ok(out.findings.some((f) => f.check === 'DRIFT-01' && f.id.startsWith('AUD-')));
    assert.equal(out.summary.drift_level, 'blocking');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('helpers: spec paths, bindings, globs, slice links', () => {
  const root = fixture({ intent: 'See `src/a.js`, `node x.mjs`, `REQ-001`, [doc](../../../docs/x.md), `.harness/specs/<slice>/a.md`, `lib/`\n', withGit: false });
  try {
    assert.deepEqual([...specPaths(root, 's1')].sort(), ['docs/x.md', 'lib', 'src/a.js']);
    write(root, '.harness/steering/quality-gates.project.md', '- Test file globs: `spec/**/*.rb`, `…` (default: `**/*.test.*`)\n- Drift base branch: `…` (default: `main`)\n- Audit commands: `…` (for example `deps=npm audit`)\n');
    const qg = '.harness/steering/quality-gates.project.md';
    assert.deepEqual(readBinding(root, qg, 'Test file globs'), ['spec/**/*.rb']);
    assert.deepEqual(readBinding(root, qg, 'Drift base branch'), []);
    assert.deepEqual(readBinding(root, qg, 'Audit commands'), [], 'examples in parentheses are not values');
    assert.ok(globToRegExp('**/*.test.*').test('a/b/c.test.js'));
    assert.ok(globToRegExp('**/*.test.*').test('c.test.js'));
    assert.ok(!globToRegExp('src/*.js').test('src/a/b.js'));
    assert.deepEqual(linkedSlices('refs/heads/slice/s1/x', '', new Set(['s1'])), ['s1']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
