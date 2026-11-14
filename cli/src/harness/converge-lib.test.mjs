import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { runConverge } from './converge-lib.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'asdd-converge-'));
  mkdirSync(join(root, '.harness/specs/demo'), { recursive: true });
  mkdirSync(join(root, '.harness/features'), { recursive: true });
  mkdirSync(join(root, 'test'), { recursive: true });
  writeFileSync(
    join(root, '.harness/specs/demo/spec.md'),
    '# demo\n\n- **REQ-001.** SHALL work.\n- **REQ-002.** SHALL also.\n',
  );
  writeFileSync(join(root, 'test/demo.test.mjs'), '// covers REQ-001\n');
  return root;
}

test('REQ-004 CONVERGE-01: in_progress feature without req_ids fails when MUST reqs exist', () => {
  const root = fixture();
  try {
    const slices = [
      {
        slice_id: 'demo',
        status: 'in_progress',
        phase: 'implementation',
        features: [{ id: 'TASK-001', status: 'in_progress', req_ids: [], evidence: '' }],
      },
    ];
    const r = runConverge({ root, slices, tests: ['test/demo.test.mjs'] });
    assert.equal(r.ok, false);
    assert.ok(r.fails.some((f) => f.code === 'CONVERGE-01'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('REQ-004 CONVERGE-02: missing test mention warns; strict fails; passing stays warn', () => {
  const root = fixture();
  try {
    const slices = [
      {
        slice_id: 'demo',
        status: 'in_progress',
        phase: 'implementation',
        features: [{ id: 'TASK-001', status: 'in_progress', req_ids: ['REQ-001', 'REQ-002'], evidence: '' }],
      },
    ];
    const soft = runConverge({ root, slices, tests: ['test/demo.test.mjs'], strict: false });
    assert.equal(soft.ok, true);
    assert.ok(soft.warns.some((f) => f.code === 'CONVERGE-02' && /REQ-002/.test(f.message)));

    const hard = runConverge({ root, slices, tests: ['test/demo.test.mjs'], strict: true });
    assert.equal(hard.ok, false);

    slices[0].features[0].status = 'passing';
    slices[0].features[0].evidence = 'ok';
    const pass = runConverge({ root, slices, tests: ['test/demo.test.mjs'] });
    assert.equal(pass.ok, true, 'missing test mention stays WARN without --strict even when passing');
    assert.ok(pass.warns.some((f) => /REQ-002/.test(f.message)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('REQ-004 REQ-005 CONVERGE-03: passing without evidence fails', () => {
  const root = fixture();
  try {
    const slices = [
      {
        slice_id: 'demo',
        status: 'in_progress',
        phase: 'qa',
        features: [{ id: 'TASK-001', status: 'passing', req_ids: ['REQ-001'], evidence: '' }],
      },
    ];
    const r = runConverge({ root, slices, tests: ['test/demo.test.mjs'] });
    assert.equal(r.ok, false);
    assert.ok(r.fails.some((f) => f.code === 'CONVERGE-03'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('green: req_ids mentioned and evidence present', () => {
  const root = fixture();
  try {
    writeFileSync(join(root, 'test/demo.test.mjs'), '// REQ-001 REQ-002\n');
    const slices = [
      {
        slice_id: 'demo',
        status: 'in_progress',
        phase: 'qa',
        features: [{ id: 'TASK-001', status: 'passing', req_ids: ['REQ-001', 'REQ-002'], evidence: 'tests ok' }],
      },
    ];
    const r = runConverge({ root, slices, tests: ['test/demo.test.mjs'] });
    assert.equal(r.ok, true);
    assert.equal(r.findings.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
