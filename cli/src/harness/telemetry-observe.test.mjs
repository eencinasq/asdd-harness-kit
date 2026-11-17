/**
 * telemetry-emitters TASK-010 — `telemetry-observe.mjs` handler: Claude activation records, fail-open answer.
 * REQ-013, REQ-015, REQ-016, REQ-018, REQ-004, REQ-005, REQ-006; design §12.3, ADR-002/003/004.
 * Every case runs in a temp root, never against the repo's .harness/state/ (the kit repo has live slices and a hook
 * stream). The script is invoked as a file (`asdd observe` is registered by TASK-014).
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs, {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { mock, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { STREAM_FILE, TELEMETRY_DIR, validateSpan } from './telemetry-lib.mjs';
import { CURSOR_ALLOW, PAYLOAD_KEYS, handleObserve } from './telemetry-observe.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, 'telemetry-observe.mjs');
const FIXTURE_DIR = join(HERE, '../../test/fixtures/telemetry/claude');
const SCHEMA = JSON.parse(readFileSync(join(HERE, '../../../.harness/state/telemetry/telemetry.schema.json'), 'utf8'));
const IS_ROOT = typeof process.getuid === 'function' && process.getuid() === 0;
const FIXTURES = readdirSync(FIXTURE_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.slice(0, -5))
  .sort();

/** Expected target per fixture when the stream is writable and `codegraph`/`asdd-status` are installed. */
const EXPECTED = {
  'posttooluse-read-steering': { tool: 'Read', target: '.harness/steering/controls.md' },
  'posttooluse-read-offset-limit': { tool: 'Read', target: '.harness/steering/skills.md' },
  'posttooluse-read-subagent': { tool: 'Read', target: '.harness/steering/manifest.md', agent: 'a0000000000000009' },
  'posttooluse-read-claude-skills': { tool: 'Read', target: '.agents/skills/asdd-status/SKILL.md' },
  'posttooluse-skill-installed': { tool: 'Skill', target: '.agents/skills/codegraph/SKILL.md' },
  'posttooluse-read-nonguidance': null,
  'posttooluse-skill-namespaced': null,
};

/** Temp repo root (realpath, so it equals a child's process.cwd()) with the two fixture skills installed. */
function tempRoot({ telemetry = true } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'asdd-observe-')));
  for (const name of ['codegraph', 'asdd-status']) {
    mkdirSync(join(root, '.agents/skills', name), { recursive: true });
    writeFileSync(join(root, '.agents/skills', name, 'SKILL.md'), `# ${name}\n`);
  }
  if (telemetry) mkdirSync(join(root, TELEMETRY_DIR), { recursive: true });
  return root;
}

function withRoot(opts, fn) {
  const root = tempRoot(opts);
  try {
    return fn(root);
  } finally {
    try {
      chmodSync(join(root, TELEMETRY_DIR), 0o755);
    } catch {
      /* state without the directory */
    }
    rmSync(root, { recursive: true, force: true });
  }
}

function fixtureText(name, root) {
  return readFileSync(join(FIXTURE_DIR, `${name}.json`), 'utf8').replaceAll('${REPO}', root);
}

function fixturePayload(name, root) {
  return JSON.parse(fixtureText(name, root)).payload;
}

function rawPayload(name, root) {
  return JSON.stringify(fixturePayload(name, root));
}

function streamPath(root) {
  return join(root, TELEMETRY_DIR, STREAM_FILE);
}

function streamLines(root) {
  const file = streamPath(root);
  if (!existsSync(file) || !statSync(file).isFile()) return [];
  return readFileSync(file, 'utf8').split('\n').filter(Boolean);
}

/** Child env without the attribution / trace variables of the session running the tests. */
function cleanEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('HARNESS_')) delete env[key];
  return env;
}

function runScript(args, input, root) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd: root, input, env: cleanEnv(), encoding: 'utf8' });
}

