import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deniedLabel, isDangerousCommand, checkCommandSafety, isReadonlyMode, readonlyVerdict } from './command-gate.mjs';

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

const HERE_GATE = dirname(fileURLToPath(import.meta.url));
const READS = [
  'ls -la docs',
  'cat cli/skills/shape-up/SKILL.md',
  'grep -rn "REQ-001" .harness/specs | head -20',
  'git log --oneline -5',
  'git diff --stat main',
  'node cli/bin/asdd.mjs status --metrics --json',
  'node cli/bin/asdd.mjs knowledge search "saved cards" --k 5',
  'asdd knowledge sync',
  'npx asdd drift --json 2>/dev/null',
  'node cli/bin/asdd.mjs intake --from /tmp/i.md --ref https://x/PROD-1 --dry-run',
  'codegraph explore "checkout payment step"',
  'HARNESS_DRIFT_BASE=main node cli/bin/asdd.mjs check',
  'find docs -name "*.md"',
  'gh issue view 12',
];
const WRITES = [
  'echo hi > notes.md',
  'cat a >> b',
  'printf x | tee out.txt',
  "sed -i '' s/a/b/ README.md",
  'git commit -m x',
  'git add -A',
  'git checkout -b po',
  'npm install left-pad',
  'node -e "require(\'fs\').writeFileSync(\'x\',\'y\')"',
  'touch x',
  'mkdir -p x',
  'cp a b',
  'mv a b',
  'rm a',
  'ls $(touch x)',
  'ls `touch x`',
  'find . -name x -delete',
  'find . -exec rm {} ;',
  'node cli/bin/asdd.mjs intake --from /tmp/i.md --ref https://x/PROD-1',
  'node cli/bin/asdd.mjs sync',
  'node cli/bin/asdd.mjs slice init po',
  'git log && touch x',
  'python3 -c "open(\'x\',\'w\')"',
];

test('po-readonly-gate REQ-001 REQ-002 read-only mode allows reads and denies every write path', () => {
  for (const c of READS) assert.equal(readonlyVerdict(c).allowed, true, `should allow: ${c}`);
  for (const c of WRITES) assert.equal(readonlyVerdict(c).allowed, false, `should deny: ${c}`);
});

test('po-readonly-gate REQ-003 REQ-004 the mode comes from HARNESS_GATE_MODE; override does not bypass it', async () => {
  assert.equal(isReadonlyMode({ HARNESS_GATE_MODE: 'readonly' }), true);
  assert.equal(isReadonlyMode({}), false);
  const ro = await checkCommandSafety('echo hi > x', { override: true, env: { HARNESS_GATE_MODE: 'readonly' } });
  assert.equal(ro.allowed, false);
  assert.equal(ro.method, 'readonly-deny');
  const normal = await checkCommandSafety('echo hi > x', { env: {} });
  assert.equal(normal.allowed, true, 'unset mode: unchanged behavior');
});

test('po-readonly-gate REQ-001 the hook denies a write for Claude and Cursor payloads in read-only mode', () => {
  const bin = join(HERE_GATE, '../../bin/asdd.mjs');
  const env = { ...process.env, HARNESS_GATE_MODE: 'readonly' };
  const claude = spawnSync(process.execPath, [bin, 'gate'], { input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_input: { command: 'touch x' }, override: true }), env, encoding: 'utf8', cwd: tmpdir() });
  assert.match(claude.stdout, /"permissionDecision":"deny"/);
  const cursor = spawnSync(process.execPath, [bin, 'gate'], { input: JSON.stringify({ command: 'git log --oneline -3' }), env, encoding: 'utf8', cwd: tmpdir() });
  assert.match(cursor.stdout, /"permission":"allow"/);
});
