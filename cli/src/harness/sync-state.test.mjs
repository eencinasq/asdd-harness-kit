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
  assert.deepEqual(fm, { inclusion: 'auto', tags: ['qa', 'task_planning'], classification: null });
  const fm2 = parseSteeringFrontmatter('---\ninclusion: always\nclassification: portable\n---\n# x\n');
  assert.deepEqual(fm2, { inclusion: 'always', tags: [], classification: 'portable' });
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

test('contractFindings: passing needs evidence and scope_paths, no commit SHA', async () => {
  const { contractFindings } = await import('./validators/features.mjs');
  const base = { id: 'TASK-001', status: 'passing', scope_paths: ['src/a.ts'] };
  assert.deepEqual(contractFindings({ ...base, evidence: 'npm test: 12/12' }), []);
  assert.match(contractFindings({ ...base, evidence: '  ' })[0], /passing without evidence/);
});

test('sync-state rewrites the registry when every slice is gone', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join, dirname } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const root = mkdtempSync(join(tmpdir(), 'sync-'));
  try {
    mkdirSync(join(root, '.harness/state/slices'), { recursive: true });
    writeFileSync(join(root, '.harness/state/registry.json'), JSON.stringify({ slices: [{ slice_id: 'old' }] }));
    const script = join(dirname(fileURLToPath(import.meta.url)), 'sync-state.mjs');
    spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
    assert.deepEqual(JSON.parse(readFileSync(join(root, '.harness/state/registry.json'), 'utf8')).slices, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('REQ-003 REQ-004 AC-002 AC-003: checkpoint status parks, abandons, and resumes a slice', async () => {
  const { deriveStatus } = await import('./sync-state.mjs');
  const started = { event_type: 'feature_started', feature_id: 'F1', timestamp: '2026-01-01T00:00:00Z' };
  const park = { event_type: 'checkpoint', status: 'PARKED', timestamp: '2026-01-02T00:00:00Z' };
  const resume = { event_type: 'checkpoint', status: 'in_progress', timestamp: '2026-01-03T00:00:00Z' };
  assert.equal(deriveStatus([started]), 'in_progress');
  assert.equal(deriveStatus([started, park]), 'PARKED');
  assert.equal(deriveStatus([started, park, resume]), 'in_progress');
  const abandon = { event_type: 'checkpoint', status: 'ABANDONED', timestamp: '2026-01-04T00:00:00Z' };
  assert.equal(deriveStatus([started, abandon, { event_type: 'feature_started', feature_id: 'F2' }]), 'ABANDONED', 'a non-status session does not resume');
  assert.equal(deriveStatus([{ event_type: 'phase_completed', phase: 'knowledge' }, { event_type: 'checkpoint', note: 'no status' }]), 'DONE');
});

test('REQ-005 AC-004: sync-state writes PROGRESS.md from the registry; init-slice does not touch it', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, cpSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join, dirname } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const root = mkdtempSync(join(tmpdir(), 'progress-'));
  try {
    cpSync(dirname(fileURLToPath(import.meta.url)), join(root, '.harness/cli/src/harness'), { recursive: true });
    mkdirSync(join(root, '.harness/state/slices'), { recursive: true });
    writeFileSync(join(root, '.harness/state/manifest.json'), JSON.stringify({ schema_version: '3.0', active_slices: [] }));
    writeFileSync(join(root, '.harness/PROGRESS.md'), 'hand edited\n');
    const run = (...args) => spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
    const a = run('.harness/cli/src/harness/init-slice.mjs', 'alpha');
    run('.harness/cli/src/harness/init-slice.mjs', 'beta', '--full');
    assert.doesNotMatch(a.stdout, /PROGRESS\.md/);
    run('.harness/cli/src/harness/sync-state.mjs');
    const text = readFileSync(join(root, '.harness/PROGRESS.md'), 'utf8');
    assert.match(text, /Generated by `asdd sync`/);
    assert.match(text, /\| alpha \| lite \| discovery \| in_progress \| 0 \|/);
    assert.match(text, /\| beta \| full \| discovery \| in_progress \| 0 \|/);
    assert.doesNotMatch(text, /hand edited/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
