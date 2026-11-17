import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  deniedLabel,
  isDangerousCommand,
  checkCommandSafety,
  commandLabel,
  gateRuntime,
  runHook,
  runHookCli,
} from './command-gate.mjs';
import { validateSpan } from './telemetry-lib.mjs';

test('whitelist allows harness and git reads', () => {
  assert.equal(isDangerousCommand('git status'), false);
  assert.equal(isDangerousCommand('node .harness/scripts/check-invariants.mjs'), false);
  assert.equal(isDangerousCommand('node --test .harness/scripts/jev-client.test.mjs'), false);
  assert.equal(isDangerousCommand('node .harness/cli/bin/asdd.mjs check'), false);
});

test('deny list flags destructive commands', () => {
  assert.equal(isDangerousCommand('rm -rf .'), true);
  assert.equal(isDangerousCommand('git push --force origin main'), true);
  assert.equal(isDangerousCommand('sudo rm /tmp/x'), true);
});

test('override allows a dangerous command without calling Jev', async () => {
  const result = await checkCommandSafety('rm -rf .', { override: true });
  assert.equal(result.allowed, true);
  assert.equal(result.method, 'override');
});

test('dangerous command is denied by pattern without calling Jev', async () => {
  const result = await checkCommandSafety('rm -rf .');
  assert.equal(result.allowed, false);
  assert.equal(result.method, 'pattern-deny');
});

test('QG-LEARN-01: denied commands are labelled by pattern, never by command text', () => {
  assert.equal(deniedLabel('git push --force origin main'), 'git push --force');
  assert.equal(deniedLabel('rm -rf /tmp/secret-token-123'), 'rm -rf');
  assert.equal(deniedLabel('sudo cat /etc/shadow'), 'sudo');
  assert.equal(deniedLabel('git status'), null);
});

