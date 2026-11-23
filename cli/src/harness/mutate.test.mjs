// asdd mutate (slice mutation-testing): the Mutation command binding run on a slice's feature files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { TIMEOUT_MS, runMutation } from './mutate.mjs';

const BIN = join(import.meta.dirname, '../../bin/asdd.mjs');

/** A git repo with one slice: TASK-001 (passing) owns src/a.mjs + its test + a doc, TASK-002 (not_started) owns src/b.mjs. */
function project(binding) {
  const root = mkdtempSync(join(tmpdir(), 'asdd-mutate-'));
  const w = (rel, text) => {
    mkdirSync(join(root, rel, '..'), { recursive: true });
    writeFileSync(join(root, rel), text);
  };
  w('src/a.mjs', 'export const a = (x) => x + 1;\n');
  w("src/it's.mjs", 'export const q = 1;\n');
  w('src/b.mjs', 'export const b = 2;\n');
  w('src/a.test.mjs', '// REQ-001\n');
  w('src/README.md', '# a\n');
  w('.harness/steering/quality-gates.project.md', `# bindings\n\n- Mutation command: ${binding}\n`);
  w('.harness/state/slices/s1/manifest.json', JSON.stringify({ slice_id: 's1', status: 'in_progress', paths: { features: '.harness/features/s1.features.json' } }));
  w('.harness/features/s1.features.json', JSON.stringify({ features: [
    { id: 'TASK-001', status: 'passing', scope_paths: ['src/a.mjs', 'src/a.test.mjs', 'src/README.md', "src/it's.mjs"] },
    { id: 'TASK-002', status: 'not_started', scope_paths: ['src/b.mjs'] },
  ] }));
  spawnSync('git', ['init', '-q'], { cwd: root });
  return root;
}
const fake = (status, stdout = '', extra = {}) => {
  const calls = [];
  const exec = (command) => {
    calls.push(command);
    return { status, stdout, stderr: '', ...extra };
  };
  return { exec, calls };
};
const withProject = (binding, fn) => {
  const root = project(binding);
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

test('REQ-001 the bound command runs once on the quoted feature files: exit 0 → pass, non-zero → survivors', () => {
  withProject('`npx stryker run --mutate {files}`', (root) => {
    const ok = fake(0, 'all killed');
    const r = runMutation({ root, sliceId: 's1', exec: ok.exec });
    assert.equal(r.status, 'pass');
    assert.deepEqual(r.features, ['TASK-001']);
    // Test files, docs, and features not in progress or passing are left out; paths are POSIX single-quoted.
    assert.deepEqual(r.files, ["src/a.mjs", "src/it's.mjs"]);
    assert.deepEqual(ok.calls, [`npx stryker run --mutate 'src/a.mjs' 'src/it'\\''s.mjs'`]);
    assert.equal(r.files_substituted, true);
    const bad = fake(1, 'Survived: src/a.mjs:1 ArithmeticOperator');
    assert.equal(runMutation({ root, sliceId: 's1', exec: bad.exec }).status, 'survivors');
  });
});

const cliIn = (root, ...args) => spawnSync(process.execPath, [BIN, 'mutate', '--slice', 's1', ...args], { cwd: root, encoding: 'utf8' });

test('REQ-001 REQ-004 REQ-006 exit codes through the CLI: pass 0, no-files 0, error 2', () => {
  withProject('`true {files}`', (root) => {
    const r = cliIn(root, '--json');
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).status, 'pass');
    writeFileSync(join(root, '.harness/features/s1.features.json'), JSON.stringify({ features: [{ id: 'TASK-001', status: 'passing', scope_paths: ['src/README.md'] }] }));
    const none = cliIn(root, '--json');
    assert.equal(none.status, 0, none.stderr);
    assert.equal(JSON.parse(none.stdout).status, 'no-files');
  });
  withProject("`sh -c 'kill -9 $$' {files}`", (root) => {
    const r = cliIn(root, '--json');
    assert.equal(r.status, 2, r.stderr);
    assert.equal(JSON.parse(r.stdout).status, 'error');
  });
});

