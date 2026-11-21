import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs, {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSpan, startTrace, TAIL_MAX_BYTES, TAIL_MAX_LINES } from '../telemetry-lib.mjs';
import validateTelemetry, { telemetryFindings } from './telemetry.mjs';

// TASK-007: WARN-only telemetry validator wired into asdd check, isolated from learning signals
// (REQ-019, REQ-006, REQ-005; design ADR-006, §4.4 OI-5, §8 TEL-W3 OI-7, AMB-010).

const HERE = dirname(fileURLToPath(import.meta.url));
const HARNESS = join(HERE, '..');
const REPO = join(HERE, '../../../..');
const SCHEMA_TEXT = readFileSync(join(REPO, '.harness/state/telemetry/telemetry.schema.json'), 'utf8');
const DIR = '.harness/state/telemetry';
const STREAM = `${DIR}/spans.jsonl`;
const IGNORES = '.harness/state/telemetry/spans.jsonl\n.harness/state/telemetry/slices/\n';
const CLAUDE_OBSERVE = {
  hooks: {
    PostToolUse: [{ matcher: 'Read|Skill', hooks: [{ type: 'command', command: 'node cli/bin/asdd.mjs observe claude >/dev/null 2>&1; exit 0' }] }],
  },
};
const CURSOR_OBSERVE = {
  version: 1,
  hooks: { beforeReadFile: [{ command: 'node cli/bin/asdd.mjs observe cursor >/dev/null 2>&1; echo \'{"permission":"allow"}\'; exit 0', timeout: 10 }] },
};

function spanLine(attributes = {}) {
  return JSON.stringify(buildSpan(startTrace({ env: {} }), { kind: 'command', process_name: 'command-gate', runtime: 'cli', attributes }));
}

/**
 * A temp project. location: false → no .harness/state/telemetry/. registered → schema + README, gitignore lines,
 * claude runtime with its observe entry (no TEL-W3). lines → spans.jsonl content (array of strings) or null.
 */
function project({ location = true, registered = true, lines = null, runtimes = ['claude'] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'tel-val-'));
  mkdirSync(join(root, '.harness/config'), { recursive: true });
  mkdirSync(join(root, '.harness/state'), { recursive: true });
  writeFileSync(join(root, '.harness/config/project.json'), JSON.stringify({ schema_version: '1.0', runtimes }));
  if (location) {
    mkdirSync(join(root, DIR), { recursive: true });
    if (registered) {
      writeFileSync(join(root, DIR, 'telemetry.schema.json'), SCHEMA_TEXT);
      writeFileSync(join(root, DIR, 'README.md'), '# Harness Telemetry\n');
      writeFileSync(join(root, '.gitignore'), `node_modules/\n${IGNORES}`);
      mkdirSync(join(root, '.claude'), { recursive: true });
      writeFileSync(join(root, '.claude/settings.json'), JSON.stringify(CLAUDE_OBSERVE));
      mkdirSync(join(root, '.cursor'), { recursive: true });
      writeFileSync(join(root, '.cursor/hooks.json'), JSON.stringify(CURSOR_OBSERVE));
    }
    if (lines) writeFileSync(join(root, STREAM), lines.map((l) => `${l}\n`).join(''));
  }
  return root;
}

function cleanup(root) {
  const stream = join(root, STREAM);
  if (existsSync(stream) && !statSync(stream).isDirectory()) chmodSync(stream, 0o644);
  rmSync(root, { recursive: true, force: true });
}

/** Runs the validator through its ctx entry point; fail() must never be called (WARN-only). */
function runValidator(root) {
  const warns = [];
  const fails = [];
  validateTelemetry({ root, warn: (m) => warns.push(m), fail: (m) => fails.push(m) });
  assert.deepEqual(fails, [], 'the telemetry validator never calls fail()');
  return warns;
}