/** Four telemetry states of REQ-018. */
const STATES = {
  writable: () => {},
  'dir-missing': (root) => rmSync(join(root, TELEMETRY_DIR), { recursive: true, force: true }),
  'stream-is-directory': (root) => mkdirSync(streamPath(root), { recursive: true }),
  'dir-read-only': (root) => chmodSync(join(root, TELEMETRY_DIR), 0o555),
};

function nearestRank(samples, p) {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

function getPath(obj, path) {
  let cur = obj;
  for (const key of path.split('.')) {
    if (!cur || typeof cur !== 'object' || !Object.hasOwn(cur, key)) return undefined;
    cur = cur[key];
  }
  return cur;
}

// --- ADR-004: PAYLOAD_KEYS only names key paths present in committed fixtures ---

test('ADR-004 PAYLOAD_KEYS: every Claude key path occurs in at least one committed fixture', () => {
  assert.ok(PAYLOAD_KEYS && typeof PAYLOAD_KEYS === 'object');
  assert.deepEqual(Object.keys(PAYLOAD_KEYS), ['claude'], 'Cursor keys arrive with TASK-012 (D-3)');
  const payloads = FIXTURES.map((n) => fixturePayload(n, '/repo'));
  const paths = Object.values(PAYLOAD_KEYS.claude);
  assert.ok(paths.length > 0);
  for (const path of paths) {
    assert.ok(payloads.some((p) => getPath(p, path) !== undefined), `${path} occurs in no fixture`);
  }
});

test('ADR-004 PAYLOAD_KEYS never names a forbidden key (REQ-004)', () => {
  const forbidden = ['transcript_path', 'cwd', 'tool_response', 'tool_use_id', 'permission_mode', 'scratchpad_dir'];
  for (const path of Object.values(PAYLOAD_KEYS.claude)) {
    for (const key of forbidden) assert.ok(!path.split('.').includes(key), path);
  }
  const source = readFileSync(SCRIPT, 'utf8');
  for (const key of forbidden.filter((k) => k !== 'cwd')) assert.ok(!source.includes(key), `${key} in source`);
});

test('REQ-018 fixtures carry provenance (runtime, version, capture date, live-capture)', () => {
  assert.ok(FIXTURES.length >= 7);
  for (const name of FIXTURES) {
    const { provenance } = JSON.parse(fixtureText(name, '/repo'));
    for (const key of ['runtime', 'runtime_version', 'captured_at', 'captured_by', 'method']) {
      assert.ok(provenance && provenance[key], `${name} ${key}`);
    }
    assert.ok(name in EXPECTED, `${name} has no expectation`);
  }
});

// --- REQ-013 / REQ-018: every Claude fixture x 4 telemetry states, through the script file ---

for (const [state, prepare] of Object.entries(STATES)) {
  test(`REQ-018 every Claude fixture exits 0 with no output under telemetry state ${state}`, (t) => {
    if (state === 'dir-read-only' && IS_ROOT) {
      t.skip('root ignores directory permissions');
      return;
    }
    for (const name of FIXTURES) {
      withRoot({}, (root) => {
        prepare(root);
        const res = runScript(['claude'], rawPayload(name, root), root);
        assert.equal(res.status, 0, `${name}: ${res.stderr}`);
        assert.equal(res.stdout, '', name);
        assert.equal(res.stderr, '', name);
        const lines = streamLines(root);
        const want = state === 'writable' && EXPECTED[name] ? 1 : 0;
        assert.equal(lines.length, want, `${name} under ${state}`);
        if (state === 'dir-missing') assert.equal(existsSync(join(root, TELEMETRY_DIR)), false);
      });
    }
  });
}

test('REQ-013 one record per guidance fixture with the REQ-013 fields; schema-valid', () => {
  for (const [name, want] of Object.entries(EXPECTED)) {
    withRoot({}, (root) => {
      const res = runScript(['claude'], rawPayload(name, root), root);
      assert.equal(res.status, 0);
      const lines = streamLines(root);
      if (!want) {
        assert.equal(lines.length, 0, name);
        return;
      }
      assert.equal(lines.length, 1, name);
      const span = JSON.parse(lines[0]);
      assert.deepEqual(validateSpan(span, SCHEMA), [], name);
      assert.equal(span.kind, 'tool');
      assert.equal(span.writer, 'runtime-hook');
      assert.equal(span.process_name, 'asdd-observe');
      assert.equal(span.runtime, 'claude');
      assert.equal(span.parent_span_id, null);
      assert.equal(span.status, 'OK');
      assert.equal(span.slice_id, null, 'temp root has no registry: unattributed');
      assert.equal(span.phase, null);
      const expectAttrs = {
        trace_source: 'self',
        tool_name: want.tool,
        target_path: want.target,
        runtime_session_id: '00000000-0000-4000-8000-000000000001',
      };
      if (want.agent) expectAttrs.agent_id = want.agent;
      assert.deepEqual(span.attributes, expectAttrs, name);
    });
  }
});

test('REQ-004 transcript_path, cwd, tool_response and other unread values never appear in the line', () => {
  for (const [name, want] of Object.entries(EXPECTED)) {
    if (!want) continue;
    withRoot({}, (root) => {
      const payload = fixturePayload(name, root);
      runScript(['claude'], JSON.stringify(payload), root);
      const [line] = streamLines(root);
      assert.ok(line, name);
      const leaks = [
        payload.transcript_path,
        payload.cwd,
        payload.scratchpad_dir,
        payload.prompt_id,
        payload.tool_use_id,
        JSON.stringify(payload.tool_response),
        'commandName',
        'permission',
        'effort',
        'agent_type',
      ];
      if (payload.tool_response?.file) {
        leaks.push(payload.tool_response.file.content, payload.tool_response.file.filePath);
      }
      for (const value of leaks) {
        assert.equal(typeof value, 'string', `${name}: leak probe must be a string`);
        assert.ok(!line.includes(value), `${name}: ${value} leaked`);
      }
    });
  }
});

test('REQ-013 Skill not installed and namespaced Skill emit no record', () => {
  withRoot({}, (root) => {
    rmSync(join(root, '.agents/skills/codegraph'), { recursive: true, force: true });
    for (const name of ['posttooluse-skill-installed', 'posttooluse-skill-namespaced']) {
      const out = handleObserve(rawPayload(name, root), 'claude', { root, env: {} });
      assert.equal(out.answer, '');
      assert.equal(out.span, null, name);
    }
    assert.deepEqual(streamLines(root), []);
  });
});

// --- REQ-016: absent fields are omitted, never guessed ---

test('REQ-016 no session_id -> runtime_session_id attribute absent', () => {
  withRoot({}, (root) => {
    const payload = fixturePayload('posttooluse-read-steering', root);
    delete payload.session_id;
    const out = handleObserve(JSON.stringify(payload), 'claude', { root, env: {} });
    assert.ok(out.span);
    assert.equal(Object.hasOwn(out.span.attributes, 'runtime_session_id'), false);
    assert.equal(Object.hasOwn(out.span.attributes, 'agent_id'), false);
    const [line] = streamLines(root);
    assert.equal(Object.hasOwn(JSON.parse(line).attributes, 'runtime_session_id'), false);
  });
});

test('REQ-016 malformed session or agent ids are omitted, never coerced', () => {
  withRoot({}, (root) => {
    for (const bad of ['', 'has space', 'x'.repeat(129), 42, null, { id: 'a' }, 'a/b']) {
      const payload = fixturePayload('posttooluse-read-subagent', root);
      payload.agent_id = bad;
      payload.session_id = bad;
      const out = handleObserve(JSON.stringify(payload), 'claude', { root, env: {} });
      assert.ok(out.span, JSON.stringify(bad));
      assert.equal(Object.hasOwn(out.span.attributes, 'agent_id'), false, JSON.stringify(bad));
      assert.equal(Object.hasOwn(out.span.attributes, 'runtime_session_id'), false, JSON.stringify(bad));
    }
    const payload = fixturePayload('posttooluse-read-subagent', root);
    payload.agent_id = 'a'.repeat(128);
    const out = handleObserve(JSON.stringify(payload), 'claude', { root, env: {} });
    assert.equal(out.span.attributes.agent_id, 'a'.repeat(128));
  });
});

test('REQ-016 no file_path (Read) or no skill (Skill) -> no record, answer, no throw', () => {
  withRoot({}, (root) => {
    const read = fixturePayload('posttooluse-read-steering', root);
    delete read.tool_input.file_path;
    const skill = fixturePayload('posttooluse-skill-installed', root);
    delete skill.tool_input.skill;
    const noInput = fixturePayload('posttooluse-read-steering', root);
    delete noInput.tool_input;
    for (const payload of [read, skill, noInput]) {
      const out = handleObserve(JSON.stringify(payload), 'claude', { root, env: {} });
      assert.deepEqual(out, { answer: '', span: null });
    }
    assert.deepEqual(streamLines(root), []);
  });
});

test('ADR-004 no multi-key fallbacks: a path under another key name gives no record', () => {
  withRoot({}, (root) => {
    const payload = fixturePayload('posttooluse-read-steering', root);
    payload.tool_input = { path: payload.tool_input.file_path };
    payload.file_path = payload.tool_input.path;
    assert.equal(handleObserve(JSON.stringify(payload), 'claude', { root, env: {} }).span, null);
  });
});

test('REQ-017 attribution: one in_progress slice -> slice_id and phase from its manifest', () => {
  withRoot({}, (root) => {
    mkdirSync(join(root, '.harness/state/slices/live'), { recursive: true });
    writeFileSync(
      join(root, '.harness/state/registry.json'),
      JSON.stringify({ slices: [{ slice_id: 'live', status: 'in_progress' }] })
    );
    writeFileSync(join(root, '.harness/state/slices/live/manifest.json'), JSON.stringify({ phase: 'design' }));
    const out = handleObserve(rawPayload('posttooluse-read-steering', root), 'claude', { root, env: {} });
    assert.equal(out.span.slice_id, 'live');
    assert.equal(out.span.phase, 'design');
  });
});

test('REQ-005 trace is self-minted: HARNESS_TRACE_ID in env is ignored', () => {
  withRoot({}, (root) => {
    const env = { HARNESS_TRACE_ID: 'a'.repeat(32), HARNESS_SPAN_ID: 'b'.repeat(16) };
    const out = handleObserve(rawPayload('posttooluse-read-steering', root), 'claude', { root, env });
    assert.notEqual(out.span.trace_id, 'a'.repeat(32));
    assert.equal(out.span.parent_span_id, null);
    assert.equal(out.span.attributes.trace_source, 'self');
  });
});

// --- REQ-016 / REQ-018: unrecognized input answers, emits nothing, exits 0 ---

test('REQ-016 empty stdin, invalid JSON, unknown event and other tools -> no span, exit 0, no output', () => {
  withRoot({}, (root) => {
    const other = fixturePayload('posttooluse-read-steering', root);
    const inputs = [
      '',
      '{not json',
      'null',
      '[]',
      '"PostToolUse"',
      JSON.stringify({ ...other, hook_event_name: 'PreToolUse' }),
      JSON.stringify({ ...other, hook_event_name: 'beforeReadFile' }),
      JSON.stringify({ ...other, tool_name: 'Grep' }),
      JSON.stringify({ ...other, tool_name: 'Bash', tool_input: { command: 'cat .harness/steering/controls.md' } }),
    ];
    for (const input of inputs) {
      const res = runScript(['claude'], input, root);
      assert.equal(res.status, 0, input);
      assert.equal(res.stdout, '', input);
      assert.equal(res.stderr, '', input);
      assert.deepEqual(handleObserve(input, 'claude', { root, env: {} }), { answer: '', span: null }, input);
    }
    assert.deepEqual(streamLines(root), []);
  });
});

test('§12.3 missing or unknown argv -> no answer, no span, exit 0', () => {
  withRoot({}, (root) => {
    const input = rawPayload('posttooluse-read-steering', root);
    for (const args of [[], ['devin'], ['Claude'], ['claude-code']]) {
      const res = runScript(args, input, root);
      assert.equal(res.status, 0, args.join(' '));
      assert.equal(res.stdout, '', args.join(' '));
      assert.equal(res.stderr, '', args.join(' '));
    }
    for (const runtime of [undefined, '', 'devin', 42]) {
      assert.deepEqual(handleObserve(input, runtime, { root, env: {} }), { answer: '', span: null });
    }
    assert.deepEqual(streamLines(root), []);
  });
});

test('TASK-010 cursor argv: hookless default answers allow and emits no span', () => {
  withRoot({}, (root) => {
    assert.equal(CURSOR_ALLOW, '{"permission":"allow"}\n');
    for (const input of [rawPayload('posttooluse-read-steering', root), '', '{bad', JSON.stringify({ file_path: 'x' })]) {
      const res = runScript(['cursor'], input, root);
      assert.equal(res.status, 0);
      assert.equal(res.stdout, CURSOR_ALLOW);
      assert.equal(res.stderr, '');
      assert.deepEqual(handleObserve(input, 'cursor', { root, env: {} }), { answer: CURSOR_ALLOW, span: null });
    }
    assert.deepEqual(streamLines(root), []);
  });
});

test('REQ-018 a throwing library step still reaches the answer (in-process, no throw)', () => {
  withRoot({}, (root) => {
    const boom = () => {
      throw new Error('boom');
    };
    const steps = ['guidanceTarget', 'skillTarget', 'attribute', 'startTrace', 'buildSpan', 'emit'];
    for (const step of steps) {
      for (const name of ['posttooluse-read-steering', 'posttooluse-skill-installed']) {
        const out = handleObserve(rawPayload(name, root), 'claude', { root, env: {}, lib: { [step]: boom } });
        assert.equal(out.answer, '', `${step} ${name}`);
        // A throwing step on the payload's path leaves no record; a step off the path (the other tool) is unused.
        const offPath = name.includes('skill') ? step === 'guidanceTarget' : step === 'skillTarget';
        assert.equal(out.span === null, !offPath, `${step} ${name}`);
      }
      const cursor = handleObserve('{}', 'cursor', { root, env: {}, lib: { [step]: boom } });
      assert.equal(cursor.answer, CURSOR_ALLOW);
    }
    const allBoom = Object.fromEntries(steps.map((s) => [s, boom]));
    const out = handleObserve(rawPayload('posttooluse-read-steering', root), 'claude', { root, env: {}, lib: allBoom });
    assert.deepEqual(out, { answer: '', span: null });
    const env = new Proxy({}, { get: boom, has: boom, ownKeys: boom });
    const before = streamLines(root).length;
    assert.deepEqual(handleObserve(rawPayload('posttooluse-read-steering', root), 'claude', { root, env }), {
      answer: '',
      span: null,
    });
    assert.equal(streamLines(root).length, before);
  });
});

test('REQ-018 the handler touches neither stdout, stderr nor process.exitCode', () => {
  withRoot({}, (root) => {
    const out = mock.method(process.stdout, 'write', () => true);
    const err = mock.method(process.stderr, 'write', () => true);
    const before = process.exitCode;
    try {
      for (const name of FIXTURES) handleObserve(rawPayload(name, root), 'claude', { root, env: {} });
      handleObserve('{bad', 'claude', { root, env: {} });
      handleObserve('{}', 'cursor', { root, env: {} });
      assert.equal(out.mock.callCount(), 0);
      assert.equal(err.mock.callCount(), 0);
      assert.equal(process.exitCode, before);
    } finally {
      out.mock.restore();
      err.mock.restore();
    }
  });
});

test('§12.3 the non-guidance Read early exit runs before any filesystem call', () => {
  withRoot({}, (root) => {
    const raw = rawPayload('posttooluse-read-nonguidance', root);
    const names = ['readFileSync', 'statSync', 'existsSync', 'openSync', 'writeSync', 'readSync', 'lstatSync', 'realpathSync'];
    const spies = names.map((n) => mock.method(fs, n));
    try {
      assert.deepEqual(handleObserve(raw, 'claude', { root, env: {} }), { answer: '', span: null });
      for (const spy of spies) assert.equal(spy.mock.callCount(), 0);
    } finally {
      for (const spy of spies) spy.mock.restore();
    }
  });
});

test('REQ-006 observe writes only spans.jsonl (hash of .harness and .agents otherwise unchanged)', () => {
  withRoot({}, (root) => {
    mkdirSync(join(root, '.harness/state/slices/live'), { recursive: true });
    writeFileSync(join(root, '.harness/state/registry.json'), JSON.stringify({ slices: [] }));
    const hash = () => {
      const h = createHash('sha256');
      const walk = (dir) => {
        for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
          const p = join(dir, e.name);
          if (p === streamPath(root)) continue;
          h.update(p);
          if (e.isDirectory()) walk(p);
          else h.update(readFileSync(p));
        }
      };
      walk(root);
      return h.digest('hex');
    };
    const before = hash();
    for (const name of FIXTURES) handleObserve(rawPayload(name, root), 'claude', { root, env: {} });
    assert.equal(hash(), before);
    assert.equal(streamLines(root).length, Object.values(EXPECTED).filter(Boolean).length);
  });
});

