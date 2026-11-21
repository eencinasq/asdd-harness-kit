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
    // An installed project carries the platform registry (phase/mode vocabulary lives there now, D-3).
    mkdirSync(join(root, '.harness/config'), { recursive: true });
    cpSync(
      join(dirname(fileURLToPath(import.meta.url)), '../../registry/contribution-points.json'),
      join(root, '.harness/config/contribution-points.json'),
    );
    writeFileSync(join(root, '.harness/state/registry.json'), JSON.stringify({ schema_version: '3.0', slices: [] }));
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

// ---- TASK-008: `asdd sync` span tree (REQ-010, REQ-002, REQ-005, REQ-006; design §4.3, §5.5, ADR-001) ----

const TEL_HERE = (await import('node:path')).dirname((await import('node:url')).fileURLToPath(import.meta.url));
const telFs = await import('node:fs');
const telPath = await import('node:path');
const { spawnSync: telSpawn } = await import('node:child_process');
const { tmpdir: telTmp } = await import('node:os');
const telCrypto = await import('node:crypto');
const TEL_SCHEMA = JSON.parse(telFs.readFileSync(telPath.join(TEL_HERE, '../../../.harness/state/telemetry/telemetry.schema.json'), 'utf8'));
const TEL_STREAM = '.harness/state/telemetry/spans.jsonl';
const TEL_STATES = ['location-absent', 'stream-absent', 'writable', 'unwritable'];
const HARNESS_COPY = '.harness/cli/src/harness';
const SYNC = `${HARNESS_COPY}/sync-state.mjs`;
const FIXTURE_TIME = new Date('2026-01-01T00:00:00.000Z');

/**
 * A temp project: a harness copy (telemetry-lib working | throw | deleted; optional knowledge and learning stubs),
 * one full slice with a passing feature (so sync also stamps evidence), and the telemetry location in `state`.
 */
function syncProject(state, { lib = 'working', knowledge = 'real', learn = 'real', brokenManifest = false } = {}) {
  const root = telFs.mkdtempSync(telPath.join(telTmp(), 'sync-tel-'));
  const dir = telPath.join(root, HARNESS_COPY);
  telFs.cpSync(TEL_HERE, dir, { recursive: true, filter: (src) => !src.endsWith('.test.mjs') });
  // The package layout: cli/registry next to cli/src (the commands read their arguments from it).
  telFs.cpSync(telPath.join(TEL_HERE, '../../registry'), telPath.join(dir, '../../registry'), { recursive: true });
  telFs.mkdirSync(telPath.join(root, '.harness/state/slices'), { recursive: true });
  telFs.writeFileSync(telPath.join(root, '.harness/state/manifest.json'), JSON.stringify({ schema_version: '3.0', active_slices: [] }));
  // Frozen clock here too: the fixture's own session timestamp must not differ between two fixtures.
  const init = telSpawn(process.execPath, [`${HARNESS_COPY}/init-slice.mjs`, 'alpha', '--full'], { cwd: root, encoding: 'utf8', env: cleanEnv(frozenEnv()) });
  assert.equal(init.status, 0, init.stderr);
  telFs.mkdirSync(telPath.join(root, 'src'), { recursive: true });
  telFs.writeFileSync(telPath.join(root, 'src/a.mjs'), 'export const a = 1;\n');
  telFs.mkdirSync(telPath.join(root, '.harness/features'), { recursive: true });
  telFs.writeFileSync(
    telPath.join(root, '.harness/features/alpha.features.json'),
    `${JSON.stringify({ slice_id: 'alpha', features: [{ id: 'TASK-001', status: 'passing', evidence: 'npm test: 1/1', scope_paths: ['src/a.mjs'] }] }, null, 2)}\n`,
  );
  if (brokenManifest) {
    // A directory in the manifest's place: syncSlice's writeJson throws EISDIR, so main() throws.
    const manifest = telPath.join(root, '.harness/state/slices/alpha/manifest.json');
    telFs.rmSync(manifest, { force: true });
    telFs.mkdirSync(manifest);
  }
  if (lib === 'throw') telFs.writeFileSync(telPath.join(dir, 'telemetry-lib.mjs'), "throw new Error('telemetry boom');\n");
  if (lib === 'deleted') telFs.rmSync(telPath.join(dir, 'telemetry-lib.mjs'));
  if (knowledge === 'throw') {
    telFs.writeFileSync(telPath.join(dir, 'sync-knowledge.mjs'), "export async function writeKnowledgeIndex() { throw new Error('knowledge boom'); }\n");
  }
  if (learn === 'absent') telFs.rmSync(telPath.join(dir, 'learn.mjs'));
  if (learn === 'fail') telFs.writeFileSync(telPath.join(dir, 'learn.mjs'), "process.stdout.write('not json');\nprocess.stderr.write('learn broke');\nprocess.exit(3);\n");
  // The knowledge index records input mtimes: pin every fixture file's mtime so two fixtures are comparable.
  const pin = (rel) => {
    for (const entry of telFs.readdirSync(telPath.join(root, rel), { withFileTypes: true })) {
      const child = telPath.join(rel, entry.name);
      if (entry.isDirectory()) pin(child);
      else telFs.utimesSync(telPath.join(root, child), FIXTURE_TIME, FIXTURE_TIME);
    }
  };
  pin('.harness/state');
  pin('.harness/specs');
  pin('.harness/features');
  pin('src');
  if (state !== 'location-absent') telFs.mkdirSync(telPath.join(root, '.harness/state/telemetry'), { recursive: true });
  if (state === 'writable') telFs.writeFileSync(telPath.join(root, TEL_STREAM), '');
  if (state === 'unwritable') {
    // Read-only file when not root; a directory in the stream's place otherwise (EISDIR holds for root too).
    if (process.getuid?.() !== 0) {
      telFs.writeFileSync(telPath.join(root, TEL_STREAM), '');
      telFs.chmodSync(telPath.join(root, TEL_STREAM), 0o444);
    } else {
      telFs.mkdirSync(telPath.join(root, TEL_STREAM));
    }
  }
  return root;
}