/** sha256 over every file path + bytes under root (state-hash). */
function treeHash(root, sub = '') {
  const h = createHash('sha256');
  const base = join(root, sub);
  if (!existsSync(base)) return 'absent';
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = join(dir, e.name);
      h.update(relative(root, p));
      if (e.isDirectory()) walk(p);
      else h.update(readFileSync(p));
    }
  };
  walk(base);
  return h.digest('hex');
}

// --- Validator unit cases ---

test('TASK-007 REQ-019: absent telemetry location → no output, no finding, no file created', () => {
  const root = project({ location: false, runtimes: ['claude', 'cursor'] });
  try {
    const before = treeHash(root);
    assert.deepEqual(runValidator(root), []);
    assert.deepEqual(telemetryFindings(root), []);
    assert.equal(treeHash(root), before);
    assert.equal(existsSync(join(root, DIR)), false);
  } finally {
    cleanup(root);
  }
});

test('TASK-007 REQ-019 TEL-W1: schema file missing or unparseable → one WARN naming the schema file', () => {
  for (const variant of ['missing', 'unparseable']) {
    const root = project({ lines: [spanLine()] });
    try {
      const schema = join(root, DIR, 'telemetry.schema.json');
      if (variant === 'missing') rmSync(schema);
      else writeFileSync(schema, '{ not json');
      const w1 = runValidator(root).filter((w) => w.startsWith('TEL-W1'));
      assert.equal(w1.length, 1, variant);
      assert.match(w1[0], /telemetry\.schema\.json/, variant);
    } finally {
      cleanup(root);
    }
  }
});

test('TASK-007 REQ-019/REQ-005 TEL-W2: one WARN per bad tail line, numbered "spans.jsonl line N" when the tail is the whole file', () => {
  const noSource = JSON.parse(spanLine());
  delete noSource.attributes.trace_source;
  const badSchema = JSON.parse(spanLine());
  badSchema.status = 'MAYBE';
  const lines = [
    spanLine(),
    '{ not json',
    JSON.stringify(badSchema),
    spanLine({ padding: 'x'.repeat(4200) }),
    JSON.stringify(noSource),
    spanLine(),
  ];
  const root = project({ lines });
  try {
    const warns = runValidator(root);
    const w2 = warns.filter((w) => w.startsWith('TEL-W2'));
    assert.equal(w2.length, 4, warns.join('\n'));
    assert.match(w2[0], /^TEL-W2 \.harness\/state\/telemetry\/spans\.jsonl line 2: .*not JSON/);
    assert.match(w2[1], /spans\.jsonl line 3: .*schema/);
    assert.match(w2[1], /status/);
    assert.match(w2[2], /spans\.jsonl line 4: .*4096 bytes/);
    assert.match(w2[3], /spans\.jsonl line 5: .*trace_source/);
    assert.equal(warns.some((w) => /line (1|6)\b/.test(w)), false, 'valid lines give no WARN');
    assert.equal(warns.filter((w) => !w.startsWith('TEL-W2')).length, 0, 'a registered location gives only line WARNs');
  } finally {
    cleanup(root);
  }
});

test('TASK-007 REQ-019 OI-5: tail-relative numbering when the line bound applies', () => {
  const lines = Array.from({ length: TAIL_MAX_LINES + 100 }, () => spanLine());
  lines.push('garbage');
  const root = project({ lines });
  try {
    const w2 = runValidator(root).filter((w) => w.startsWith('TEL-W2'));
    assert.equal(w2.length, 1);
    assert.equal(
      w2[0].split(':')[0],
      `TEL-W2 .harness/state/telemetry/spans.jsonl tail line ${TAIL_MAX_LINES} (numbered from the start of the last ${TAIL_MAX_LINES} lines read; the file is longer)`,
    );
  } finally {
    cleanup(root);
  }
});