test('REQ-004 no network: no network module or fetch in the handler source', () => {
  const source = readFileSync(SCRIPT, 'utf8');
  for (const needle of ['node:http', 'node:https', 'node:net', 'node:dgram', 'node:tls', 'fetch(']) {
    assert.equal(source.includes(needle), false, needle);
  }
});

// --- REQ-018: latency (p99 <= 50 ms per class, >= 200 samples) and whole-process wall time (printed) ---

const SAMPLES = 200;
const P99_BUDGET_MS = 50;

test('REQ-018 latency: in-process handler p99 <= 50 ms for the four classes', (t) => {
  withRoot({}, (root) => {
    const classes = {
      // Guidance classes run against a writable stream (REQ-018).
      'claude-read-guidance': { raw: rawPayload('posttooluse-read-steering', root), runtime: 'claude', record: true },
      'claude-read-nonguidance': { raw: rawPayload('posttooluse-read-nonguidance', root), runtime: 'claude' },
      'claude-skill': { raw: rawPayload('posttooluse-skill-installed', root), runtime: 'claude', record: true },
      'cursor-default': { raw: rawPayload('posttooluse-read-steering', root), runtime: 'cursor' },
    };
    const results = {};
    for (const [cls, { raw, runtime, record }] of Object.entries(classes)) {
      const before = streamLines(root).length;
      const samples = [];
      for (let i = 0; i < SAMPLES + 10; i += 1) {
        const start = performance.now();
        handleObserve(raw, runtime, { root, env: {} });
        const ms = performance.now() - start;
        if (i >= 10) samples.push(ms); // first 10 are warm-up
      }
      assert.equal(samples.length, SAMPLES);
      assert.equal(streamLines(root).length - before, record ? SAMPLES + 10 : 0, cls);
      results[cls] = { p50: nearestRank(samples, 50), p99: nearestRank(samples, 99), max: Math.max(...samples) };
      t.diagnostic(
        `latency ${cls}: n=${SAMPLES} p50=${results[cls].p50.toFixed(3)}ms p99=${results[cls].p99.toFixed(3)}ms max=${results[cls].max.toFixed(3)}ms`
      );
    }
    for (const [cls, r] of Object.entries(results)) {
      assert.ok(r.p99 <= P99_BUDGET_MS, `${cls} p99 ${r.p99.toFixed(3)} ms > ${P99_BUDGET_MS} ms`);
    }
  });
});

