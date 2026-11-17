import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSpan } from './telemetry-lib.mjs';

// TASK-006: Verify-on-Stop emits one `hook` span per exit path through finish() (REQ-009, REQ-002, REQ-005).

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA = JSON.parse(readFileSync(join(HERE, '../../../.harness/state/telemetry/telemetry.schema.json'), 'utf8'));
const STREAM = '.harness/state/telemetry/spans.jsonl';
const HOOK = '.harness/cli/src/harness/verify-on-stop.mjs';

/** check-invariants.mjs stand-ins: pass, fail with 2 FAIL lines (one per stream), missing, self-SIGKILL (null status). */
const STUBS = {
  pass: "process.stdout.write('PASS  harness invariants\\n');\n",
  fail: [
    "process.stdout.write('PASS  harness invariants\\nFAIL  QG-STUB-01 first violation\\nWARN  QG-STUB-02 not counted\\n');",
    "process.stderr.write('FAIL  QG-STUB-03 second violation\\n  xFAIL not counted\\n');",
    'process.exitCode = 1;',
    '',
  ].join('\n'),
  missing: null,
  killed: "process.kill(process.pid, 'SIGKILL');\n",
};

const CLAUDE = JSON.stringify({ hook_event_name: 'Stop', session_id: 'sess-1' });
const CURSOR = JSON.stringify({ hook_event_name: 'stop', status: 'completed', loop_count: 0 });

/** Expected payload shape per outcome and protocol (messages are unchanged by TASK-006). */
const PAYLOAD = {
  empty: (out) => assert.deepEqual(out, {}),
  claudeBlock: (out) => {
    assert.deepEqual(Object.keys(out), ['decision', 'reason']);
    assert.equal(out.decision, 'block');
  },
  cursorFollowup: (out) => assert.deepEqual(Object.keys(out), ['followup_message']),
};

/** Every exit path: [name, stub, stdin, env, outcome, runtime, check attributes or null, payload shape]. */
const SCENARIOS = [
  ['pass claude', 'pass', CLAUDE, {}, 'pass', 'claude', { exit_code: 0, violations_count: 0 }, 'empty'],
  ['pass cursor', 'pass', CURSOR, {}, 'pass', 'cursor', { exit_code: 0, violations_count: 0 }, 'empty'],
  ['pass cli', 'pass', '', {}, 'pass', 'cli', { exit_code: 0, violations_count: 0 }, 'empty'],
  ['block claude', 'fail', CLAUDE, {}, 'block', 'claude', { exit_code: 1, violations_count: 2 }, 'claudeBlock'],
  ['block cursor', 'fail', CURSOR, {}, 'block', 'cursor', { exit_code: 1, violations_count: 2 }, 'cursorFollowup'],
  ['advisory claude', 'fail', CLAUDE, { HARNESS_STOP_MODE: 'advisory' }, 'advisory', 'claude', { exit_code: 1, violations_count: 2 }, 'empty'],
  ['advisory cursor', 'fail', CURSOR, { HARNESS_STOP_MODE: 'advisory' }, 'advisory', 'cursor', { exit_code: 1, violations_count: 2 }, 'empty'],
  ['guard-skip claude stop_hook_active', 'fail', JSON.stringify({ hook_event_name: 'Stop', stop_hook_active: true }), {}, 'guard-skip', 'claude', null, 'empty'],
  ['guard-skip cursor aborted', 'fail', JSON.stringify({ hook_event_name: 'stop', status: 'aborted' }), {}, 'guard-skip', 'cursor', null, 'empty'],
  ['guard-skip cursor error', 'fail', JSON.stringify({ status: 'error' }), {}, 'guard-skip', 'cursor', null, 'empty'],
  ['could-not-run missing check', 'missing', CLAUDE, {}, 'could-not-run', 'claude', null, 'claudeBlock'],
  ['could-not-run null status', 'killed', CURSOR, {}, 'could-not-run', 'cursor', null, 'cursorFollowup'],
];

const STATES = ['location-absent', 'stream-absent', 'writable', 'unwritable'];

/** A temp project with the hook, stop-mode, the telemetry lib (working | throw | deleted) and a check stub. */
function project(state, stub, lib = 'working') {
  const root = mkdtempSync(join(tmpdir(), 'vos-tel-'));
  const dir = join(root, '.harness/cli/src/harness');
  mkdirSync(dir, { recursive: true });
  for (const file of ['verify-on-stop.mjs', 'stop-mode.mjs', 'telemetry-lib.mjs']) cpSync(join(HERE, file), join(dir, file));
  if (lib === 'throw') writeFileSync(join(dir, 'telemetry-lib.mjs'), "throw new Error('boom');\n");
  if (lib === 'deleted') rmSync(join(dir, 'telemetry-lib.mjs'));
  if (lib === 'marker') writeFileSync(join(dir, 'telemetry-lib.mjs'), "process.stdout.write('LIB-LOADED\\n');\n");
  if (STUBS[stub] !== null) writeFileSync(join(dir, 'check-invariants.mjs'), STUBS[stub]);
  if (state !== 'location-absent') mkdirSync(join(root, '.harness/state/telemetry'), { recursive: true });
  if (state === 'writable') writeFileSync(join(root, STREAM), '');
  if (state === 'unwritable') {
    // Read-only file when not root; a directory in the stream's place otherwise (EISDIR holds for root too).
    if (process.getuid?.() !== 0) {
      writeFileSync(join(root, STREAM), '');
      chmodSync(join(root, STREAM), 0o444);
    } else {
      mkdirSync(join(root, STREAM));
    }
  }
  return root;
}