test('TASK-007 REQ-019 bounded read: a 10 MB stream is read through at most TAIL_MAX_BYTES (spied readSync)', () => {
  const root = project();
  const line = spanLine();
  const count = Math.ceil((10 * 1024 * 1024) / (line.length + 1));
  writeFileSync(join(root, STREAM), `${line}\n`.repeat(count) + 'garbage\n');
  const stream = join(root, STREAM);
  const realReadSync = fs.readSync;
  const realReadFileSync = fs.readFileSync;
  let bytes = 0;
  let wholeReads = 0;
  fs.readSync = function spy(fd, buf, ...rest) {
    const n = realReadSync.call(this, fd, buf, ...rest);
    bytes += n;
    return n;
  };
  fs.readFileSync = function spy(p, ...rest) {
    if (String(p) === stream) wholeReads += 1;
    return realReadFileSync.call(this, p, ...rest);
  };
  try {
    assert.ok(statSync(stream).size >= 10 * 1024 * 1024);
    const w2 = runValidator(root).filter((w) => w.startsWith('TEL-W2'));
    assert.equal(w2.length, 1);
    assert.match(w2[0], /tail line \d+ \(numbered from the start of the last \d+ lines read; the file is longer\)/);
    assert.ok(bytes > 0, 'the tail was read');
    assert.ok(bytes <= TAIL_MAX_BYTES, `read ${bytes} bytes > ${TAIL_MAX_BYTES}`);
    assert.equal(wholeReads, 0, 'the stream is never read whole');
  } finally {
    fs.readSync = realReadSync;
    fs.readFileSync = realReadFileSync;
    cleanup(root);
  }
});