test('REQ-018 whole-process wall time of `telemetry-observe.mjs claude` (20 runs, printed, not gated)', (t) => {
  withRoot({}, (root) => {
    const input = rawPayload('posttooluse-read-steering', root);
    const samples = [];
    for (let i = 0; i < 20; i += 1) {
      const start = performance.now();
      const res = runScript(['claude'], input, root);
      samples.push(performance.now() - start);
      assert.equal(res.status, 0);
    }
    assert.equal(streamLines(root).length, 20);
    t.diagnostic(
      `wall time claude: n=20 p50=${nearestRank(samples, 50).toFixed(1)}ms p95=${nearestRank(samples, 95).toFixed(1)}ms max=${Math.max(...samples).toFixed(1)}ms (not gated)`
    );
  });
});


// --- TASK-012 (D-3 = hookless): Cursor answers allow and records nothing (REQ-014, REQ-016, REQ-018, REQ-004) ---
// D-3 was decided hookless (cli/test/fixtures/telemetry/cursor/README.md): no Cursor payload fixture exists, so the
// handler reads no Cursor key. The inputs below are test probes only, shaped after design §12.1 (Cursor row); they are
// not fixtures and never justify a PAYLOAD_KEYS entry (ADR-004).

const CURSOR_FIXTURE_DIR = join(HERE, '../../test/fixtures/telemetry/cursor');

