import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveGates, derivePaths, derivePhase } from './sync-state.mjs';
import { phaseChainFindings, predecessorOf } from './validators/phase-chain.mjs';
import { STEERING_TAGS, parseSteeringFrontmatter } from './validators/steering-tags.mjs';

const done = (phase) => ({ event_type: 'phase_completed', phase });

test('derivePhase advances through task_planning', () => {
  assert.equal(derivePhase([done('design')]), 'task_planning');
  assert.equal(derivePhase([done('task_planning')]), 'implementation');
});

test('derivePhase hands refactor off to knowledge', () => {
  assert.equal(derivePhase([done('qa'), { event_type: 'phase_started', phase: 'refactor' }]), 'refactor');
  assert.equal(derivePhase([done('qa'), done('refactor')]), 'knowledge');
});

test('derivePaths takes features from the latest session with features_path', () => {
  const paths = derivePaths(
    [{ features_path: '.harness/features/a.features.json' }, { features_path: '.harness/features/b.features.json' }],
    { specs: '.harness/specs/b' },
  );
  assert.deepEqual(paths, { specs: '.harness/specs/b', features: '.harness/features/b.features.json' });
  assert.deepEqual(derivePaths([], undefined), {});
});

test('steering frontmatter parser reads inclusion and tags', () => {
  const fm = parseSteeringFrontmatter('---\ninclusion: auto\ntags:\n  - qa\n  - task_planning\n---\n# x\n');
  assert.deepEqual(fm, { inclusion: 'auto', tags: ['qa', 'task_planning'] });
  assert.equal(parseSteeringFrontmatter('# no frontmatter'), null);
});

test('steering tags accept phases, mode, and roles but not legacy names', () => {
  for (const tag of ['task_planning', 'refactor', 'lite', 'review', 'ui']) assert.ok(STEERING_TAGS.has(tag), tag);
  for (const tag of ['task-planning', 'tasks']) assert.ok(!STEERING_TAGS.has(tag), tag);
});

test('deriveGates: concerns give WARN, a TL override acknowledges it', () => {
  const gates = deriveGates([
    { event_type: 'phase_completed', phase: 'spec', concerns: ['REQ-003 vague'], agent: 'a' },
    { event_type: 'override', phase: 'spec', human: 'tl' },
    { event_type: 'phase_completed', phase: 'validation', agent: 'a' },
  ]);
  assert.equal(gates.spec.status, 'WARN');
  assert.equal(gates.spec.acknowledged_by, 'tl');
  assert.equal(gates.validation.status, 'PASS');
});

test('predecessorOf: domain is optional, refactor follows qa', () => {
  assert.equal(predecessorOf('design', {}), 'validation');
  assert.equal(predecessorOf('design', { domain: { status: 'PASS' } }), 'domain');
  assert.equal(predecessorOf('refactor', {}), 'qa');
  assert.equal(predecessorOf('discovery', {}), null);
});

const full = { event_type: 'checkpoint', mode: 'full' };

test('phase chain: clean full pipeline has no findings', () => {
  const phases = ['discovery', 'spec', 'validation', 'design', 'task_planning', 'implementation', 'qa', 'knowledge'];
  assert.deepEqual(phaseChainFindings([full, ...phases.map(done)]), []);
});

test('phase chain: missing, BLOCK, and unacknowledged WARN predecessors are reported', () => {
  assert.match(phaseChainFindings([full, done('design')])[0], /no validation gate/);
  assert.match(
    phaseChainFindings([full, done('discovery'), { event_type: 'phase_blocked', phase: 'discovery' }, done('spec')])[0],
    /discovery gate is BLOCK/,
  );
  const warn = { event_type: 'phase_completed', phase: 'discovery', concerns: ['x'] };
  assert.match(phaseChainFindings([full, warn, done('spec')])[0], /WARN without a Tech Lead override/);
  assert.deepEqual(phaseChainFindings([full, warn, { event_type: 'override', phase: 'discovery', human: 'tl' }, done('spec')]), []);
});

test('phase chain: lite stretches are skipped', () => {
  assert.deepEqual(phaseChainFindings([done('knowledge')]), []);
});

test('contractFindings: passing needs evidence as well as evidence_commit', async () => {
  const { contractFindings } = await import('./validators/features.mjs');
  const base = { id: 'TASK-001', status: 'passing', scope_paths: ['src/a.ts'], evidence_commit: 'abc1234' };
  assert.deepEqual(contractFindings({ ...base, evidence: 'npm test: 12/12' }), []);
  assert.match(contractFindings({ ...base, evidence: '  ' })[0], /passing without evidence/);
});
