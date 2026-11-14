/** REQ-001 — tracker-sync plan + local apply receipt */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildTrackerSyncPlan, applyTrackerSyncPlan, parseHandoffYaml } from './tracker-sync-lib.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'asdd-tracker-'));
  mkdirSync(join(root, 'docs/pitches/PITCH-1'), { recursive: true });
  mkdirSync(join(root, '.harness/state/slices/demo/sessions'), { recursive: true });
  writeFileSync(
    join(root, 'docs/pitches/PITCH-1/handoff.yaml'),
    [
      'source_pitch_id: PITCH-1',
      'title: Demo',
      'problem: x',
      'desired_outcome: y',
      'appetite: 2 weeks',
      'cycle: 2026-Q1',
      'must_haves: MH-01',
      'no_gos: none',
      'tracker_url: https://linear.app/x/issue/PITCH-1',
      'tracker_type: linear',
      'betting_state: bet',
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(root, '.harness/state/slices/demo/sessions/001-initial.json'),
    JSON.stringify({
      schema_version: '1.0',
      timestamp: '2026-01-01T00:00:00.000Z',
      event_type: 'phase_started',
      phase: 'discovery',
      slice_id: 'demo',
      source: {
        tracker_type: 'linear',
        tracker_url: 'https://linear.app/x/issue/PITCH-1',
        pitch_id: 'PITCH-1',
      },
    }),
  );
  writeFileSync(
    join(root, '.harness/state/slices/demo/sessions/002-phase_completed-spec.json'),
    JSON.stringify({
      schema_version: '1.0',
      timestamp: '2026-01-02T00:00:00.000Z',
      event_type: 'phase_completed',
      phase: 'spec',
      slice_id: 'demo',
      evidence: 'spec ok',
    }),
  );
  writeFileSync(
    join(root, '.harness/state/slices/demo/sessions/003-feature_completed-TASK-001.json'),
    JSON.stringify({
      schema_version: '1.0',
      timestamp: '2026-01-03T00:00:00.000Z',
      event_type: 'feature_completed',
      phase: 'implementation',
      feature_id: 'TASK-001',
      slice_id: 'demo',
    }),
  );
  return root;
}

test('REQ-001 parseHandoffYaml extracts fields', () => {
  const f = parseHandoffYaml('title: Hello\ntracker_type: jira\n');
  assert.equal(f.title, 'Hello');
  assert.equal(f.tracker_type, 'jira');
});

test('REQ-001 buildTrackerSyncPlan emits slice/phase/feature actions', () => {
  const root = fixture();
  try {
    const plan = buildTrackerSyncPlan({ root, sliceId: 'demo' });
    assert.ok(plan.actions.some((a) => a.event === 'slice_created'));
    assert.ok(plan.actions.some((a) => a.event === 'phase_completed' && a.phase === 'spec'));
    assert.ok(plan.actions.some((a) => a.event === 'feature_passing' && a.feature_id === 'TASK-001'));
    assert.equal(plan.actions[0].tracker_type, 'linear');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('REQ-001 --apply writes local receipt only', () => {
  const root = fixture();
  try {
    const plan = buildTrackerSyncPlan({ root, sliceId: 'demo' });
    const { receipt_path } = applyTrackerSyncPlan(root, plan);
    assert.ok(existsSync(join(root, receipt_path)));
    const receipt = JSON.parse(readFileSync(join(root, receipt_path), 'utf8'));
    assert.match(receipt.note, /Local receipt only/);
    assert.equal(receipt.plan.actions.length, plan.actions.length);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