test('REQ-006 the time limit is 30 minutes', () => {
  assert.equal(TIMEOUT_MS, 30 * 60 * 1000);
});

test('REQ-001 selection: in_progress features count, harness paths never reach the tool, every {files} is filled', () => {
  withProject('`mut {files} -- {files}`', (root) => {
    const w = (rel, text) => {
      mkdirSync(join(root, rel, '..'), { recursive: true });
      writeFileSync(join(root, rel), text);
    };
    w('src/c.mjs', 'export const c = 3;\n');
    w('.harness/hooks/x.mjs', 'export const x = 1;\n');
    writeFileSync(join(root, '.harness/features/s1.features.json'), JSON.stringify({ features: [
      { id: 'TASK-001', status: 'passing', scope_paths: ['src/a.mjs', '.harness/hooks/x.mjs', '.harness'] },
      { id: 'TASK-003', status: 'in_progress', scope_paths: ['src/c.mjs'] },
    ] }));
    const f = fake(0);
    const r = runMutation({ root, sliceId: 's1', exec: f.exec });
    assert.deepEqual(r.features, ['TASK-001', 'TASK-003']);
    // No file under .harness/ — named directly or through a directory scope — is handed to the tool.
    assert.deepEqual(r.files, ['src/a.mjs', 'src/c.mjs']);
    assert.deepEqual(f.calls, ["mut 'src/a.mjs' 'src/c.mjs' -- 'src/a.mjs' 'src/c.mjs'"]);
  });
});

test('REQ-001 selection: files the kit installer manages are never handed to the tool, outside .harness/ too', () => {
  withProject('`mut {files}`', (root) => {
    mkdirSync(join(root, 'scripts'), { recursive: true });
    writeFileSync(join(root, 'scripts/kit.mjs'), 'export const kit = 1;\n');
    writeFileSync(join(root, 'scripts/own.mjs'), 'export const own = 1;\n');
    mkdirSync(join(root, '.harness/config'), { recursive: true });
    writeFileSync(join(root, '.harness/config/installed-versions.json'), JSON.stringify({ managed_files: ['scripts/kit.mjs'] }));
    writeFileSync(join(root, '.harness/features/s1.features.json'), JSON.stringify({ features: [{ id: 'TASK-001', status: 'passing', scope_paths: ['scripts'] }] }));
    const r = runMutation({ root, sliceId: 's1', exec: fake(0).exec });
    assert.deepEqual(r.files, ['scripts/own.mjs']);
  });
});

test('REQ-002 --feature selects one feature whatever its status', () => {
  withProject('`mut {files}`', (root) => {
    const f = fake(0);
    const r = runMutation({ root, sliceId: 's1', featureId: 'TASK-002', exec: f.exec });
    assert.deepEqual(r.files, ['src/b.mjs']);
    assert.deepEqual(f.calls, ["mut 'src/b.mjs'"]);
  });
});

test('REQ-003 an unfilled binding is unconfigured: nothing runs, exit 0, "not a pass"', () => {
  withProject('`…` (examples: `npx stryker run --mutate {files}`)', (root) => {
    const f = fake(0);
    const r = runMutation({ root, sliceId: 's1', exec: f.exec });
    assert.equal(r.status, 'unconfigured');
    assert.deepEqual(f.calls, []);
    const cli = spawnSync(process.execPath, [BIN, 'mutate', '--slice', 's1'], { cwd: root, encoding: 'utf8' });
    assert.equal(cli.status, 0, cli.stderr);
    assert.match(cli.stdout, /unconfigured \(not a pass\)/);
  });
});

test('REQ-004 no feature file → no-files, the command does not run', () => {
  withProject('`mut {files}`', (root) => {
    writeFileSync(join(root, '.harness/features/s1.features.json'), JSON.stringify({ features: [{ id: 'TASK-001', status: 'passing', scope_paths: ['src/README.md', 'src/a.test.mjs'] }] }));
    const f = fake(0);
    assert.equal(runMutation({ root, sliceId: 's1', exec: f.exec }).status, 'no-files');
    assert.deepEqual(f.calls, []);
  });
});

