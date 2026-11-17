/**
 * telemetry-emitters TASK-013 — `asdd profile` (harness-profile.mjs): modes, rendering, exit codes, read-only.
 * REQ-020, REQ-021, REQ-022, REQ-023, REQ-004. Every case runs the script file in a temp project (never against the
 * repo's .harness/state/); `asdd profile` is registered in commands.mjs by TASK-014.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ACTIVATION_LEGEND, TAIL_MAX_BYTES, TAIL_MAX_LINES } from './telemetry-lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, 'harness-profile.mjs');
const FOOTER = 'Test thrash (H-BOOT, H-LOOP inputs) is not measured; H-* findings are not reported in this version.';
const CLAUDE_OBSERVE = 'node cli/bin/asdd.mjs observe claude >/dev/null 2>&1; exit 0';
const CURSOR_OBSERVE = `node cli/bin/asdd.mjs observe cursor >/dev/null 2>&1; echo '{"permission":"allow"}'; exit 0`;

const dirs = [];
after(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function write(root, rel, text) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
}

let spanSeq = 0;
function span(fields) {
  spanSeq += 1;
  return {
    schema_version: '1.0',
    trace_id: `t${String(spanSeq).padStart(31, '0')}`,
    span_id: `s${String(spanSeq).padStart(15, '0')}`,
    parent_span_id: null,
    kind: 'command',
    slice_id: 'alpha',
    phase: 'implementation',
    process_name: 'command-gate',
    runtime: 'claude',
    start_time_iso: '2026-11-17T10:00:00.000Z',
    end_time_iso: '2026-11-17T10:00:00.010Z',
    duration_ms: 10,
    status: 'OK',
    attributes: { trace_source: 'self' },
    writer: 'command-gate',
    ...fields,
  };
}

function session(sliceId, n, eventType, phase, timestamp) {
  return { schema_version: '1.0', slice_id: sliceId, session_id: `s-${n}`, event_type: eventType, phase, timestamp };
}

/** alpha: design 1h, task_planning 2h, implementation open. */
const ALPHA_SESSIONS = [
  session('alpha', 1, 'phase_started', 'design', '2026-11-17T00:00:00.000Z'),
  session('alpha', 2, 'phase_completed', 'design', '2026-11-17T01:00:00.000Z'),
  session('alpha', 3, 'phase_completed', 'task_planning', '2026-11-17T03:00:00.000Z'),
  session('alpha', 4, 'phase_started', 'implementation', '2026-11-17T03:00:00.000Z'),
];

const STEERING = {
  'core.md': '---\ninclusion: always\n---\n# core\n',
  'impl.md': '---\ninclusion: auto\ntags:\n  - implementation\n---\n# impl\n',
  'design-only.md': '---\ninclusion: auto\ntags:\n  - design\n---\n# design\n',
  'manual.md': '---\ninclusion: manual\n---\n# manual\n',
  'skills.md': '# skills catalog\n',
};

/**
 * A temp project: sessions per slice, the stream (array of objects or raw lines), steering, one installed skill,
 * project.json runtimes (omitted when `runtimes` is null), and hook configs (observe entries when `hooks` says so).
 */
