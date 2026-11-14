/**
 * Temp-dir smoke for ASDD-ROADMAP P0.2 / REQ-003.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const BIN = join(import.meta.dirname, '../../bin/asdd.mjs');

test('REQ-003 init-flow installs, scaffolds lite slice, aims for green check', () => {
  const dir = mkdtempSync(join(tmpdir(), 'asdd-init-flow-'));
  try {
    const res = spawnSync(
      process.execPath,
      [BIN, 'init-flow', dir, '--runtime=cursor', '--slice', 'welcome', '--json'],
      { encoding: 'utf8', timeout: 120_000 },
    );
    assert.equal(res.status, 0, res.stderr || res.stdout);
    const out = JSON.parse(res.stdout);
    assert.equal(out.ok, true);
    assert.equal(out.slice_id, 'welcome');
    assert.ok(out.steps.includes('install') || out.steps.includes('harness-present'));
    assert.ok(out.steps.includes('check:ok'));
    assert.ok(existsSync(join(dir, '.harness')));
    assert.ok(existsSync(join(dir, 'docs/hello-asdd.md')));
    assert.ok(existsSync(join(dir, '.harness/specs/welcome/spec.md')));
    const features = JSON.parse(readFileSync(join(dir, '.harness/features/welcome.features.json'), 'utf8'));
    assert.equal(features.features[0].status, 'passing');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