/** Cursor-shaped probes plus every Claude fixture, malformed and empty inputs. */
function cursorInputs(root) {
  const probe = (filePath) =>
    JSON.stringify({
      hook_event_name: 'beforeReadFile',
      file_path: filePath,
      conversation_id: 'conv-1',
      content: 'SECRET-CONTENT',
      attachments: [{ file_path: join(root, '.harness/steering/core.md') }],
      user_email: 'someone@example.com',
      workspace_roots: [root],
    });
  return {
    'cursor-probe-steering': probe(join(root, '.harness/steering/controls.md')),
    'cursor-probe-cursor-skill': probe(join(root, '.cursor/skills/codegraph/SKILL.md')),
    'cursor-probe-nonguidance': probe(join(root, 'src/index.js')),
    ...Object.fromEntries(FIXTURES.map((n) => [`claude-fixture-${n}`, rawPayload(n, root)])),
    'invalid-json': '{bad',
    empty: '',
    'empty-object': '{}',
    'json-null': 'null',
    'json-array': '[]',
  };
}

test('TASK-012 D-3 hookless: no Cursor fixture, README records hookless, PAYLOAD_KEYS has no cursor entry', () => {
  const readme = readFileSync(join(CURSOR_FIXTURE_DIR, 'README.md'), 'utf8');
  assert.match(readme, /\*\*hookless\*\*/, 'D-3 outcome read from the README, not decided here');
  assert.deepEqual(readdirSync(CURSOR_FIXTURE_DIR).filter((f) => f.endsWith('.json')), [], 'hookless: no payload fixture');
  assert.equal(Object.hasOwn(PAYLOAD_KEYS, 'cursor'), false);
  const source = readFileSync(SCRIPT, 'utf8');
  for (const key of ['beforeReadFile', 'conversation_id', 'attachments', 'user_email', 'workspace_roots', 'generation_id', 'cursor_version']) {
    assert.equal(source.includes(key), false, `${key} in handler source`);
  }
});