test('QG-LEARN-01: a hook denial writes a command signal without the command text', () => {
  const root = mkdtempSync(join(tmpdir(), 'gate-'));
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    mkdirSync(join(root, '.harness'), { recursive: true });
    cpSync(here, join(root, '.harness/cli/src/harness'), { recursive: true });
    const payload = JSON.stringify({ hook_event_name: 'PreToolUse', tool_input: { command: 'rm -rf /tmp/secret-token-123' } });
    const out = spawnSync(process.execPath, ['.harness/cli/src/harness/command-gate.mjs'], { cwd: root, input: payload, encoding: 'utf8' });
    assert.match(out.stdout, /"permissionDecision":"deny"/);
    const dir = join(root, '.harness/state/learning/signals');
    const [file] = readdirSync(dir);
    const text = readFileSync(join(dir, file), 'utf8');
    assert.match(text, /"command:rm -rf"/);
    assert.doesNotMatch(text, /secret-token/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// --- TASK-005: command span after the verdict, fail-closed gate (REQ-002, REQ-004, REQ-005, REQ-007, REQ-008) ---

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA = JSON.parse(readFileSync(join(HERE, '../../../.harness/state/telemetry/telemetry.schema.json'), 'utf8'));
const STREAM = '.harness/state/telemetry/spans.jsonl';
const SECRET = 'SECRET-MARKER-123';

/** The gate test corpus (REQ-008): override, empty, Claude and Cursor shapes, cli shape, and a crash payload. */
const CORPUS = [
  { name: 'claude allowlist', raw: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git status' } }) },
  { name: 'claude unmatched', raw: JSON.stringify({ hook_event_name: 'PreToolUse', tool_input: { command: `make build ${SECRET}` } }) },
  { name: 'claude deny', raw: JSON.stringify({ hook_event_name: 'PreToolUse', tool_input: { command: 'rm -rf /tmp/secret-token-123' } }) },
  { name: 'claude sudo deny', raw: JSON.stringify({ hook_event_name: 'PreToolUse', tool_input: { command: `sudo cat ${SECRET}` } }) },
  { name: 'claude override', raw: JSON.stringify({ hook_event_name: 'PreToolUse', tool_input: { command: 'rm -rf .' }, override: true }) },
  { name: 'claude empty', raw: JSON.stringify({ hook_event_name: 'PreToolUse', tool_input: {} }) },
  { name: 'cursor allowlist', raw: JSON.stringify({ command: `echo ${SECRET}`, hook_event_name: 'beforeShellExecution' }) },
  { name: 'cursor deny', raw: JSON.stringify({ command: 'git push --force origin main' }) },
  { name: 'cursor override', raw: JSON.stringify({ command: 'git reset --hard', override: true }) },
  { name: 'cursor empty', raw: JSON.stringify({ command: '' }) },
  { name: 'cli no payload', raw: '' },
  { name: 'cli invalid json', raw: '{not json' },
  { name: 'crash (null payload)', raw: 'null' },
];

function tempRoot(telemetry) {
  const root = mkdtempSync(join(tmpdir(), 'gate-tel-'));
  mkdirSync(join(root, '.harness'), { recursive: true });
  if (telemetry === 'stream-absent' || telemetry === 'writable' || telemetry === 'unwritable') {
    mkdirSync(join(root, '.harness/state/telemetry'), { recursive: true });
  }
  if (telemetry === 'writable') writeFileSync(join(root, STREAM), '');
  if (telemetry === 'unwritable') {
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

function spans(root) {
  const file = join(root, STREAM);
  if (!existsSync(file) || statSync(file).isDirectory()) return [];
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

function streamText(root) {
  const file = join(root, STREAM);
  return existsSync(file) && !statSync(file).isDirectory() ? readFileSync(file, 'utf8') : '';
}

/** Copies cli/src/harness into <root>/.harness/cli/src/harness; lib: working | throw | deleted. */
function installGate(root, lib = 'working') {
  const dir = join(root, '.harness/cli/src/harness');
  cpSync(HERE, dir, { recursive: true });
  if (lib === 'throw') writeFileSync(join(dir, 'telemetry-lib.mjs'), "throw new Error('boom');\n");
  if (lib === 'deleted') rmSync(join(dir, 'telemetry-lib.mjs'));
  return dir;
}

function runGate(root, raw) {
  const out = spawnSync(process.execPath, ['.harness/cli/src/harness/command-gate.mjs'], {
    cwd: root,
    input: raw,
    encoding: 'utf8',
    env: { ...process.env, HARNESS_SLICE_ID: '', HARNESS_TRACE_ID: '' },
  });
  return { stdout: out.stdout, stderr: out.stderr, status: out.status };
}

async function runSeam(raw, root, extra = {}) {
  const lines = [];
  await runHook({ readInput: () => (raw.trim() ? JSON.parse(raw) : {}), write: (line) => lines.push(line), root, ...extra });
  return lines;
}

test('TASK-005 REQ-007: commandLabel maps the verdict to the closed label set incl. override (AMB-009)', async () => {
  const label = async (command, opts) => commandLabel(command, await checkCommandSafety(command, opts));
  assert.equal(await label('rm -rf .', { override: true }), 'override');
  assert.equal(commandLabel('', { allowed: true, method: 'no-command' }), 'empty');
  assert.equal(await label('   '), 'empty');
  assert.equal(await label('git push --force origin main'), 'git push --force');
  assert.equal(await label(`sudo cat ${SECRET}`), 'sudo');
  assert.equal(await label('git status'), 'allowlist');
  assert.equal(await label(`make ${SECRET}`), 'unmatched');
});

test('TASK-005 REQ-007 (D-2/ACT-002): gateRuntime is claude for PreToolUse, cursor for Cursor shapes, else cli', () => {
  assert.equal(gateRuntime({ hook_event_name: 'PreToolUse', tool_input: { command: 'ls' } }), 'claude');
  assert.equal(gateRuntime({ command: 'ls' }), 'cursor');
  assert.equal(gateRuntime({ command: '' }), 'cursor');
  assert.equal(gateRuntime({ hook_event_name: 'beforeShellExecution' }), 'cursor');
  assert.equal(gateRuntime({}), 'cli');
  assert.equal(gateRuntime({ hook_event_name: 'Stop' }), 'cli');
  assert.equal(gateRuntime(null), 'cli');
  assert.equal(gateRuntime(undefined), 'cli');
});

test('TASK-005 REQ-007: each hook call writes the verdict, then exactly one command span with verdict and label', async () => {
  const cases = [
    [CORPUS[0], 'allow', 'allowlist', 'claude'],
    [CORPUS[1], 'allow', 'unmatched', 'claude'],
    [CORPUS[2], 'deny', 'rm -rf', 'claude'],
    [CORPUS[4], 'allow', 'override', 'claude'],
    [CORPUS[5], 'allow', 'empty', 'claude'],
    [CORPUS[7], 'deny', 'git push --force', 'cursor'],
    [CORPUS[10], 'allow', 'empty', 'cli'],
  ];
  for (const [payload, verdict, label, runtime] of cases) {
    const root = tempRoot('writable');
    try {
      const order = [];
      await runHook({
        readInput: () => (payload.raw.trim() ? JSON.parse(payload.raw) : {}),
        write: () => order.push(spans(root).length),
        root,
      });
      assert.deepEqual(order, [0], `${payload.name}: verdict written before any span`);
      const all = spans(root);
      assert.equal(all.length, 1, payload.name);
      const [span] = all;
      assert.equal(span.kind, 'command');
      assert.equal(span.process_name, 'command-gate');
      assert.equal(span.writer, 'command-gate');
      assert.equal(span.status, 'OK');
      assert.equal(span.runtime, runtime, payload.name);
      assert.equal(span.attributes.verdict, verdict, payload.name);
      assert.equal(span.attributes.command_label, label, payload.name);
      assert.ok(span.duration_ms >= 0);
      assert.deepEqual(validateSpan(span, SCHEMA), [], payload.name);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test('TASK-005 REQ-007: no command text (SECRET-MARKER-123) reaches the stream', async () => {
  const root = tempRoot('writable');
  try {
    for (const payload of CORPUS.slice(0, 11)) await runSeam(payload.raw, root);
    const text = streamText(root);
    assert.equal(text.split('\n').filter(Boolean).length, 11);
    assert.doesNotMatch(text, /SECRET-MARKER-123/);
    assert.doesNotMatch(text, /secret-token/);
    assert.doesNotMatch(text, /origin main/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('TASK-005 proof (a) REQ-008: a gate crash still denies, exits 0, and adds one ERROR span (seam)', async () => {
  const root = tempRoot('writable');
  const previous = process.exitCode;
  try {
    const lines = [];
    await runHookCli({
      readInput: () => ({ hook_event_name: 'PreToolUse', tool_input: { command: 'git status' } }),
      write: (line) => lines.push(line),
      safety: async () => {
        throw new Error('injected crash');
      },
      root,
    });
    assert.equal(lines.length, 1);
    const out = JSON.parse(lines[0]);
    assert.equal(out.permission, 'deny');
    assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /Command gate error: injected crash/);
    assert.equal(process.exitCode, 0);
    const all = spans(root);
    assert.equal(all.length, 1);
    assert.equal(all[0].kind, 'command');
    assert.equal(all[0].status, 'ERROR');
    assert.equal(all[0].runtime, 'claude');
    assert.equal(all[0].attributes.command_label, undefined, 'label not computed before the crash');
    assert.deepEqual(validateSpan(all[0], SCHEMA), []);
  } finally {
    process.exitCode = previous;
    rmSync(root, { recursive: true, force: true });
  }
});

test('TASK-005 proof (a) REQ-008: a gate crash denies with exit 0 whether the telemetry lib works, throws, or is missing', () => {
  for (const lib of ['working', 'throw', 'deleted']) {
    const root = tempRoot('writable');
    try {
      installGate(root, lib);
      const out = runGate(root, 'null');
      assert.equal(out.status, 0, lib);
      assert.equal(out.stderr, '', lib);
      const verdict = JSON.parse(out.stdout);
      assert.equal(verdict.permission, 'deny', lib);
      assert.equal(verdict.hookSpecificOutput.permissionDecision, 'deny', lib);
      const all = spans(root);
      assert.equal(all.length, lib === 'working' ? 1 : 0, lib);
      if (lib === 'working') {
        assert.equal(all[0].status, 'ERROR');
        assert.equal(all[0].runtime, 'cli');
        assert.deepEqual(validateSpan(all[0], SCHEMA), []);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test('TASK-005 proof (b) REQ-008/REQ-002: verdict byte-identical over corpus x telemetry states x load failure', () => {
  const variants = [
    ['location-absent', 'working'],
    ['stream-absent', 'working'],
    ['writable', 'working'],
    ['unwritable', 'working'],
    ['writable', 'throw'],
    ['writable', 'deleted'],
  ];
  const roots = new Map();
  try {
    for (const [state, lib] of variants) {
      const root = tempRoot(state);
      installGate(root, lib);
      roots.set(`${state}/${lib}`, root);
    }
    let differences = 0;
    for (const payload of CORPUS) {
      const baseline = runGate(roots.get('writable/working'), payload.raw);
      assert.equal(baseline.status, 0, payload.name);
      assert.equal(baseline.stderr, '', payload.name);
      assert.ok(JSON.parse(baseline.stdout), payload.name);
      for (const key of roots.keys()) {
        if (key === 'writable/working') continue;
        const run = runGate(roots.get(key), payload.raw);
        for (const field of ['stdout', 'stderr', 'status']) {
          if (run[field] !== baseline[field]) {
            differences += 1;
            assert.fail(`${payload.name} [${key}] ${field}: ${JSON.stringify(run[field])} != ${JSON.stringify(baseline[field])}`);
          }
        }
      }
    }
    assert.equal(differences, 0);
    // Writable working stream: one valid span per call; load failures emit nothing.
    const written = spans(roots.get('writable/working'));
    assert.equal(written.length, CORPUS.length);
    for (const span of written) assert.deepEqual(validateSpan(span, SCHEMA), []);
    assert.equal(spans(roots.get('writable/throw')).length, 0);
    assert.equal(spans(roots.get('writable/deleted')).length, 0);
    assert.equal(existsSync(join(roots.get('location-absent/working'), '.harness/state/telemetry')), false);
  } finally {
    for (const root of roots.values()) {
      const stream = join(root, STREAM);
      if (existsSync(stream)) chmodSync(stream, 0o644);
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test('TASK-005 proof (c) REQ-007: checkCommandSafety emits no span, even in a cwd with a telemetry dir', () => {
  const root = tempRoot('stream-absent');
  try {
    const url = pathToFileURL(join(HERE, 'command-gate.mjs')).href;
    const script = `const m = await import(${JSON.stringify(url)});
      await m.checkCommandSafety('git status'); await m.checkCommandSafety('rm -rf /x');
      await m.checkCommandSafety('rm -rf /x', { override: true }); await m.checkCommandSafety('make x');`;
    const out = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: root, encoding: 'utf8' });
    assert.equal(out.status, 0, out.stderr);
    assert.equal(existsSync(join(root, STREAM)), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('TASK-005 proof (d) NFR-001: verdict write -> emit return p99 <= 50 ms over corpus x 50 runs', async (t) => {
  const root = tempRoot('writable');
  try {
    const samples = [];
    const payloads = CORPUS.filter((p) => p.raw !== 'null' && p.raw !== '{not json');
    for (let run = 0; run < 50; run += 1) {
      for (const payload of payloads) {
        let written = 0;
        await runHook({
          readInput: () => (payload.raw.trim() ? JSON.parse(payload.raw) : {}),
          write: () => {
            written = performance.now();
          },
          root,
        });
        samples.push(performance.now() - written);
      }
    }
    samples.sort((a, b) => a - b);
    const p99 = samples[Math.ceil(samples.length * 0.99) - 1];
    t.diagnostic(`NFR-001 added-time samples=${samples.length} p50=${samples[Math.floor(samples.length / 2)].toFixed(3)}ms p99=${p99.toFixed(3)}ms max=${samples.at(-1).toFixed(3)}ms`);
    assert.equal(spans(root).length, samples.length, 'one span per run');
    assert.ok(p99 <= 50, `p99 ${p99} ms`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
