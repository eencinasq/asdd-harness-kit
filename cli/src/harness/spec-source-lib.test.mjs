/** REQ-003 — spec-as-source opt-in inventory */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildSpecSourceInventory, isSpecAsSourceEnabled } from './spec-source-lib.mjs';

test('REQ-003 disabled by default', () => {
  const root = mkdtempSync(join(tmpdir(), 'asdd-specsrc-'));
  try {
    assert.equal(isSpecAsSourceEnabled(root, { config: {} }), false);
    const inv = buildSpecSourceInventory(root, { config: {} });
    assert.equal(inv.enabled, false);
    assert.match(inv.error, /experimental/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('REQ-003 inventories MUST REQs when enabled', () => {
  const root = mkdtempSync(join(tmpdir(), 'asdd-specsrc-'));
  try {
    mkdirSync(join(root, '.harness/specs/demo'), { recursive: true });
    mkdirSync(join(root, '.harness/features'), { recursive: true });
    mkdirSync(join(root, '.harness/state/slices/demo'), { recursive: true });
    mkdirSync(join(root, 'test'), { recursive: true });
    writeFileSync(
      join(root, '.harness/specs/demo/spec.md'),
      '# demo\n\n- **REQ-001 (MUST).** The system SHALL work.\n- **REQ-002 (MUST).** The system SHALL also.\n',
    );
    writeFileSync(
      join(root, '.harness/features/demo.features.json'),
      JSON.stringify({
        schema_version: '1.0',
        slice_id: 'demo',
        source_tasks: 'x',
        features: [{ id: 'T1', status: 'passing', req_ids: ['REQ-001'], evidence: 'ok', verification: ['x'], title: 't', user_visible_behavior: 't', priority: 1 }],
      }),
    );
    writeFileSync(
      join(root, '.harness/state/slices/demo/manifest.json'),
      JSON.stringify({ schema_version: '3.0', slice_id: 'demo', status: 'in_progress', phase: 'qa', mode: 'lite' }),
    );
    writeFileSync(
      join(root, '.harness/state/manifest.json'),
      JSON.stringify({
        schema_version: '3.0',
        active_slices: [{ slice_id: 'demo', features: '.harness/features/demo.features.json' }],
      }),
    );
    writeFileSync(join(root, 'test/demo.test.mjs'), '// REQ-001\n');

    const inv = buildSpecSourceInventory(root, {
      config: { capabilities: { spec_as_source: true } },
      sliceId: 'demo',
    });
    assert.equal(inv.enabled, true);
    assert.equal(inv.total_must, 2);
    assert.equal(inv.covered, 1);
    assert.ok(inv.items.some((i) => i.req_id === 'REQ-002' && !i.covered));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
