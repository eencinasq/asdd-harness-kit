/**
 * REQ-004 — hill chart sensor: uphill listing and late-cycle WARN.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { listUphillFeatures, lateUphillFindings } from './hill-lib.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'asdd-hill-'));
  mkdirSync(join(root, '.harness/features'), { recursive: true });
  mkdirSync(join(root, '.harness/state/slices/s1'), { recursive: true });
  writeFileSync(
    join(root, '.harness/state/registry.json'),
    JSON.stringify({ schema_version: '3.0', slices: [{ slice_id: 's1', phase: 'implementation', status: 'in_progress' }] }),
  );
  writeFileSync(
    join(root, '.harness/state/slices/s1/manifest.json'),
    JSON.stringify({ schema_version: '3.0', slice_id: 's1', phase: 'implementation', status: 'in_progress', mode: 'lite' }),
  );
  writeFileSync(
    join(root, '.harness/features/s1.features.json'),
    JSON.stringify({
      schema_version: '1.0',
      slice_id: 's1',
      source_tasks: 'x',
      features: [
        { id: 'T1', title: 'a', user_visible_behavior: 'a', status: 'in_progress', priority: 1, verification: ['x'], hill: 'uphill' },
        { id: 'T2', title: 'b', user_visible_behavior: 'b', status: 'in_progress', priority: 2, verification: ['x'], hill: 'downhill' },
        { id: 'T3', title: 'c', user_visible_behavior: 'c', status: 'passing', priority: 3, verification: ['x'], hill: 'uphill', evidence: 'ok' },
      ],
    }),
  );
  return root;
}

test('REQ-004 listUphillFeatures skips downhill and passing', () => {
  const root = fixture();
  try {
    const list = listUphillFeatures(root);
    assert.equal(list.length, 1);
    assert.equal(list[0].feature_id, 'T1');
    assert.equal(list[0].slice_id, 's1');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('REQ-004 lateUphillFindings only in qa/knowledge', () => {
  const root = fixture();
  try {
    assert.equal(lateUphillFindings(root).length, 0);
    writeFileSync(
      join(root, '.harness/state/slices/s1/manifest.json'),
      JSON.stringify({ schema_version: '3.0', slice_id: 's1', phase: 'qa', status: 'in_progress', mode: 'lite' }),
    );
    const late = lateUphillFindings(root);
    assert.equal(late.length, 1);
    assert.equal(late[0].phase, 'qa');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