function project({
  sessions = { alpha: ALPHA_SESSIONS },
  spans = [],
  rawStream = null,
  runtimes = ['claude', 'cursor', 'devin'],
  hooks = { claude: true, cursor: false },
  claudeMd = true,
  cursorRule = true,
} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'asdd-profile-'));
  dirs.push(root);
  for (const [id, list] of Object.entries(sessions)) {
    list.forEach((s, i) => write(root, `.harness/state/slices/${id}/sessions/${String(i + 1).padStart(3, '0')}-x.json`, JSON.stringify(s)));
  }
  if (rawStream !== null) write(root, '.harness/state/telemetry/spans.jsonl', rawStream);
  else if (spans.length > 0) write(root, '.harness/state/telemetry/spans.jsonl', `${spans.map((s) => JSON.stringify(s)).join('\n')}\n`);
  for (const [name, text] of Object.entries(STEERING)) write(root, `.harness/steering/${name}`, text);
  write(root, '.agents/skills/tdd/SKILL.md', '---\nname: tdd\n---\n# tdd\n');
  if (runtimes !== null) write(root, '.harness/config/project.json', JSON.stringify({ runtimes }));
  const claudeHooks = { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node cli/bin/asdd.mjs gate' }] }] };
  if (hooks.claude) claudeHooks.PostToolUse = [{ matcher: 'Read|Skill', hooks: [{ type: 'command', command: CLAUDE_OBSERVE, timeout: 10 }] }];
  write(root, '.claude/settings.json', JSON.stringify({ hooks: claudeHooks }));
  const cursorHooks = { beforeShellExecution: [{ command: 'node cli/bin/asdd.mjs gate', timeout: 30, failClosed: true }] };
  if (hooks.cursor) cursorHooks.beforeReadFile = [{ command: CURSOR_OBSERVE, timeout: 10 }];
  write(root, '.cursor/hooks.json', JSON.stringify({ version: 1, hooks: cursorHooks }));
  if (claudeMd) write(root, 'CLAUDE.md', '# project\n');
  if (cursorRule) {
    write(root, '.cursor/rules/always.mdc', '---\ndescription: x\nalwaysApply: true\n---\n# a\n');
    write(root, '.cursor/rules/sometimes.mdc', '---\ndescription: y\nalwaysApply: false\n---\n# b\n');
  }
  return root;
}

function treeHash(root) {
  const h = createHash('sha256');
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) {
        h.update(`d:${p}\n`);
        walk(p);
      } else {
        h.update(`f:${p}:${st.size}\n`);
        h.update(readFileSync(p));
      }
    }
  };
  walk(root);
  return h.digest('hex');
}

/** Runs the script in root; asserts the whole working tree hash is the same before and after (REQ-022). */
function run(root, args, { nodeArgs = [] } = {}) {
  const before = treeHash(root);
  const r = spawnSync(process.execPath, [...nodeArgs, SCRIPT, ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, HARNESS_SLICE_ID: '' } });
  assert.equal(treeHash(root), before, `working tree changed by profile ${args.join(' ')}`);
  for (const out of [r.stdout, r.stderr]) assert.equal((out.match(/not loaded/g) || []).length, 0, 'never prints "not loaded"');
  return r;
}

function activation(target, runtime, extra = {}) {
  return span({
    kind: 'tool',
    process_name: 'asdd-observe',
    writer: 'runtime-hook',
    runtime,
    attributes: { trace_source: 'self', target_path: target, ...extra },
  });
}

// --- REQ-023: modes and exit codes ---

test('REQ-023: no mode, unknown option, or --slice without an id -> usage on stderr, exit 2', () => {
  const root = project();
  for (const args of [[], ['--nope'], ['--slice'], ['--slice', '--json'], ['--slice', '../x'], ['--json', 'extra']]) {
    const r = run(root, args);
    assert.equal(r.status, 2, `args ${JSON.stringify(args)}`);
    assert.match(r.stderr, /usage: asdd profile/i);
    assert.equal(r.stdout, '');
  }
});

test('REQ-023: neither spans nor phase_started for the target -> exit 3, "no telemetry exists for <target>"', () => {
  const root = project({ spans: [span({ slice_id: 'other' })] });
  const r = run(root, ['--slice', 'ghost']);
  assert.equal(r.status, 3);
  assert.match(r.stderr, /no telemetry exists for ghost/);

  const empty = project({ sessions: {}, spans: [] });
  for (const args of [['--json'], ['--bottlenecks']]) {
    const e = run(empty, args);
    assert.equal(e.status, 3, args.join(' '));
    assert.match(e.stderr, /no telemetry exists for any slice/);
  }
  // A slice with only non-phase sessions and only unattributed spans still has no telemetry.
  const noPhase = project({ sessions: { beta: [session('beta', 1, 'feature_started', 'implementation', '2026-11-17T00:00:00Z')] }, spans: [span({ slice_id: null, phase: null })] });
  assert.equal(run(noPhase, ['--slice', 'beta']).status, 3);
});

