/**
 * REQ-001 REQ-002 — hotfix / lite / full presets on asdd slice init.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'init-slice.mjs');

function harnessRoot() {
  const root = mkdtempSync(join(tmpdir(), 'asdd-init-slice-'));
  mkdirSync(join(root, '.harness/state/slices'), { recursive: true });
  writeFileSync(
    join(root, '.harness/state/manifest.json'),
    JSON.stringify({ schema_version: '3.0', active_slices: [] }, null, 2),
  );
  return root;
}

function run(root, ...args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd: root, encoding: 'utf8' });
}

test('REQ-001 default init is lite at discovery', () => {
  const root = harnessRoot();
  try {
    const r = run(root, 'alpha');
    assert.equal(r.status, 0, r.stderr);
    const sess = JSON.parse(readFileSync(join(root, '.harness/state/slices/alpha/sessions/001-initial.json'), 'utf8'));
    assert.equal(sess.mode, 'lite');
    assert.equal(sess.phase, 'discovery');
    const features = JSON.parse(readFileSync(join(root, '.harness/features/alpha.features.json'), 'utf8'));
    assert.equal(features.features.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('REQ-001 --full starts full mode', () => {
  const root = harnessRoot();
  try {
    const r = run(root, 'beta', '--full');
    assert.equal(r.status, 0, r.stderr);
    const sess = JSON.parse(readFileSync(join(root, '.harness/state/slices/beta/sessions/001-initial.json'), 'utf8'));
    assert.equal(sess.mode, 'full');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('REQ-001 REQ-002 --hotfix starts at implementation with stub feature', () => {
  const root = harnessRoot();
  try {
    const r = run(root, 'fix-1', '--hotfix');
    assert.equal(r.status, 0, r.stderr);
    const sess = JSON.parse(readFileSync(join(root, '.harness/state/slices/fix-1/sessions/001-initial.json'), 'utf8'));
    assert.equal(sess.mode, 'hotfix');
    assert.equal(sess.phase, 'implementation');
    const features = JSON.parse(readFileSync(join(root, '.harness/features/fix-1.features.json'), 'utf8'));
    assert.equal(features.features.length, 1);
    assert.equal(features.features[0].id, 'TASK-001');
    assert.ok(existsSync(join(root, '.harness/specs/fix-1/tasks.md')));
    const manifest = JSON.parse(readFileSync(join(root, '.harness/state/slices/fix-1/manifest.json'), 'utf8'));
    assert.equal(manifest.mode, 'hotfix');
    assert.equal(manifest.phase, 'implementation');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('REQ-001 --full and --hotfix are mutually exclusive', () => {
  const root = harnessRoot();
  try {
    const r = run(root, 'bad', '--full', '--hotfix');
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /mutually exclusive/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
