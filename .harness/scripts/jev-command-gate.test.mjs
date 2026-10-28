import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deniedLabel, isDangerousCommand, checkCommandSafety } from './jev-command-gate.mjs';

test('whitelist allows harness and git reads', () => {
  assert.equal(isDangerousCommand('git status'), false);
  assert.equal(isDangerousCommand('node .harness/scripts/check-invariants.mjs'), false);
  assert.equal(isDangerousCommand('node --test .harness/scripts/jev-client.test.mjs'), false);
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
    cpSync(here, join(root, '.harness/scripts'), { recursive: true });
    const payload = JSON.stringify({ hook_event_name: 'PreToolUse', tool_input: { command: 'rm -rf /tmp/secret-token-123' } });
    const out = spawnSync(process.execPath, ['.harness/scripts/jev-command-gate.mjs'], { cwd: root, input: payload, encoding: 'utf8' });
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