test('REQ-023: sessions but no attributed spans -> phase table + "no attributed spans for <slice>" + unattributed count, exit 0', () => {
  for (const opts of [{ spans: [] }, { rawStream: '' }, { spans: [span({ slice_id: null, phase: null }), span({ slice_id: null, phase: null }), span({ slice_id: 'other' })] }]) {
    const root = project(opts);
    const r = run(root, ['--slice', 'alpha']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /design\s+completed/);
    assert.match(r.stdout, /task_planning\s+completed/);
    assert.match(r.stdout, /implementation\s+open/);
    const unattributed = (opts.spans || []).filter((s) => s.slice_id === null).length;
    assert.ok(r.stdout.includes(`no attributed spans for alpha (unattributed spans in the tail: ${unattributed})`), r.stdout);
    assert.ok(r.stdout.includes(FOOTER));
  }
});

// --- REQ-020: phase table, latencies, scores, AR-10, footer ---

test('REQ-020: phase windows, p50/p95 per kind vs a precomputed fixture, scores, footer', () => {
  const durations = [5, 1, 9, 3, 7, 2, 8, 4, 6, 10]; // p50 = 5, p95 = 10 (nearest rank)
  const spans = [
    ...durations.map((d) => span({ kind: 'command', duration_ms: d })),
    span({ kind: 'hook', process_name: 'verify-on-stop', writer: 'verify-on-stop', duration_ms: 400 }),
    span({ kind: 'hook', process_name: 'verify-on-stop', writer: 'verify-on-stop', duration_ms: 200 }),
    // sync = 2,700,000 ms of a 3 h (10,800,000 ms) denominator -> share 25% -> score 2
    span({ kind: 'sync', process_name: 'sync-state', writer: 'sync-state', duration_ms: 2_700_000 }),
    span({ slice_id: null, phase: null }),
  ];
  const root = project({ spans });
  const r = run(root, ['--slice', 'alpha']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /design\s+completed\s+2026-11-17T00:00:00\.000Z\s+2026-11-17T01:00:00\.000Z\s+1h 0m/);
  assert.match(r.stdout, /task_planning\s+completed\s+2026-11-17T01:00:00\.000Z\s+2026-11-17T03:00:00\.000Z\s+2h 0m/);
  assert.match(r.stdout, /command\s+n=10\s+p50=5 ms\s+p95=10 ms/);
  assert.match(r.stdout, /hook\s+n=2\s+p50=200 ms\s+p95=400 ms/);
  assert.match(r.stdout, /sync\s+n=1\s+p50=2700000 ms\s+p95=2700000 ms/);
  assert.match(r.stdout, /1\. sync\s+score 2\s+share 25\.0%/);
  assert.match(r.stdout, /unattributed spans in the tail: 1/);
  assert.ok(r.stdout.includes(FOOTER));

  const j = JSON.parse(run(root, ['--slice', 'alpha', '--json']).stdout);
  const [entry] = j.slices;
  assert.deepEqual(entry.latencies.command, { count: 10, p50: 5, p95: 10 });
  assert.deepEqual(entry.scores.map((s) => [s.surface, s.score]), [['sync', 2], ['command', 0], ['hook', 0]]);
  // Deterministic: a second run prints the same report.
  assert.equal(run(root, ['--slice', 'alpha']).stdout, r.stdout);
});

test('REQ-020: no completed phase -> share unknown', () => {
  const root = project({ sessions: { alpha: [session('alpha', 1, 'phase_started', 'implementation', '2026-11-17T00:00:00Z')] }, spans: [span({})] });
  const r = run(root, ['--slice', 'alpha']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /command\s+score 0\s+share unknown/);
});

