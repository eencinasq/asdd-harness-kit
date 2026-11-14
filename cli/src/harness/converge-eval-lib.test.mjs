/** REQ-003 — converge-eval suite */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { judgeEarsRequirement, runCase, runEvalSuite, DEFAULT_CASES_DIR } from './converge-eval-lib.mjs';
import { existsSync, readdirSync } from 'node:fs';

test('REQ-003 judgeEarsRequirement flags missing SHALL/MUST', () => {
  assert.ok(judgeEarsRequirement('The system works somehow').includes('EARS-01'));
  assert.equal(judgeEarsRequirement('The system SHALL reject empty tokens.').length, 0);
});

test('REQ-003 runCase matches expected CONVERGE codes', () => {
  const r = runCase({
    id: 'unit-missing-req',
    requirements: [{ id: 'REQ-001', must: true, text: 'The system SHALL persist evidence.' }],
    features: [{ id: 'TASK-001', status: 'in_progress', req_ids: [], evidence: '' }],
    test_mentions: ['// no req'],
    expected_codes: ['CONVERGE-01'],
  });
  assert.equal(r.ok, true, JSON.stringify(r));
});

test('REQ-003 shipped eval set has ≥6 cases and ≥2 clean', () => {
  assert.ok(existsSync(DEFAULT_CASES_DIR), DEFAULT_CASES_DIR);
  const files = readdirSync(DEFAULT_CASES_DIR).filter((n) => n.endsWith('.json'));
  assert.ok(files.length >= 6, `got ${files.length}`);
  const suite = runEvalSuite();
  assert.equal(suite.ok, true, formatFails(suite));
  assert.ok(suite.clean >= 2);
});

function formatFails(suite) {
  return suite.results
    .filter((r) => !r.ok)
    .map((r) => `${r.id} missing=${r.missing} extra=${r.extra}`)
    .join('; ');
}
