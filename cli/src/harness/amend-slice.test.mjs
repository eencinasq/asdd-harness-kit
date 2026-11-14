/**
 * REQ-003 — asdd slice amend reopens DONE slices.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { deriveStatus } from './sync-state.mjs';

const AMEND = join(dirname(fileURLToPath(import.meta.url)), 'amend-slice.mjs');
const SYNC = join(dirname(fileURLToPath(import.meta.url)), 'sync-state.mjs');

function doneSliceRoot(sliceId = 'closed') {
  const root = mkdtempSync(join(tmpdir(), 'asdd-amend-'));
  const sessions = join(root, '.harness/state/slices', sliceId, 'sessions');
  mkdirSync(sessions, { recursive: true });
  mkdirSync(join(root, '.harness/specs', sliceId), { recursive: true });
  mkdirSync(join(root, '.harness/features'), { recursive: true });
  writeFileSync(join(root, '.harness/specs', sliceId, 'tasks.md'), `# ${sliceId}\n`);
  writeFileSync(
    join(root, '.harness/features', `${sliceId}.features.json`),
    JSON.stringify({ schema_version: '1.0', slice_id: sliceId, source_tasks: `.harness/specs/${sliceId}/tasks.md`, features: [] }),
  );
  const now = '2026-01-01T00:00:00.000Z';
  writeFileSync(
    join(sessions, '001-initial.json'),
    JSON.stringify({
      schema_version: '1.0',
      session_id: 'sess-1',
      timestamp: now,
      agent: 'human',
      human: 'squad',
      slice_id: sliceId,
      event_type: 'phase_started',
      phase: 'discovery',
      mode: 'lite',
    }),
  );
  writeFileSync(
    join(sessions, '002-phase_completed-knowledge.json'),
    JSON.stringify({
      schema_version: '1.0',
      session_id: 'sess-2',
      timestamp: '2026-01-02T00:00:00.000Z',
      agent: 'human',
      human: 'squad',
      slice_id: sliceId,
      event_type: 'phase_completed',
      phase: 'knowledge',
      evidence: 'done',
    }),
  );
  writeFileSync(
    join(root, '.harness/state/manifest.json'),
    JSON.stringify({ schema_version: '3.0', active_slices: [{ slice_id: sliceId }] }),
  );
  spawnSync(process.execPath, [SYNC, '--slice', sliceId], { cwd: root, encoding: 'utf8' });
  return root;
}

test('REQ-003 deriveStatus: checkpoint in_progress resumes after knowledge DONE', () => {
  const sessions = [
    { event_type: 'phase_completed', phase: 'knowledge', timestamp: '2026-01-01T00:00:00Z' },
    { event_type: 'checkpoint', status: 'in_progress', amend: true, timestamp: '2026-01-02T00:00:00Z' },
  ];
  assert.equal(deriveStatus(sessions), 'in_progress');
});

test('REQ-003 slice amend reopens DONE and writes amendments note', () => {
  const root = doneSliceRoot('closed');
  try {
    const before = JSON.parse(readFileSync(join(root, '.harness/state/slices/closed/manifest.json'), 'utf8'));
    assert.equal(before.status, 'DONE');

    const r = spawnSync(process.execPath, [AMEND, 'closed', '--note', 'tweak REQ', '--by', 'eencinas'], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.equal(r.status, 0, r.stderr + r.stdout);

    const after = JSON.parse(readFileSync(join(root, '.harness/state/slices/closed/manifest.json'), 'utf8'));
    assert.equal(after.status, 'in_progress');

    const amendDir = join(root, '.harness/specs/closed/amendments');
    const files = readdirSync(amendDir).filter((f) => f.endsWith('.md'));
    assert.equal(files.length, 1);
    const body = readFileSync(join(amendDir, files[0]), 'utf8');
    assert.match(body, /tweak REQ/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('REQ-003 amend refuses non-DONE slices', () => {
  const root = doneSliceRoot('openish');
  try {
    // Force in_progress by removing knowledge completion effect via checkpoint park then... just edit manifest status
    const manifestPath = join(root, '.harness/state/slices/openish/manifest.json');
    const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
    m.status = 'in_progress';
    writeFileSync(manifestPath, JSON.stringify(m, null, 2));
    const r = spawnSync(process.execPath, [AMEND, 'openish'], { cwd: root, encoding: 'utf8' });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /amend requires DONE/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
