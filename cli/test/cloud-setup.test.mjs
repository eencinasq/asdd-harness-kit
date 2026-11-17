/**
 * shaping-cloud-setup — REQ-001, REQ-004: cli/runtimes/claude/cloud-setup.sh.
 * Never installs or builds: --plan prints the steps, --check runs against stub binaries on a controlled PATH.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = join(ROOT, 'cli/runtimes/claude/cloud-setup.sh');
const STEPS = ['prerequisites', 'asdd CLI', 'MCP servers', 'codegraph', 'knowledge index', 'doctor'];

const run = (args, opts = {}) => spawnSync('bash', [SCRIPT, ...args], { encoding: 'utf8', ...opts });

/** A bin dir with the system tools bash needs plus stubs that only answer --version / -v. */
function stubBin(stubs) {
  const bin = mkdtempSync(join(tmpdir(), 'cloud-setup-bin-'));
  for (const [name, version] of Object.entries(stubs)) {
    const p = join(bin, name);
    writeFileSync(p, `#!/bin/sh\necho "${version}"\n`);
    chmodSync(p, 0o755);
  }
  return bin;
}

/** A project tree shaped like the kit checkout (cli/bin/asdd.mjs and tools/*). */
function kitTree() {
  const dir = mkdtempSync(join(tmpdir(), 'cloud-setup-kit-'));
  for (const rel of ['cli/bin', 'tools/knowledge', 'tools/spec-drift']) mkdirSync(join(dir, rel), { recursive: true });
  writeFileSync(join(dir, 'cli/bin/asdd.mjs'), '// stub\n');
  return dir;
}

test('shaping-cloud-setup REQ-001 the script exists and is valid bash', () => {
  assert.ok(existsSync(SCRIPT), SCRIPT);
  const r = spawnSync('bash', ['-n', SCRIPT], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('shaping-cloud-setup REQ-004 --plan lists the steps in order and writes nothing', () => {
  const cwd = kitTree();
  try {
    const before = readdirSync(cwd).sort();
    const r = run(['--plan'], { cwd });
    assert.equal(r.status, 0, r.stderr);
    let at = -1;
    for (const step of STEPS) {
      const i = r.stdout.indexOf(step);
      assert.ok(i > at, `step "${step}" missing or out of order:\n${r.stdout}`);
      at = i;
    }
    assert.deepEqual(readdirSync(cwd).sort(), before);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('shaping-cloud-setup REQ-004 --check fails and names missing prerequisites (Node 22, no pnpm, kit checkout)', () => {
  const cwd = kitTree();
  const bin = stubBin({ node: 'v22.23.3', git: 'git version 2.50.1', codegraph: '1.6.2' });
  try {
    const r = run(['--check'], { cwd, env: { ...process.env, PATH: `${bin}:/usr/bin:/bin`, ASDD_NODE24_BIN: '' } });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /MISSING.*pnpm/);
    assert.match(r.stdout, /MISSING.*Node >= 24\.22\.1/);
    assert.equal(existsSync(join(cwd, '.codegraph')), false, '--check writes nothing');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(bin, { recursive: true, force: true });
  }
});

test('shaping-cloud-setup REQ-004 --check passes with Node 24, pnpm and codegraph', () => {
  const cwd = kitTree();
  const bin = stubBin({ node: 'v24.22.3', git: 'git version 2.50.1', pnpm: '12.12.1', codegraph: '1.6.2', npm: '10.9.9' });
  try {
    const r = run(['--check'], { cwd, env: { ...process.env, PATH: `${bin}:/usr/bin:/bin`, ASDD_NODE24_BIN: '' } });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.doesNotMatch(r.stdout, /MISSING/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(bin, { recursive: true, force: true });
  }
});

test('shaping-cloud-setup REQ-004 --check in a project (no tools/) does not require Node 24 or pnpm', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'cloud-setup-project-'));
  const bin = stubBin({ node: 'v22.23.3', git: 'git version 2.50.1', codegraph: '1.6.2', asdd: '3.12.0', npm: '10.9.9' });
  try {
    const r = run(['--check'], { cwd, env: { ...process.env, PATH: `${bin}:/usr/bin:/bin`, ASDD_NODE24_BIN: '' } });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /skip\s+MCP servers: no tools\//);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(bin, { recursive: true, force: true });
  }
});