function cleanup(root) {
  const stream = join(root, STREAM);
  if (existsSync(stream) && !statSync(stream).isDirectory()) chmodSync(stream, 0o644);
  rmSync(root, { recursive: true, force: true });
}

function run(root, stdin, env) {
  const base = { ...process.env };
  for (const key of ['HARNESS_STOP_MODE', 'HARNESS_SLICE_ID', 'HARNESS_TRACE_ID', 'HARNESS_SPAN_ID', 'HARNESS_RUNTIME']) delete base[key];
  const out = spawnSync(process.execPath, [HOOK], { cwd: root, input: stdin, encoding: 'utf8', env: { ...base, ...env } });
  return { stdout: out.stdout, stderr: out.stderr, status: out.status };
}

function spans(root) {
  const file = join(root, STREAM);
  if (!existsSync(file) || statSync(file).isDirectory()) return [];
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

test('TASK-006 REQ-009/REQ-005: every exit path writes its payload, then exactly one hook span with outcome and runtime', () => {
  for (const [name, stub, stdin, env, outcome, runtime, check, shape] of SCENARIOS) {
    const root = project('writable', stub);
    try {
      const out = run(root, stdin, env);
      assert.equal(out.status, 0, name);
      PAYLOAD[shape](JSON.parse(out.stdout));
      const all = spans(root);
      assert.equal(all.length, 1, `${name}: one span`);
      const [span] = all;
      assert.equal(span.kind, 'hook', name);
      assert.equal(span.process_name, 'verify-on-stop', name);
      assert.equal(span.writer, 'verify-on-stop', name);
      assert.equal(span.runtime, runtime, name);
      assert.equal(span.status, outcome === 'could-not-run' ? 'ERROR' : 'OK', name);
      assert.equal(span.attributes.outcome, outcome, name);
      assert.equal(span.attributes.trace_source, 'self', name);
      if (check) {
        assert.equal(span.attributes.exit_code, check.exit_code, name);
        assert.equal(span.attributes.violations_count, check.violations_count, name);
      } else {
        // check --live gave no numeric status: both keys omitted, never 0.
        assert.equal(Object.hasOwn(span.attributes, 'exit_code'), false, name);
        assert.equal(Object.hasOwn(span.attributes, 'violations_count'), false, name);
      }
      assert.deepEqual(validateSpan(span, SCHEMA), [], name);
      assert.doesNotMatch(readFileSync(join(root, STREAM), 'utf8'), /QG-STUB/, `${name}: no check output in the span`);
    } finally {
      cleanup(root);
    }
  }
});

test('TASK-006 REQ-009/REQ-002 fail-open: stdout, stderr and exit byte-identical over outcome x 4 telemetry states x lib throw/deleted', () => {
  const variants = [...STATES.map((state) => [state, 'working']), ['writable', 'throw'], ['writable', 'deleted']];
  let differences = 0;
  for (const [name, stub, stdin, env, outcome] of SCENARIOS) {
    const baseRoot = project('location-absent', stub);
    let baseline;
    try {
      baseline = run(baseRoot, stdin, env);
    } finally {
      cleanup(baseRoot);
    }
    assert.equal(baseline.status, 0, name);
    if (outcome === 'advisory') assert.match(baseline.stderr, /Verify-on-Stop advisory/, name);
    else assert.equal(baseline.stderr, '', name);
    for (const [state, lib] of variants) {
      const root = project(state, stub, lib);
      try {
        const out = run(root, stdin, env);
        for (const field of ['stdout', 'stderr', 'status']) {
          if (out[field] !== baseline[field]) {
            differences += 1;
            assert.fail(`${name} [${state}/${lib}] ${field}: ${JSON.stringify(out[field])} != ${JSON.stringify(baseline[field])}`);
          }
        }
        // The lib creates spans.jsonl when the location exists (stream-absent), so a working lib writes one span there too.
        const expected = lib === 'working' && (state === 'writable' || state === 'stream-absent') ? 1 : 0;
        assert.equal(spans(root).length, expected, `${name} [${state}/${lib}] span count`);
        if (state === 'location-absent') assert.equal(existsSync(join(root, '.harness/state/telemetry')), false);
      } finally {
        cleanup(root);
      }
    }
  }
  assert.equal(differences, 0);
});

test('TASK-006 REQ-002 fail-open proof: an unwritable stream and a passing check give stdout {}, exit 0, no stderr', () => {
  for (const stdin of [CLAUDE, CURSOR]) {
    const root = project('unwritable', 'pass');
    try {
      const out = run(root, stdin, {});
      assert.equal(out.stdout, '{}\n');
      assert.equal(out.stderr, '');
      assert.equal(out.status, 0);
      assert.equal(spans(root).length, 0);
    } finally {
      cleanup(root);
    }
  }
});

test('TASK-006 REQ-009 ordering: the payload is written before the telemetry lib is loaded, on every exit path', () => {
  for (const [name, stub, stdin, env] of SCENARIOS) {
    const root = project('writable', stub, 'marker');
    try {
      const out = run(root, stdin, env);
      const lines = out.stdout.split('\n');
      assert.ok(JSON.parse(lines[0]), `${name}: payload first`);
      assert.equal(lines[1], 'LIB-LOADED', `${name}: lib loaded after the payload`);
      assert.equal(out.status, 0, name);
    } finally {
      cleanup(root);
    }
  }
});