function cleanEnv(extra = {}) {
  const base = { ...process.env };
  for (const key of ['HARNESS_SLICE_ID', 'HARNESS_TRACE_ID', 'HARNESS_SPAN_ID', 'HARNESS_RUNTIME', 'NODE_OPTIONS']) delete base[key];
  return { ...base, ...extra };
}

function syncCleanup(root) {
  const stream = telPath.join(root, TEL_STREAM);
  if (telFs.existsSync(stream) && !telFs.statSync(stream).isDirectory()) telFs.chmodSync(stream, 0o644);
  telFs.rmSync(root, { recursive: true, force: true });
}

/**
 * Frozen clock preload (inherited by the learn.mjs child through NODE_OPTIONS): every `new Date()` / `Date.now()`
 * returns one fixed instant, so the timestamps sync itself writes (manifest created_at/updated_at, registry
 * generated_at, knowledge meta generated_at, learning patterns generated_at) are equal across runs without any
 * normalization of the compared bytes.
 */
const CLOCK = telPath.join(telFs.mkdtempSync(telPath.join(telTmp(), 'sync-clock-')), 'clock.mjs');
telFs.writeFileSync(
  CLOCK,
  "const FIXED = Date.parse('2026-01-02T03:04:05.000Z');\nconst Real = Date;\n" +
    'class Fixed extends Real { constructor(...a) { if (a.length === 0) super(FIXED); else super(...a); } static now() { return FIXED; } }\n' +
    'globalThis.Date = Fixed;\n',
);
(await import('node:test')).after(() => telFs.rmSync(telPath.dirname(CLOCK), { recursive: true, force: true }));

