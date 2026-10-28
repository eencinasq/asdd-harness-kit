import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  compactSignals,
  countOccurrences,
  exportLessons,
  learningForReview,
  writeCommandSignal,
  failureSignatures,
  isoWeek,
  derivePatterns,
  invariantSignature,
  nextProposalId,
  parseFailureLog,
  patternId,
  writeSensorSignal,
} from './learning-lib.mjs';
import validateLearning, { appliedCommitFinding, proposalFindings } from './validators/learning.mjs';

function withFixture(fn) {
  return () => {
    const root = mkdtempSync(join(tmpdir(), 'learning-'));
    try {
      fn(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };
}

function write(root, rel, content) {
  mkdirSync(join(root, rel, '..'), { recursive: true });
  writeFileSync(join(root, rel), typeof content === 'string' ? content : JSON.stringify(content));
}

function session(root, slice, n, data) {
  write(root, `.harness/state/slices/${slice}/sessions/${String(n).padStart(3, '0')}.json`, { slice_id: slice, ...data });
}

function proposal(root, id, fields, body = '') {
  const fm = Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join('\n');
  write(root, `docs/knowledge-base/steering-proposals/${id}.md`, `---\n${fm}\n---\n${body}`);
}

function failureLog(root, entries) {
  const rows = entries.map((e) => `- **Date:** ${e.date}\n- **Slice:** ${e.slice}\n- **Signature:** ${e.sig}\n- **Failure:** boom\n`).join('\n');
  write(root, 'docs/agent-failure-log.md', `# Agent Failure Log\n\n\`\`\`\n- **Date:** YYYY-MM-DD\n- **Signature:** <signature>\n\`\`\`\n\n## Incidents\n\n${rows}`);
}

function run(root) {
  const errors = [];
  const warnings = [];
  validateLearning({ root, fail: (m) => errors.push(m), warn: (m) => warnings.push(m) });
  return { errors, warnings };
}

test('REQ-LEARN-01: invariant lines reduce to code plus area, or a blanked shape', () => {
  assert.equal(invariantSignature('FAIL  DRIFT-01 docs/x.md changed but is not mapped by a, b'), 'sensor:DRIFT-01:docs');
  assert.equal(invariantSignature('DRIFT-01 .harness/steering/README.md changed'), 'sensor:DRIFT-01:.harness/steering');
  assert.equal(invariantSignature('DRIFT-01 README.md changed but is not mapped'), 'sensor:DRIFT-01:README.md');
  assert.equal(
    invariantSignature('lite slice "a" cannot complete with open escalation signals (E1)'),
    invariantSignature('lite slice "b" cannot complete with open escalation signals (E1)'),
  );
});

test('REQ-LEARN-01: stop blocks within the episode gap count once', () => {
  const at = (min) => new Date(Date.UTC(2026, 0, 1, 0, min)).toISOString();
  const sensor = (min) => ({ source: 'sensor', at: at(min) });
  assert.equal(countOccurrences([sensor(0), sensor(5), sensor(20)]), 1);
  assert.equal(countOccurrences([sensor(0), sensor(45), sensor(90)]), 3);
  assert.equal(countOccurrences([{ source: 'audit', at: at(0), weight: 4 }]), 4);
});

test('failure log parsing ignores the fenced template and reads fields', () => {
  const entries = parseFailureLog('```\n- **Date:** YYYY\n```\n- **Date:** 2026-01-02\n- **Slice:** s1\n- **Signature:** a:b\n');
  assert.deepEqual(entries, [{ date: '2026-01-02', slice: 's1', signature: 'a:b' }]);
});

test('REQ-LEARN-02: three signed failures open an escape pattern; unsigned ones are reported', withFixture((root) => {
  failureLog(root, [
    { date: '2026-01-01', slice: 's1', sig: 'migrations:missing-down' },
    { date: '2026-01-02', slice: 's1', sig: 'migrations:missing-down' },
    { date: '2026-01-03', slice: 's2', sig: 'migrations:missing-down' },
  ]);
  const { patterns } = derivePatterns(root);
  assert.equal(patterns.length, 1);
  assert.equal(patterns[0].id, patternId('failure:migrations:missing-down'));
  assert.equal(patterns[0].status, 'open');
  assert.equal(patterns[0].kind, 'escape');
  assert.deepEqual(patterns[0].slices, ['s1', 's2']);
}));

test('REQ-LEARN-02: repeated dismissals of one check are a noise pattern', withFixture((root) => {
  const dismissal = (at) => ({ decision: 'dismissed', check: 'DRIFT-04', reason: 'tests named differently', at });
  write(root, '.harness/audits/triage.json', {
    'AUD-00000001': dismissal('2026-01-01'),
    'AUD-00000002': dismissal('2026-01-02'),
    'AUD-00000003': dismissal('2026-01-03'),
  });
  const [p] = derivePatterns(root).patterns;
  assert.equal(p.signature, 'dismissed:DRIFT-04');
  assert.equal(p.kind, 'noise');
  assert.equal(p.status, 'open');
}));

test('REQ-LEARN-01: sensor signals from the stop hook become patterns', withFixture((root) => {
  for (const [i, iso] of ['2026-01-01T00:00:00Z', '2026-01-01T02:00:00Z', '2026-01-01T04:00:00Z'].entries()) {
    const path = writeSensorSignal(root, ['FAIL  DRIFT-01 src/a.ts changed', 'FAIL  DRIFT-01 src/b.ts changed'], { now: new Date(iso) });
    assert.ok(path, `signal ${i} written`);
  }
  const [p] = derivePatterns(root).patterns;
  assert.equal(p.signature, 'sensor:DRIFT-01:src');
  assert.equal(p.occurrences, 3, 'two lines with one signature in one block count once');
}));

test('REQ-LEARN-03: an open pattern warns; a malformed proposal fails', withFixture((root) => {
  failureLog(root, [1, 2, 3].map((d) => ({ date: `2026-01-0${d}`, slice: 's1', sig: 'x:y' })));
  let { errors, warnings } = run(root);
  assert.equal(errors.length, 0);
  assert.match(warnings[0], /QG-LEARN-03 pattern LP-/);

  proposal(root, 'SP-001', { id: 'SP-001', pattern: patternId('failure:x:y'), status: 'applied', control: 'nope.md', change: 'add-guide', success: 'none' });
  ({ errors } = run(root));
  assert.ok(errors.some((e) => /control nope\.md does not exist/.test(e)));
  assert.ok(errors.some((e) => /needs decided_by/.test(e)));
  assert.ok(errors.some((e) => /needs applied_commit/.test(e)));
}));

test('REQ-LEARN-04: closing Knowledge with an open pattern from that slice fails; a rejected proposal closes it', withFixture((root) => {
  failureLog(root, [1, 2, 3].map((d) => ({ date: `2026-01-0${d}`, slice: 's1', sig: 'x:y' })));
  session(root, 's1', 1, { timestamp: '2026-01-04T00:00:00Z', event_type: 'phase_completed', phase: 'knowledge' });
  assert.ok(run(root).errors.some((e) => /QG-LEARN-04 slice "s1"/.test(e)));

  write(root, 'AGENTS.md', '# map');
  proposal(root, 'SP-001', { id: 'SP-001', pattern: patternId('failure:x:y'), status: 'rejected', control: 'AGENTS.md', change: 'add-guide', success: 'n/a', decided_by: 'tl' });
  const { errors, warnings } = run(root);
  assert.deepEqual(errors, []);
  assert.ok(!warnings.some((w) => /QG-LEARN-03 pattern/.test(w)));
}));

test('REQ-LEARN-05/06: an applied change is ineffective on recurrence and verified after a quiet window', withFixture((root) => {
  write(root, 'AGENTS.md', '# map');
  const id = patternId('failure:x:y');
  const applied = { id: 'SP-001', pattern: id, status: 'applied', control: 'AGENTS.md', change: 'add-guide', success: 'quiet', decided_by: 'tl', applied_at: '2026-01-10' };
  proposal(root, 'SP-001', applied);

  failureLog(root, [1, 2, 3].map((d) => ({ date: `2026-01-0${d}`, slice: 's1', sig: 'x:y' })));
  let [p] = derivePatterns(root).patterns;
  assert.equal(p.status, 'applied');

  for (let i = 1; i <= 10; i += 1) session(root, 's1', i, { timestamp: `2026-01-${10 + i}T00:00:00Z`, event_type: 'checkpoint' });
  [p] = derivePatterns(root).patterns;
  assert.equal(p.status, 'verified');

  failureLog(root, [1, 2, 3, 4].map((d) => ({ date: d === 4 ? '2026-01-20' : `2026-01-0${d}`, slice: 's1', sig: 'x:y' })));
  [p] = derivePatterns(root).patterns;
  assert.equal(p.status, 'open');
  assert.equal(p.reopened, true);
  assert.equal(p.proposals[0].status, 'ineffective');
}));

test('proposal ids are sequential and must match the file name', withFixture((root) => {
  assert.equal(nextProposalId(root), 'SP-001');
  write(root, 'AGENTS.md', '# map');
  proposal(root, 'SP-007', { id: 'SP-008', pattern: 'LP-x', status: 'proposed', control: 'AGENTS.md', change: 'add-guide', success: 'ok' });
  assert.equal(nextProposalId(root), 'SP-009');
  const findings = proposalFindings(root, { file: 'docs/knowledge-base/steering-proposals/SP-007.md', id: 'SP-008', pattern: 'LP-x', status: 'proposed', control: 'AGENTS.md', change: 'add-guide', success: 'ok' }, new Set());
  assert.ok(findings.some((f) => /match the file name/.test(f)));
  assert.ok(findings.some((f) => /matches no learning signal/.test(f)));
}));

test('REQ-LEARN-01: compaction folds raw runs into one weekly summary per author without changing counts', withFixture((root) => {
  const runs = ['2026-01-05T00:00:00Z', '2026-01-05T00:10:00Z', '2026-01-05T02:00:00Z', '2026-01-05T04:00:00Z'];
  for (const iso of runs) writeSensorSignal(root, ['FAIL  DRIFT-01 src/a.ts changed'], { now: new Date(iso) });
  const before = derivePatterns(root).patterns[0].occurrences;
  const { compacted, summaries } = compactSignals(root, { author: 'dev-a' });
  assert.equal(compacted, 4);
  assert.deepEqual(summaries, [`.harness/state/learning/summaries/${isoWeek(runs[0])}-dev-a.json`]);
  assert.deepEqual(readdirSync(join(root, '.harness/state/learning/signals')), []);
  assert.equal(before, 3);
  assert.equal(derivePatterns(root).patterns[0].occurrences, 3);

  // A run inside the gap of the last episode extends it; a later one adds an episode.
  writeSensorSignal(root, ['FAIL  DRIFT-01 src/b.ts changed'], { now: new Date('2026-01-05T04:05:00Z') });
  writeSensorSignal(root, ['FAIL  DRIFT-01 src/b.ts changed'], { now: new Date('2026-01-05T09:00:00Z') });
  compactSignals(root, { author: 'dev-a' });
  assert.equal(derivePatterns(root).patterns[0].occurrences, 4);

  // Another author's summary is a separate file; both count.
  writeSensorSignal(root, ['FAIL  DRIFT-01 src/c.ts changed'], { now: new Date('2026-01-06T00:00:00Z') });
  compactSignals(root, { author: 'dev-b' });
  assert.ok(existsSync(join(root, `.harness/state/learning/summaries/${isoWeek('2026-01-06T00:00:00Z')}-dev-b.json`)));
  assert.equal(derivePatterns(root).patterns[0].occurrences, 5);
}));

test('REQ-LEARN-06: an area pattern is verified only by sessions that touch its area', withFixture((root) => {
  for (const iso of ['2026-01-01T00:00:00Z', '2026-01-01T02:00:00Z', '2026-01-01T04:00:00Z']) {
    writeSensorSignal(root, ['FAIL  DRIFT-01 src/a.ts changed'], { now: new Date(iso) });
  }
  write(root, 'AGENTS.md', '# map');
  const id = patternId('sensor:DRIFT-01:src');
  proposal(root, 'SP-001', { id: 'SP-001', pattern: id, status: 'applied', control: 'AGENTS.md', change: 'add-guide', success: 'quiet', decided_by: 'tl', applied_at: '2026-01-10' });
  for (let i = 1; i <= 10; i += 1) session(root, 's1', i, { timestamp: `2026-01-${10 + i}T00:00:00Z`, event_type: 'feature_started', scope_paths: ['docs/x.md'] });
  assert.equal(derivePatterns(root).patterns[0].status, 'applied', 'sessions outside src do not verify it');
  for (let i = 11; i <= 20; i += 1) session(root, 's1', i, { timestamp: `2026-01-${10 + i}T00:00:00Z`, event_type: 'feature_started', scope_paths: ['src/a.ts'] });
  assert.equal(derivePatterns(root).patterns[0].status, 'verified');
}));

test('REQ-LEARN-05: applied_commit must exist and change the control file', withFixture((root) => {
  const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' }).stdout.trim();
  git('init', '-q', '-b', 'main');
  write(root, 'AGENTS.md', '# map');
  write(root, 'other.md', 'x');
  git('add', '-A');
  git('-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-q', '-m', 'base');
  write(root, 'AGENTS.md', '# map v2');
  git('-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-q', '-am', 'guide');
  const changed = git('rev-parse', 'HEAD');
  const base = git('rev-parse', 'HEAD~1');
  const p = { file: 'docs/knowledge-base/steering-proposals/SP-001.md', status: 'applied', control: 'AGENTS.md' };
  assert.deepEqual(appliedCommitFinding(root, { ...p, applied_commit: changed }), {});
  assert.match(appliedCommitFinding(root, { ...p, control: 'other.md', applied_commit: changed }).fail, /does not change other\.md/);
  assert.match(appliedCommitFinding(root, { ...p, applied_commit: 'deadbeef' }).fail, /is not a commit/);
  assert.deepEqual(appliedCommitFinding(root, { ...p, control: 'other.md', applied_commit: base }), {}, 'the root commit adds other.md');
  const missing = proposalFindings(root, { ...p, id: 'SP-001', pattern: 'LP-x', change: 'add-guide', success: 'ok', decided_by: 'tl' }, new Set(['LP-x']));
  assert.ok(missing.some((f) => /needs applied_commit/.test(f)));
}));

test('QG-DEB-05: failure signatures in use are listed for reuse', withFixture((root) => {
  failureLog(root, [
    { date: '2026-01-01', slice: 's1', sig: 'a:b' },
    { date: '2026-01-02', slice: 's1', sig: 'a:b' },
    { date: '2026-01-03', slice: 's1', sig: 'c:d' },
  ]);
  assert.deepEqual(failureSignatures(root), [{ signature: 'a:b', entries: 2 }, { signature: 'c:d', entries: 1 }]);
}));

test('QG-LEARN-08: a WARN opens as noise only after 5 distinct days; learning WARNs are skipped', withFixture((root) => {
  const day = (d) => new Date(Date.UTC(2026, 0, d, 9));
  for (const d of [1, 1, 2, 3, 4]) writeSensorSignal(root, [], { warns: ['WARN  project bindings are scaffolded', 'QG-LEARN-03 pattern LP-x'], now: day(d) });
  let [p] = derivePatterns(root).patterns;
  assert.equal(p.signature, 'warn:project bindings are scaffolded');
  assert.equal(p.occurrences, 4, 'counted by distinct day');
  assert.equal(p.status, 'watching');
  assert.equal(derivePatterns(root).patterns.length, 1, 'QG-LEARN WARNs are not recorded');
  writeSensorSignal(root, [], { warns: ['project bindings are scaffolded'], now: day(5) });
  compactSignals(root, { author: 'a' });
  [p] = derivePatterns(root).patterns;
  assert.equal(p.occurrences, 5);
  assert.equal(p.kind, 'noise');
  assert.equal(p.status, 'open');
}));

test('QG-LEARN-01: command denials, blocked work, and dissent become patterns', withFixture((root) => {
  for (const h of [0, 2, 4]) writeCommandSignal(root, 'git push --force', { now: new Date(Date.UTC(2026, 0, 1, h)) });
  session(root, 's1', 1, { timestamp: '2026-01-01T00:00:00Z', event_type: 'feature_started', feature_id: 'F1', scope_paths: ['src/a.ts'] });
  for (let i = 2; i <= 4; i += 1) session(root, 's1', i, { timestamp: `2026-01-0${i}T00:00:00Z`, event_type: 'feature_blocked', feature_id: 'F1' });
  session(root, 's1', 5, { timestamp: '2026-01-05T00:00:00Z', event_type: 'phase_blocked', phase: 'design' });
  session(root, 's1', 6, { timestamp: '2026-01-06T00:00:00Z', event_type: 'dissent', phase: 'design', note: 'x' });
  const by = Object.fromEntries(derivePatterns(root).patterns.map((p) => [p.signature, p]));
  assert.equal(by['command:git push --force'].status, 'open');
  assert.equal(by['blocked:feature:src'].occurrences, 3);
  assert.equal(by['blocked:phase:design'].status, 'watching');
  assert.ok(by['dissent:design']);
}));

test('QG-LEARN-01: review view marks patterns about a changed area or a linked slice', withFixture((root) => {
  for (const h of [0, 2, 4]) writeSensorSignal(root, ['DRIFT-01 src/a.ts changed'], { now: new Date(Date.UTC(2026, 0, 1, h)) });
  failureLog(root, [1, 2, 3].map((d) => ({ date: `2026-01-0${d}`, slice: 's9', sig: 'x:y' })));
  let view = learningForReview(root, { changed: ['src/b.ts'] });
  assert.equal(view.open, 2);
  assert.equal(view.relevant, 1);
  assert.equal(view.patterns[0].signature, 'sensor:DRIFT-01:src');
  view = learningForReview(root, { changed: ['docs/x.md'], slices: ['s9'] });
  assert.equal(view.patterns.find((p) => p.signature === 'failure:x:y').relevant, true);
}));

test('QG-LEARN-09: export keeps verified lessons on kit-owned controls, generic fields only', withFixture((root) => {
  write(root, '.harness/config/installed-versions.json', { kit_version: '9.9.9', managed_files: ['.harness/steering/asdd-lite.md'] });
  write(root, '.harness/steering/asdd-lite.md', '# lite');
  write(root, 'local.md', '# project');
  failureLog(root, [1, 2, 3].map((d) => ({ date: `2026-01-0${d}`, slice: 'secret-slice', sig: 'x:y' })));
  const id = patternId('failure:x:y');
  const base = { pattern: id, status: 'applied', change: 'tighten-guide', success: 'quiet', decided_by: 'tl', applied_at: '2026-01-10' };
  proposal(root, 'SP-001', { id: 'SP-001', ...base, control: '.harness/steering/asdd-lite.md' }, 'secret body');
  proposal(root, 'SP-002', { id: 'SP-002', ...base, control: 'local.md' });
  for (let i = 1; i <= 10; i += 1) session(root, 's1', i, { timestamp: `2026-01-${10 + i}T00:00:00Z`, event_type: 'checkpoint' });
  const { lessons, markdown } = exportLessons(root);
  assert.equal(lessons.length, 1, 'project-owned controls stay local');
  assert.equal(lessons[0].result, 'verified');
  assert.match(markdown, /kit 9\.9\.9/);
  assert.doesNotMatch(markdown, /secret/);
}));
