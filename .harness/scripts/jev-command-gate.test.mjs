import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDangerousCommand, checkCommandSafety } from './jev-command-gate.mjs';

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
