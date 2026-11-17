/**
 * ui-gate-decisions — REQ-002…REQ-004 (asdd gate-decide).
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

function fixture(root) {
  mkdirSync(join(root, '.harness/state/slices/demo/sessions'), { recursive: true });
  writeFileSync(
    join(root, '.harness/state/registry.json'),
    JSON.stringify({ slices: [{ slice_id: 'demo', status: 'in_progress' }] }),
  );
  writeFileSync(
    join(root, '.harness/state/slices/demo/manifest.json'),
    JSON.stringify({
      slice_id: 'demo',
      phase: 'implementation',
      status: 'in_progress',
      gates: { spec: { status: 'WARN', concerns: ['x'] } },
    }),
  );
  writeFileSync(
    join(root, '.harness/state/slices/demo/sessions/001-phase_completed-spec.json'),
    JSON.stringify({
      event_type: 'phase_completed',
      phase: 'spec',
      concerns: ['x'],
      evidence: 'warn',
    }),
  );
  // Minimal global manifest so sync may run or we stub sync in unit path
  mkdirSync(join(root, '.harness/state'), { recursive: true });
  writeFileSync(
    join(root, '.harness/state/manifest.json'),
    JSON.stringify({ schema_version: '3.0', active_slices: [{ slice_id: 'demo' }] }),
  );
}

test('REQ-002 REQ-003 gate-decide appends override session with human and note; does not hand-edit manifest', async () => {
  const { runGateDecide } = await import('./gate-decide.mjs');
  const root = mkdtempSync(join(tmpdir(), 'asdd-gate-decide-'));
  try {
    fixture(root);
    const beforeManifest = readFileSync(join(root, '.harness/state/slices/demo/manifest.json'), 'utf8');
    const result = runGateDecide({
      root,
      sliceId: 'demo',
      phase: 'spec',
      note: 'TL accepts WARN for demo',
      author: 'eencinas',
      sync: false,
    });
    assert.equal(result.ok, true);
    assert.equal(result.decided_by, 'eencinas');
    const sessions = readdirSync(join(root, '.harness/state/slices/demo/sessions'));
    const overrideFile = sessions.find((f) => f.includes('override'));
    assert.ok(overrideFile, 'override session file created');
    const session = JSON.parse(readFileSync(join(root, '.harness/state/slices/demo/sessions', overrideFile), 'utf8'));
    assert.equal(session.event_type, 'override');
    assert.equal(session.phase, 'spec');
    assert.equal(session.human, 'eencinas');
    assert.equal(session.note, 'TL accepts WARN for demo');
    assert.equal(readFileSync(join(root, '.harness/state/slices/demo/manifest.json'), 'utf8'), beforeManifest);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('REQ-004 gate-decide fails without note and writes nothing', async () => {
  const { runGateDecide } = await import('./gate-decide.mjs');
  const root = mkdtempSync(join(tmpdir(), 'asdd-gate-decide-'));
  try {
    fixture(root);
    const result = runGateDecide({
      root,
      sliceId: 'demo',
      phase: 'spec',
      note: '  ',
      author: 'eencinas',
      sync: false,
    });
    assert.equal(result.ok, false);
    const sessions = readdirSync(join(root, '.harness/state/slices/demo/sessions'));
    assert.equal(sessions.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
