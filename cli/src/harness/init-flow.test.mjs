/**
 * Temp-dir smoke for ASDD-ROADMAP P0.2 / REQ-003.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
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
    // The product binding names the project the way install recorded it (project.json project_id)
    const { project_id: projectId } = JSON.parse(readFileSync(join(dir, '.harness/config/project.json'), 'utf8'));
    assert.match(readFileSync(join(dir, '.harness/steering/product.md'), 'utf8'), new RegExp(`${projectId} — onboarded via`));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Dependency layers (domain-layer.project.md): Harness may depend on no other layer — `asdd kit vendor` copies these
// files into tools/*/src/harness, where only siblings resolve.
test('dep-layer: cli/src/harness imports only node: built-ins, packages, and files inside cli/src/harness', () => {
  const harness = import.meta.dirname;
  const outside = [];
  for (const name of readdirSync(harness, { recursive: true })) {
    const rel = String(name);
    if (!rel.endsWith('.mjs') || rel.endsWith('.test.mjs')) continue;
    const file = join(harness, rel);
    for (const m of readFileSync(file, 'utf8').matchAll(/^\s*(?:import|export)\b[^'"`;]*?from\s*['"](\.[^'"]+)['"]|\bimport\(\s*['"](\.[^'"]+)['"]\s*\)/gm)) {
      const target = resolve(dirname(file), m[1] ?? m[2]);
      if (!target.startsWith(`${harness}${sep}`)) outside.push(`${rel} -> ${relative(harness, target)}`);
    }
  }
  assert.deepEqual(outside, []);
});