test('TASK-007 OI-7 TEL-W3: registration WARNs (a) gitignore, (b) contract files, (c) runtime hook, each naming asdd install .', () => {
  const cases = [
    ['registered', () => {}, 0, null],
    ['(a) gitignore line missing', (r) => writeFileSync(join(r, '.gitignore'), '.harness/state/telemetry/slices/\n'), 1, /\.gitignore.*\.harness\/state\/telemetry\/spans\.jsonl/],
    ['(a) gitignore absent', (r) => rmSync(join(r, '.gitignore')), 1, /\.gitignore.*spans\.jsonl.*slices\//],
    ['(b) README missing', (r) => rmSync(join(r, DIR, 'README.md')), 1, /README\.md/],
    ['(c) claude PostToolUse observe missing', (r) => writeFileSync(join(r, '.claude/settings.json'), JSON.stringify({ hooks: { Stop: [] } })), 1, /claude.*\.claude\/settings\.json.*PostToolUse/],
    ['(c) claude settings unparseable', (r) => writeFileSync(join(r, '.claude/settings.json'), '{'), 1, /claude/],
    ['(c) cursor configured without a beforeReadFile observe entry → no hook WARN (D-3 hookless)', (r) => {
      writeFileSync(join(r, '.harness/config/project.json'), JSON.stringify({ runtimes: ['claude', 'cursor'] }));
      writeFileSync(join(r, '.cursor/hooks.json'), JSON.stringify({ version: 1, hooks: { stop: [] } }));
    }, 0, null],
    ['(c) runtime not listed → no hook WARN', (r) => {
      writeFileSync(join(r, '.harness/config/project.json'), JSON.stringify({ runtimes: ['devin'] }));
      rmSync(join(r, '.claude/settings.json'));
    }, 0, null],
    ['(c) installed shell wrapper "$b" observe counts as registered', (r) => {
      const cmd = 'b=node_modules/.bin/asdd; [ -x "$b" ] || b=asdd; command -v "$b" >/dev/null 2>&1 && "$b" observe claude >/dev/null 2>&1; exit 0';
      writeFileSync(join(r, '.claude/settings.json'), JSON.stringify({ hooks: { PostToolUse: [{ matcher: 'Read|Skill', hooks: [{ type: 'command', command: cmd }] }] } }));
    }, 0, null],
  ];
  for (const [name, mutate, expected, re] of cases) {
    const root = project({ lines: [spanLine()] });
    try {
      mutate(root);
      const w3 = runValidator(root).filter((w) => w.startsWith('TEL-W3'));
      assert.equal(w3.length, expected, `${name}: ${w3.join(' | ')}`);
      for (const w of w3) {
        assert.match(w, re, name);
        assert.match(w, /`asdd install \.`/, `${name}: names the fix`);
      }
    } finally {
      cleanup(root);
    }
  }
});

test('TASK-007/TASK-012 D-3 hookless: a configured cursor runtime never yields a cursor TEL-W3 line', () => {
  for (const [name, mutate] of [
    ['cursor hooks.json absent', (r) => rmSync(join(r, '.cursor/hooks.json'))],
    ['cursor hooks.json unparseable', (r) => writeFileSync(join(r, '.cursor/hooks.json'), '{')],
    ['cursor hooks.json without beforeReadFile', (r) => writeFileSync(join(r, '.cursor/hooks.json'), JSON.stringify({ version: 1, hooks: { stop: [] } }))],
    ['cursor only, nothing else registered', (r) => {
      writeFileSync(join(r, '.harness/config/project.json'), JSON.stringify({ runtimes: ['cursor'] }));
      rmSync(join(r, '.cursor'), { recursive: true, force: true });
      rmSync(join(r, '.gitignore'));
    }],
  ]) {
    const root = project({ lines: [spanLine()], runtimes: ['claude', 'cursor'] });
    try {
      mutate(root);
      const w3 = runValidator(root).filter((w) => w.startsWith('TEL-W3'));
      assert.equal(w3.some((w) => /cursor|beforeReadFile/.test(w)), false, `${name}: ${w3.join(' | ')}`);
    } finally {
      cleanup(root);
    }
  }
  // The Claude load-hook check stays: same project without the Claude observe entry still WARNs for claude.
  const root = project({ lines: [spanLine()], runtimes: ['claude', 'cursor'] });
  try {
    rmSync(join(root, '.cursor/hooks.json'));
    writeFileSync(join(root, '.claude/settings.json'), JSON.stringify({ hooks: { Stop: [] } }));
    const w3 = runValidator(root).filter((w) => w.startsWith('TEL-W3'));
    assert.equal(w3.length, 1, w3.join(' | '));
    assert.match(w3[0], /^TEL-W3 runtime claude: \.claude\/settings\.json PostToolUse has no asdd observe entry/);
  } finally {
    cleanup(root);
  }
});

test('TASK-007 OI-7: TEL-W3 is inactive when the location is absent, even with nothing registered', () => {
  const root = project({ location: false, runtimes: ['claude', 'cursor'] });
  try {
    assert.deepEqual(runValidator(root), []);
  } finally {
    cleanup(root);
  }
});

test('TASK-007 REQ-006: the validator creates, modifies, or deletes no file (malformed stream, unregistered)', () => {
  const root = project({ registered: false, lines: ['{ not json', spanLine()], runtimes: ['claude', 'cursor'] });
  try {
    const before = treeHash(root);
    const warns = runValidator(root);
    assert.ok(warns.length > 0);
    assert.equal(treeHash(root), before);
  } finally {
    cleanup(root);
  }
});

// --- check-invariants wiring (exit-code identity, AMB-010, learning isolation) ---

const CHECK_ENV_DROP = ['HARNESS_JEV_LIVE', 'HARNESS_RUNTIME', 'HARNESS_DRIFT_BASE', 'HARNESS_TRACE_ID', 'HARNESS_SPAN_ID', 'HARNESS_SLICE_ID'];

/**
 * A copy of cli/src/harness where every other validator and the best-effort libs are neutral stubs, so check's
 * exit code is decided only by the wiring under test. lib/validator: working | throw | deleted | call-throw.
 */
function harnessCopy({ lib = 'working', validator = 'working', baselineFail = false } = {}) {
  // The package layout (cli/src/harness next to cli/registry): the commands read their arguments from the registry.
  const dir = join(mkdtempSync(join(tmpdir(), 'tel-chk-h-')), 'cli/src/harness');
  // The whole harness, so the real learning-lib (writeSensorSignal under --live) and its imports load.
  cpSync(HARNESS, dir, { recursive: true, filter: (src) => !src.endsWith('.test.mjs') });
  cpSync(join(HARNESS, '../../registry'), join(dir, '../../registry'), { recursive: true });
  // Neutral default exports; named exports stay (other libs import them, e.g. drift-lib ← features).
  for (const name of ['paths', 'manifest', 'features', 'skills', 'steering-tags', 'steering-profile', 'lite-escalation', 'phase-chain', 'spec-drift', 'learning']) {
    const file = join(dir, 'validators', `${name}.mjs`);
    cpSync(file, join(dir, 'validators', `${name}.real.mjs`));
    const body = name === 'paths' && baselineFail ? 'ctx.fail("BASE-01 stub failure");' : '';
    writeFileSync(file, `export * from './${name}.real.mjs';\nexport default function validate(ctx) { ${body} }\n`);
  }
  writeFileSync(join(dir, 'converge-lib.mjs'), 'export function runConverge() { return { fails: [], warns: [] }; }\n');
  writeFileSync(join(dir, 'hill-lib.mjs'), 'export function lateUphillFindings() { return []; }\n');
  cpSync(join(HERE, 'telemetry.mjs'), join(dir, 'validators/telemetry.mjs'));
  if (lib === 'throw') writeFileSync(join(dir, 'telemetry-lib.mjs'), "throw new Error('boom');\n");
  if (lib === 'deleted') rmSync(join(dir, 'telemetry-lib.mjs'));
  if (validator === 'throw') writeFileSync(join(dir, 'validators/telemetry.mjs'), "throw new Error('boom');\n");
  if (validator === 'deleted') rmSync(join(dir, 'validators/telemetry.mjs'));
  if (validator === 'call-throw') {
    writeFileSync(join(dir, 'validators/telemetry.mjs'), "export default function validate(ctx) { ctx.warn('TEL-W2 partial'); throw new Error('boom'); }\n");
  }
  return dir;
}

function runCheck(harness, root, args = []) {
  const env = { ...process.env };
  for (const k of CHECK_ENV_DROP) delete env[k];
  const out = spawnSync(process.execPath, [join(harness, 'check-invariants.mjs'), ...args], { cwd: root, encoding: 'utf8', env });
  return { stdout: out.stdout, stderr: out.stderr, status: out.status };
}

/** check's project: a valid global manifest plus the telemetry state. */
function checkProject(state) {
  const malformed = ['{ not json', spanLine(), 'x'.repeat(5000)];
  const root =
    state === 'absent'
      ? project({ location: false, registered: false })
      : state === 'valid'
        ? project({ lines: [spanLine(), spanLine()] })
        : state === 'unregistered'
          ? project({ registered: false, lines: malformed, runtimes: ['claude', 'cursor'] })
          : project({ lines: malformed });
  writeFileSync(join(root, '.harness/state/manifest.json'), JSON.stringify({ schema_version: '2.0', active_slices: [] }));
  if (state === 'unwritable') {
    if (process.getuid?.() !== 0) chmodSync(join(root, STREAM), 0o000);
    else {
      rmSync(join(root, STREAM));
      mkdirSync(join(root, STREAM));
    }
  }
  return root;
}

const withoutTel = (text) => text.split('\n').filter((l) => !l.startsWith('WARN  TEL-')).join('\n');

test('TASK-007 REQ-019 AMB-010: asdd check exit code is identical across telemetry states and validator/lib load failures; failures add no output', () => {
  for (const baselineFail of [false, true]) {
    const expectedExit = baselineFail ? 1 : 0;
    const working = harnessCopy({ baselineFail });
    const roots = [];
    try {
      const results = {};
      for (const state of ['absent', 'valid', 'malformed', 'unregistered', 'unwritable']) {
        const root = checkProject(state);
        roots.push(root);
        results[state] = runCheck(working, root);
        assert.equal(results[state].status, expectedExit, `${state} (baselineFail=${baselineFail}): ${results[state].stderr}`);
      }
      assert.doesNotMatch(results.absent.stdout + results.absent.stderr, /TEL-/, 'absent location prints nothing');
      assert.doesNotMatch(results.valid.stdout + results.valid.stderr, /TEL-/, 'valid registered stream prints nothing');
      assert.match(results.malformed.stderr, /^WARN {2}TEL-W2 /m, 'malformed lines print WARN lines');
      assert.doesNotMatch(results.malformed.stdout + results.malformed.stderr, /FAIL {2}TEL-/, 'never a telemetry FAIL');
      assert.match(results.unregistered.stderr, /^WARN {2}TEL-W3 /m);
      assert.match(results.unregistered.stderr, /^WARN {2}TEL-W1 /m);

      // Load failures and throws, against the malformed + unregistered project (the run with the most TEL output).
      const reference = results.unregistered;
      const refRoot = roots[3];
      for (const variant of [{ lib: 'throw' }, { lib: 'deleted' }, { validator: 'throw' }, { validator: 'deleted' }, { validator: 'call-throw' }]) {
        const broken = harnessCopy({ ...variant, baselineFail });
        try {
          const out = runCheck(broken, refRoot);
          const label = `${JSON.stringify(variant)} baselineFail=${baselineFail}`;
          assert.equal(out.status, reference.status, label);
          assert.equal(out.stdout, withoutTel(reference.stdout), `${label}: stdout`);
          assert.equal(out.stderr, withoutTel(reference.stderr), `${label}: stderr`);
        } finally {
          rmSync(broken, { recursive: true, force: true });
        }
      }
    } finally {
      for (const r of roots) cleanup(r);
      rmSync(working, { recursive: true, force: true });
    }
  }
});

test('TASK-007 ADR-006/REQ-006: check --live with telemetry WARNs records no learning signal and writes no span', () => {
  const harness = harnessCopy();
  const telRoot = checkProject('unregistered');
  const quietRoot = checkProject('absent');
  try {
    const streamBefore = readFileSync(join(telRoot, STREAM));
    const out = runCheck(harness, telRoot, ['--live']);
    assert.equal(out.status, 0);
    assert.match(out.stderr, /^WARN {2}TEL-/m, 'telemetry WARNs are printed');
    const quiet = runCheck(harness, quietRoot, ['--live']);
    assert.equal(quiet.status, 0);
    assert.equal(treeHash(telRoot, '.harness/state/learning'), treeHash(quietRoot, '.harness/state/learning'));
    assert.equal(existsSync(join(telRoot, '.harness/state/learning')), false, 'no learning signal written');
    assert.deepEqual(readFileSync(join(telRoot, STREAM)), streamBefore, 'check emits no per-validator span');
  } finally {
    cleanup(telRoot);
    cleanup(quietRoot);
    rmSync(join(harness, '../../..'), { recursive: true, force: true });
  }
});

test('TASK-007 control: a shared (non-telemetry) WARN under --live is still recorded, so the isolation test can fail', () => {
  const harness = harnessCopy();
  writeFileSync(
    join(harness, 'validators/learning.mjs'),
    "export * from './learning.real.mjs';\nexport default function validate(ctx) { ctx.warn('QG-CTRL-01 control warn'); }\n",
  );
  const root = checkProject('absent');
  try {
    const out = runCheck(harness, root, ['--live']);
    assert.equal(out.status, 0);
    assert.ok(existsSync(join(root, '.harness/state/learning')), 'control signal written');
  } finally {
    cleanup(root);
    rmSync(join(harness, '../../..'), { recursive: true, force: true });
  }
});