test('REQ-020 AR-10: streams that differ only in trace_id / parent_span_id give the same report (apart from generated_at)', () => {
  const base = [span({ duration_ms: 3 }), span({ duration_ms: 7 }), activation('.harness/steering/core.md', 'claude')];
  const shuffled = base.map((s, i) => ({ ...s, trace_id: `f${String(i).padStart(31, '9')}`, parent_span_id: i ? `p${String(i).padStart(15, '1')}` : null }));
  const a = project({ spans: base });
  const b = project({ spans: shuffled });
  assert.equal(run(a, ['--slice', 'alpha']).stdout, run(b, ['--slice', 'alpha']).stdout);
  const strip = (out) => ({ ...JSON.parse(out), generated_at: 'x' });
  assert.deepEqual(strip(run(a, ['--json']).stdout), strip(run(b, ['--json']).stdout));
});

test('REQ-020 / REQ-004: the renderer never reads trace_id or parent_span_id and imports no network module', () => {
  const src = readFileSync(SCRIPT, 'utf8');
  assert.equal((src.match(/trace_id|parent_span_id/g) || []).length, 0);
  for (const token of ['node:http', 'node:https', 'node:net', 'node:dgram', 'node:tls', 'fetch(']) {
    assert.equal(src.includes(token), false, token);
  }
  assert.equal(/writeFileSync|appendFileSync|mkdirSync|openSync\([^)]*['"][wa]/.test(src), false, 'no write API');
});

test('REQ-004: a throwing globalThis.fetch changes nothing', () => {
  const root = project({ spans: [span({}), activation('.harness/steering/core.md', 'claude')] });
  const trap = ['--import', 'data:text/javascript,globalThis.fetch=()=>{throw new Error("network")}'];
  for (const args of [['--slice', 'alpha'], ['--bottlenecks']]) {
    const plain = run(root, args);
    const trapped = run(root, args, { nodeArgs: trap });
    assert.equal(trapped.status, plain.status);
    assert.equal(trapped.stdout, plain.stdout);
  }
});

test('REQ-020: --bottlenecks ranks slices by max score, then sum, then slice_id (in memory)', () => {
  const hour = 3_600_000;
  const twoPhase = (id) => [
    session(id, 1, 'phase_started', 'design', '2026-11-17T00:00:00.000Z'),
    session(id, 2, 'phase_completed', 'design', '2026-11-17T01:00:00.000Z'),
  ];
  const spans = [
    // alpha: hook 0.5h -> 5; command 0.1h -> 1 -> max 5 sum 6
    span({ slice_id: 'alpha', kind: 'hook', duration_ms: hour * 0.5 }),
    span({ slice_id: 'alpha', kind: 'command', duration_ms: hour * 0.1 }),
    // beta: sync 0.5h -> 5 -> max 5 sum 5 (ties alpha on max, loses on sum)
    span({ slice_id: 'beta', kind: 'sync', duration_ms: hour * 0.5 }),
    // gamma and delta: both max 1 sum 1 -> tie-break by slice_id
    span({ slice_id: 'gamma', kind: 'command', duration_ms: hour * 0.1 }),
    span({ slice_id: 'delta', kind: 'command', duration_ms: hour * 0.1 }),
  ];
  const root = project({ sessions: { alpha: twoPhase('alpha'), beta: twoPhase('beta'), gamma: twoPhase('gamma'), delta: twoPhase('delta'), idle: twoPhase('idle') }, spans });
  const r = run(root, ['--bottlenecks']);
  assert.equal(r.status, 0, r.stderr);
  const order = [...r.stdout.matchAll(/^\s*\d+\.\s+([a-z]+)\s+max/gm)].map((m) => m[1]);
  assert.deepEqual(order, ['alpha', 'beta', 'delta', 'gamma']);
  assert.match(r.stdout, /1\.\s+alpha\s+max 5\s+sum 6/);
  assert.ok(r.stdout.includes(FOOTER));
  const j = JSON.parse(run(root, ['--bottlenecks', '--json']).stdout);
  assert.deepEqual(j.bottlenecks.map((b) => b.slice_id), ['alpha', 'beta', 'delta', 'gamma']);
});

test('REQ-020: --bottlenecks with sessions but no attributed span in the tail -> exit 0 and says so', () => {
  const root = project({ spans: [span({ slice_id: null, phase: null })] });
  const r = run(root, ['--bottlenecks']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /no slice has attributed spans in the tail \(unattributed spans in the tail: 1\)/);
});

// --- REQ-021: activation table ---

test('REQ-021: expected steering per phase, skills, runtime columns, three states, configured rows, legend', () => {
  const spans = [
    span({}),
    activation('.harness/steering/core.md', 'claude', { runtime_session_id: 'sess-1', agent_id: 'agent-9' }),
    activation('.harness/steering/core.md', 'claude'),
    activation('.agents/skills/tdd/SKILL.md', 'claude', { runtime_session_id: 'sess-1' }),
  ];
  const root = project({ spans });
  const r = run(root, ['--slice', 'alpha']);
  assert.equal(r.status, 0, r.stderr);
  const section = r.stdout.slice(r.stdout.indexOf('Activation (phase implementation)'));
  const impl = section.slice(0, section.indexOf('\n\n'));
  assert.match(impl, /target\s+claude\s+cursor\s+devin/);
  assert.match(impl, /\.harness\/steering\/core\.md\s+observed \(2\)\s+unknown\s+unknown/);
  assert.match(impl, /\.harness\/steering\/impl\.md\s+not observed\s+unknown\s+unknown/);
  assert.match(impl, /\.agents\/skills\/tdd\/SKILL\.md\s+observed \(1\)\s+unknown\s+unknown/);
  assert.equal(impl.includes('design-only.md'), false, 'auto file tagged design is not expected in implementation');
  assert.equal(impl.includes('manual.md'), false);
  // Missing ids render as unknown.
  assert.match(r.stdout, /\.harness\/steering\/core\.md \[claude\]: sessions sess-1, unknown; agents agent-9, unknown/);
  // design phase lists design-only.md.
  const design = r.stdout.slice(r.stdout.indexOf('Activation (phase design)'));
  assert.match(design.slice(0, design.indexOf('\n\n')), /design-only\.md/);
  // configured, not observed rows computed now.
  assert.match(r.stdout, /CLAUDE\.md\s+\[claude\]\s+configured, not observed/);
  assert.match(r.stdout, /\.cursor\/rules\/always\.mdc\s+\[cursor\]\s+configured, not observed/);
  assert.equal(r.stdout.includes('sometimes.mdc'), false);
  assert.match(r.stdout, /\.harness\/steering\/skills\.md\s+\[all\]\s+configured, not observed/);
  // Legend: exactly the three states.
  const legend = r.stdout.slice(r.stdout.indexOf('Legend:'));
  for (const { state, meaning } of ACTIVATION_LEGEND) assert.ok(legend.includes(`${state}: ${meaning}`), state);
  assert.equal(legend.split('\n').filter((l) => /^\s+-\s/.test(l)).length, 3);
});

test('REQ-021 c4 (1.1.1, D-3): a hand-added cursor observe entry still shows cursor as unknown; runtimes missing -> "runtimes not configured" and record runtimes as columns', () => {
  const hooked = project({ spans: [span({})], hooks: { claude: false, cursor: true } });
  const r = run(hooked, ['--slice', 'alpha']);
  assert.match(r.stdout, /\.harness\/steering\/impl\.md\s+unknown\s+unknown\s+unknown/);
  assert.equal(/\[?cursor\]?[^\n]*not observed/.test(r.stdout.split('Legend:')[0].split('\n').filter((l) => l.includes('impl.md')).join('\n')), false);

  const bare = project({ spans: [activation('.harness/steering/core.md', 'cursor')], runtimes: null });
  const b = run(bare, ['--slice', 'alpha']);
  assert.equal(b.status, 0);
  assert.match(b.stdout, /runtimes not configured/);
  assert.match(b.stdout, /target\s+cursor\n/);
});

test('REQ-021: unattributed activation records are counted, never assigned to a slice or phase', () => {
  const root = project({ spans: [span({}), { ...activation('.harness/steering/impl.md', 'claude'), slice_id: null, phase: null }] });
  const r = run(root, ['--slice', 'alpha']);
  assert.match(r.stdout, /\.harness\/steering\/impl\.md\s+not observed/);
  assert.match(r.stdout, /unattributed spans in the tail: 1/);
});

// --- REQ-023 --json shape (OI-3) ---

test('REQ-023 OI-3: --json is one document; unmeasured dimensions are absent and listed in not_measured', () => {
  const root = project({ spans: [span({}), activation('.harness/steering/core.md', 'claude')], sessions: { alpha: ALPHA_SESSIONS, beta: [session('beta', 1, 'phase_started', 'spec', '2026-11-17T00:00:00Z')] } });
  const r = run(root, ['--json']);
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.schema_version, '1.0');
  assert.ok(!Number.isNaN(Date.parse(j.generated_at)));
  assert.deepEqual(j.slices.map((s) => s.slice_id), ['alpha', 'beta']);
  for (const s of j.slices) {
    for (const k of ['slice_id', 'phase_durations', 'latencies', 'activation', 'scores', 'unattributed_spans', 'not_measured']) assert.ok(k in s, k);
    assert.deepEqual(s.not_measured, ['turn_latency', 'boot_tax', 'tokens', 'h_findings']);
    for (const k of ['turn_latency', 'boot_tax', 'tokens', 'h_findings']) assert.equal(k in s, false, k);
    assert.equal(JSON.stringify(s).includes('null'), false, 'no null stand-ins');
  }
  assert.deepEqual(j.slices[1].latencies, {});
  const one = JSON.parse(run(root, ['--slice', 'beta', '--json']).stdout);
  assert.deepEqual(one.slices.map((s) => s.slice_id), ['beta']);
});

// --- REQ-022: bounded tail, cut and malformed lines ---

test('REQ-022: malformed lines in the tail are skipped and the report continues', () => {
  const raw = [JSON.stringify(span({ duration_ms: 4 })), '{not json', '42', '"str"', JSON.stringify(span({ duration_ms: 8 }))].join('\n') + '\n';
  const root = project({ rawStream: raw });
  const r = run(root, ['--slice', 'alpha']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /command\s+n=2\s+p50=4 ms\s+p95=8 ms/);
  assert.match(r.stdout, /malformed lines skipped: 3/);
});

test('REQ-022: at most the last 500 lines are read', () => {
  assert.equal(TAIL_MAX_LINES, 500);
  const spans = Array.from({ length: 600 }, (_, i) => span({ duration_ms: i < 100 ? 100000 : 1 }));
  const root = project({ spans });
  const j = JSON.parse(run(root, ['--slice', 'alpha', '--json']).stdout);
  assert.deepEqual(j.slices[0].latencies.command, { count: 500, p50: 1, p95: 1 });
  assert.equal(j.tail.lines_read, 500);
});

test('REQ-022: the 262,144-byte bound applies and the cut first line is skipped, not counted as malformed', () => {
  assert.equal(TAIL_MAX_BYTES, 262144);
  const pad = (s, len) => {
    const line = JSON.stringify(s);
    return JSON.stringify({ ...s, attributes: { ...s.attributes, pad: 'x'.repeat(len - line.length - 10) } });
  };
  const lines = Array.from({ length: 400 }, () => pad(span({ duration_ms: 2 }), 1000));
  const L = lines[0].length + 1;
  assert.ok(lines.every((l) => l.length + 1 === L));
  const root = project({ rawStream: `${lines.join('\n')}\n` });
  const j = JSON.parse(run(root, ['--slice', 'alpha', '--json']).stdout);
  const expected = Math.floor((TAIL_MAX_BYTES - 1) / L);
  assert.ok(expected < 400);
  assert.equal(j.slices[0].latencies.command.count, expected);
  assert.equal(j.tail.malformed_skipped, 0);
  assert.equal(j.tail.from_start, false);
});