for (const [state, prepare] of Object.entries(STATES)) {
  test(`TASK-012 hookless: every input to \`observe cursor\` answers allow, exit 0, zero lines under ${state}`, (t) => {
    if (state === 'dir-read-only' && IS_ROOT) {
      t.skip('root ignores directory permissions');
      return;
    }
    withRoot({}, (root) => {
      prepare(root);
      for (const [name, input] of Object.entries(cursorInputs(root))) {
        const res = runScript(['cursor'], input, root);
        assert.equal(res.status, 0, `${name}: ${res.stderr}`);
        assert.equal(res.stdout, CURSOR_ALLOW, name);
        assert.equal(res.stderr, '', name);
        assert.deepEqual(handleObserve(input, 'cursor', { root, env: {} }), { answer: CURSOR_ALLOW, span: null }, name);
        assert.deepEqual(streamLines(root), [], `${name} under ${state}`);
      }
      if (state === 'dir-missing') assert.equal(existsSync(join(root, TELEMETRY_DIR)), false);
    });
  });
}

test('TASK-012 hookless: `observe cursor` with no stdin at all answers allow, exit 0, no line', () => {
  withRoot({}, (root) => {
    const res = spawnSync(process.execPath, [SCRIPT, 'cursor'], { cwd: root, env: cleanEnv(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    assert.equal(res.status, 0);
    assert.equal(res.stdout, CURSOR_ALLOW);
    assert.equal(res.stderr, '');
    assert.deepEqual(streamLines(root), []);
  });
});

test('TASK-012 hookless: cursor calls no library step and no filesystem function (REQ-018 fail-open)', () => {
  withRoot({}, (root) => {
    const steps = ['guidanceTarget', 'skillTarget', 'attribute', 'startTrace', 'buildSpan', 'emit'];
    const calls = [];
    const lib = Object.fromEntries(
      steps.map((s) => [
        s,
        () => {
          calls.push(s);
          throw new Error('boom');
        },
      ])
    );
    const inputs = cursorInputs(root);
    const names = ['readFileSync', 'statSync', 'existsSync', 'openSync', 'writeSync', 'readSync', 'lstatSync', 'realpathSync', 'appendFileSync', 'mkdirSync'];
    const spies = names.map((n) => mock.method(fs, n));
    try {
      for (const [name, input] of Object.entries(inputs)) {
        assert.deepEqual(handleObserve(input, 'cursor', { root, env: {}, lib }), { answer: CURSOR_ALLOW, span: null }, name);
      }
      for (const spy of spies) assert.equal(spy.mock.callCount(), 0);
    } finally {
      for (const spy of spies) spy.mock.restore();
    }
    assert.deepEqual(calls, []);
    assert.deepEqual(streamLines(root), []);
  });
});

test('TASK-012 latency (TRC-006): Cursor guidance and Cursor non-guidance p99 <= 50 ms, >= 200 samples, no line', (t) => {
  withRoot({}, (root) => {
    const inputs = cursorInputs(root);
    const classes = { 'cursor-guidance': inputs['cursor-probe-steering'], 'cursor-nonguidance': inputs['cursor-probe-nonguidance'] };
    for (const [cls, raw] of Object.entries(classes)) {
      const samples = [];
      for (let i = 0; i < SAMPLES + 10; i += 1) {
        const start = performance.now();
        const out = handleObserve(raw, 'cursor', { root, env: {} });
        const ms = performance.now() - start;
        assert.equal(out.answer, CURSOR_ALLOW);
        if (i >= 10) samples.push(ms); // first 10 are warm-up
      }
      assert.ok(samples.length >= 200);
      const p99 = nearestRank(samples, 99);
      t.diagnostic(`latency ${cls}: n=${samples.length} p50=${nearestRank(samples, 50).toFixed(3)}ms p99=${p99.toFixed(3)}ms`);
      assert.ok(p99 <= P99_BUDGET_MS, `${cls} p99 ${p99.toFixed(3)} ms > ${P99_BUDGET_MS} ms`);
    }
    assert.deepEqual(streamLines(root), []);
  });
});