test('REQ-005 missing --slice, an unknown slice, or an unknown feature exits 2 with the usage', () => {
  withProject('`mut {files}`', (root) => {
    const cli = (...args) => spawnSync(process.execPath, [BIN, 'mutate', ...args], { cwd: root, encoding: 'utf8' });
    for (const args of [[], ['--slice', 'nope'], ['--slice', 's1', '--feature', 'TASK-009']]) {
      const r = cli(...args);
      assert.equal(r.status, 2, `${args.join(' ')}: ${r.stderr}`);
      assert.match(r.stderr, /missing --slice|unknown slice: nope|unknown feature: TASK-009/);
      assert.match(r.stderr, /usage: asdd mutate --slice <id> \[options\]/, `${args.join(' ')}: no usage`);
    }
  });
});

test('REQ-006 a command that cannot start or times out is an error (exit 2), not survivors', () => {
  withProject('`mut {files}`', (root) => {
    const timeout = fake(null, '', { error: Object.assign(new Error('spawnSync /bin/sh ETIMEDOUT'), { code: 'ETIMEDOUT' }), signal: 'SIGTERM' });
    const r = runMutation({ root, sliceId: 's1', exec: timeout.exec });
    assert.equal(r.status, 'error');
    assert.match(r.output_tail, /timed out after 30 min/);
    const missing = fake(null, '', { error: Object.assign(new Error('spawnSync /bin/sh ENOENT'), { code: 'ENOENT' }) });
    const m = runMutation({ root, sliceId: 's1', exec: missing.exec });
    assert.equal(m.status, 'error');
    assert.match(m.output_tail, /ENOENT/);
  });
});

test('REQ-007 a command without {files} runs unchanged and says so', () => {
  withProject('`npx stryker run`', (root) => {
    const f = fake(0);
    const r = runMutation({ root, sliceId: 's1', exec: f.exec });
    assert.deepEqual(f.calls, ['npx stryker run']);
    assert.equal(r.files_substituted, false);
  });
});

test('REQ-008 --json: every field, null when nothing ran, same exit codes', () => {
  withProject('`sh -c "echo survived; exit 3" {files}`', (root) => {
    const r = spawnSync(process.execPath, [BIN, 'mutate', '--slice', 's1', '--json'], { cwd: root, encoding: 'utf8' });
    assert.equal(r.status, 1, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.deepEqual(Object.keys(out).sort(), ['command', 'exit_code', 'features', 'files', 'files_substituted', 'output_tail', 'slice', 'status']);
    assert.equal(out.status, 'survivors');
    assert.equal(out.exit_code, 3);
    assert.match(out.output_tail, /survived/);
    // The command after {files} is filled in, as it ran.
    assert.equal(out.command, `sh -c "echo survived; exit 3" 'src/a.mjs' 'src/it'\\''s.mjs'`);
  });
  // output_tail: stdout, a newline, then stderr, keeping the last 4000 characters.
  withProject(`\`node -e "process.stdout.write('x'.repeat(5000)); process.stderr.write('END-MARK'); process.exit(1)" {files}\``, (root) => {
    const out = JSON.parse(spawnSync(process.execPath, [BIN, 'mutate', '--slice', 's1', '--json'], { cwd: root, encoding: 'utf8' }).stdout);
    assert.equal(out.output_tail.length, 4000);
    assert.ok(out.output_tail.endsWith('x\nEND-MARK'), out.output_tail.slice(-20));
  });
  withProject('`…`', (root) => {
    const out = JSON.parse(spawnSync(process.execPath, [BIN, 'mutate', '--slice', 's1', '--json'], { cwd: root, encoding: 'utf8' }).stdout);
    assert.equal(out.status, 'unconfigured');
    assert.equal(out.command, null);
    assert.equal(out.exit_code, null);
    assert.equal(out.output_tail, null);
  });
});