function frozenEnv() {
  return { NODE_OPTIONS: `--import=${new URL(`file://${CLOCK}`).href}` };
}

function runSync(root, args = [], { env = {}, frozen = false } = {}) {
  const extra = frozen ? { ...frozenEnv(), ...env } : env;
  const out = telSpawn(process.execPath, [SYNC, ...args], { cwd: root, encoding: 'utf8', env: cleanEnv(extra) });
  return { stdout: out.stdout, stderr: out.stderr, status: out.status };
}

/** Every file of the project except the harness copy and the telemetry location: rel path → sha256 of its bytes. */
function snapshot(root, { withTelemetry = false } = {}) {
  const files = {};
  const walk = (rel) => {
    for (const entry of telFs.readdirSync(telPath.join(root, rel), { withFileTypes: true })) {
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      if (child === '.harness/cli') continue;
      if (!withTelemetry && child === '.harness/state/telemetry') continue;
      if (entry.isDirectory()) walk(child);
      else files[child] = telCrypto.createHash('sha256').update(telFs.readFileSync(telPath.join(root, child))).digest('hex');
    }
  };
  walk('');
  return files;
}

function syncSpans(root) {
  const file = telPath.join(root, TEL_STREAM);
  if (!telFs.existsSync(file) || telFs.statSync(file).isDirectory()) return [];
  return telFs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

// The only normalization: Node's own process-warning prefix `(node:<pid>)` (the node:sqlite ExperimentalWarning
// from the knowledge index) carries the child's pid, which differs per process. Sync output is compared raw.
const nodePid = (text) => String(text).replace(/^\(node:\d+\) /gm, '(node:PID) ');

function assertSameRun(actual, baseline, label) {
  assert.equal(actual.stdout, baseline.stdout, `${label} stdout`);
  assert.equal(nodePid(actual.stderr), nodePid(baseline.stderr), `${label} stderr`);
  assert.equal(actual.status, baseline.status, `${label} status`);
}

function assertSameFiles(actual, baseline, label) {
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(baseline).sort(), `${label} file set`);
  for (const [rel, bytes] of Object.entries(baseline)) assert.equal(actual[rel], bytes, `${label} ${rel} bytes (sha256)`);
}

test('TASK-008 REQ-010 REQ-005: one root sync span, knowledge and learning children share its trace and point at it', async () => {
  const { validateSpan } = await import('./telemetry-lib.mjs');
  for (const args of [[], ['--slice', 'alpha']]) {
    const root = syncProject('writable');
    try {
      const out = runSync(root, args);
      assert.equal(out.status, 0, out.stderr);
      const spans = syncSpans(root);
      assert.equal(spans.length, 3, `[${args}] span count`);
      for (const span of spans) assert.deepEqual(validateSpan(span, TEL_SCHEMA), [], `[${args}] ${span.process_name} validates`);
      const roots = spans.filter((s) => s.parent_span_id === null);
      assert.equal(roots.length, 1, 'exactly one root');
      const [rootSpan] = roots;
      assert.equal(rootSpan.kind, 'sync');
      assert.equal(rootSpan.process_name, 'sync-state');
      assert.equal(rootSpan.writer, 'sync-state');
      assert.equal(rootSpan.runtime, 'cli');
      assert.equal(rootSpan.status, 'OK');
      assert.equal(rootSpan.slice_id, 'alpha');
      assert.equal(rootSpan.attributes.trace_source, 'self');
      const children = spans.filter((s) => s !== rootSpan);
      assert.deepEqual(children.map((s) => s.process_name).sort(), ['sync-state/knowledge-index', 'sync-state/learning']);
      for (const child of children) {
        assert.equal(child.kind, 'sync');
        assert.equal(child.writer, 'sync-state');
        assert.equal(child.runtime, 'cli');
        assert.equal(child.status, 'OK', child.process_name);
        assert.equal(child.trace_id, rootSpan.trace_id, 'same trace');
        assert.equal(child.parent_span_id, rootSpan.span_id, 'parent = root span');
        assert.notEqual(child.span_id, rootSpan.span_id);
        assert.equal(child.attributes.trace_source, rootSpan.attributes.trace_source);
        // The root covers the whole run.
        assert.ok(Date.parse(rootSpan.start_time_iso) <= Date.parse(child.start_time_iso), 'root starts first');
        assert.ok(Date.parse(rootSpan.end_time_iso) >= Date.parse(child.end_time_iso), 'root ends last');
        for (const key of ['heuristic', 'trigger_span_id', 'source']) assert.equal(Object.hasOwn(child.attributes, key), false);
      }
      assert.equal(children.find((s) => s.process_name === 'sync-state/learning').attributes.exit_code, 0);
      assert.equal(Object.hasOwn(children.find((s) => s.process_name === 'sync-state/knowledge-index').attributes, 'exit_code'), false);
    } finally {
      syncCleanup(root);
    }
  }
});

test('TASK-008 REQ-010: HARNESS_RUNTIME sets the runtime of the root and both children', () => {
  const root = syncProject('stream-absent');
  try {
    assert.equal(runSync(root, [], { env: { HARNESS_RUNTIME: 'ci' } }).status, 0);
    const spans = syncSpans(root);
    assert.equal(spans.length, 3);
    for (const span of spans) assert.equal(span.runtime, 'ci', span.process_name);
  } finally {
    syncCleanup(root);
  }
});

test('TASK-008 REQ-010: learn.mjs absent gives no learning child; a failing learn child gives an ERROR child with exit_code', () => {
  const absent = syncProject('writable', { learn: 'absent' });
  const failing = syncProject('writable', { learn: 'fail' });
  try {
    assert.equal(runSync(absent).status, 0);
    assert.deepEqual(syncSpans(absent).map((s) => s.process_name).sort(), ['sync-state', 'sync-state/knowledge-index']);
    const out = runSync(failing);
    assert.equal(out.status, 0);
    assert.match(out.stderr, /WARN {2}learning patterns not regenerated: learn broke/);
    const learning = syncSpans(failing).find((s) => s.process_name === 'sync-state/learning');
    assert.equal(learning.status, 'ERROR');
    assert.equal(learning.attributes.exit_code, 3);
    assert.equal(syncSpans(failing).find((s) => s.parent_span_id === null).status, 'OK', 'a derived failure is not a sync failure');
  } finally {
    syncCleanup(absent);
    syncCleanup(failing);
  }
});

test('TASK-008 REQ-010: a throwing knowledge index gives an ERROR knowledge child and an OK root', () => {
  const root = syncProject('writable', { knowledge: 'throw' });
  try {
    const out = runSync(root);
    assert.equal(out.status, 0);
    assert.match(out.stderr, /WARN {2}knowledge index not regenerated: knowledge boom/);
    const spans = syncSpans(root);
    assert.equal(spans.length, 3);
    assert.equal(spans.find((s) => s.process_name === 'sync-state/knowledge-index').status, 'ERROR');
    assert.equal(spans.find((s) => s.process_name === 'sync-state/learning').status, 'OK');
    assert.equal(spans.find((s) => s.parent_span_id === null).status, 'OK');
  } finally {
    syncCleanup(root);
  }
});

test('TASK-008 REQ-010 REQ-002: main() throwing still emits an ERROR root span (finally) and keeps the same error and exit code', () => {
  // One project for both runs, so the error text (it names absolute paths) is comparable byte for byte.
  const root = syncProject('writable', { brokenManifest: true });
  const lib = telPath.join(root, HARNESS_COPY, 'telemetry-lib.mjs');
  const features = telPath.join(root, '.harness/features/alpha.features.json');
  const featuresBefore = telFs.readFileSync(features);
  try {
    telFs.renameSync(lib, `${lib}.off`);
    const without = runSync(root, [], { frozen: true });
    telFs.renameSync(`${lib}.off`, lib);
    telFs.writeFileSync(features, featuresBefore); // undo the evidence stamp so the second run starts from the same state
    assert.notEqual(without.status, 0, 'the fixture makes sync fail');
    assert.match(without.stderr, /EISDIR/);
    assert.deepEqual(syncSpans(root), [], 'no lib, no span');
    const withTel = runSync(root, [], { frozen: true });
    assertSameRun(withTel, without, 'error path');
    const spans = syncSpans(root);
    assert.equal(spans.length, 1, 'root only: main() threw before the derived steps');
    assert.equal(spans[0].parent_span_id, null);
    assert.equal(spans[0].status, 'ERROR');
    assert.equal(spans[0].kind, 'sync');
    assert.equal(spans[0].process_name, 'sync-state');
  } finally {
    syncCleanup(root);
  }
});

test('TASK-008 REQ-010 REQ-002 REQ-006: stdout, stderr, exit and every generated file byte-identical over 4 telemetry states x lib throw/deleted', () => {
  const variants = [...TEL_STATES.map((state) => [state, 'working']), ['writable', 'throw'], ['writable', 'deleted']];
  for (const args of [[], ['--slice', 'alpha']]) {
    // Baseline: a run without telemetry (no location, no lib).
    const base = syncProject('location-absent', { lib: 'deleted' });
    let baseline;
    let baseFiles;
    try {
      baseline = runSync(base, args, { frozen: true });
      assert.equal(baseline.status, 0, baseline.stderr);
      baseFiles = snapshot(base);
      for (const rel of ['.harness/state/registry.json', '.harness/PROGRESS.md', '.harness/state/slices/alpha/manifest.json', '.harness/features/alpha.features.json']) {
        assert.ok(rel in baseFiles, `baseline wrote ${rel}`);
      }
      assert.ok(Object.keys(baseFiles).some((rel) => rel.startsWith('.harness/state/learning/')), 'baseline wrote learning output');
      assert.ok(Object.keys(baseFiles).some((rel) => rel.startsWith('.harness/knowledge/')), 'baseline wrote the knowledge index');
    } finally {
      syncCleanup(base);
    }
    for (const [state, lib] of variants) {
      const label = `[${args.join(' ') || 'all'}] [${state}/${lib}]`;
      const root = syncProject(state, { lib });
      try {
        const out = runSync(root, args, { frozen: true });
        assertSameRun(out, baseline, label);
        assertSameFiles(snapshot(root), baseFiles, label);
        const expected = lib === 'working' && (state === 'writable' || state === 'stream-absent') ? 3 : 0;
        assert.equal(syncSpans(root).length, expected, `${label} span count`);
        // REQ-006: the only telemetry-side file is the stream; no directory is created.
        const tel = Object.keys(snapshot(root, { withTelemetry: true })).filter((rel) => rel.startsWith('.harness/state/telemetry'));
        if (state === 'location-absent') assert.equal(telFs.existsSync(telPath.join(root, '.harness/state/telemetry')), false, label);
        const streamFile = state === 'writable' || (state === 'stream-absent' && lib === 'working') || (state === 'unwritable' && process.getuid?.() !== 0);
        assert.deepEqual(tel, streamFile ? [TEL_STREAM] : [], `${label} telemetry files`);
      } finally {
        syncCleanup(root);
      }
    }
  }
});

test('TASK-008 REQ-006: emission writes nothing but the stream (sessions, manifests, registry, features, learning, knowledge untouched)', () => {
  const root = syncProject('writable');
  try {
    assert.equal(runSync(root, [], { frozen: true }).status, 0);
    const before = snapshot(root, { withTelemetry: true });
    // A second run re-derives the same state; the only file that changes is the append-only stream.
    assert.equal(runSync(root, [], { frozen: true }).status, 0);
    const after = snapshot(root, { withTelemetry: true });
    const changed = Object.keys({ ...before, ...after }).filter((rel) => before[rel] !== after[rel]);
    assert.deepEqual(changed, [TEL_STREAM]);
    assert.equal(syncSpans(root).length, 6);
  } finally {
    syncCleanup(root);
  }
});

test('TASK-008 REQ-010: importing sync-state as a module (MCP servers) emits no span', () => {
  const root = syncProject('writable');
  try {
    const out = telSpawn(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(telPath.join(root, SYNC))});`], { cwd: root, encoding: 'utf8', env: cleanEnv() });
    assert.equal(out.status, 0, out.stderr);
    assert.deepEqual(syncSpans(root), []);
  } finally {
    syncCleanup(root);
  }
});
