#!/usr/bin/env node
/**
 * Verify-on-Stop hook.
 * Runs `node .harness/scripts/check-invariants.mjs` and, on failure, returns a
 * Cursor `stop` follow-up so the agent fixes the harness before the session ends.
 *
 * Cursor: `.cursor/hooks.json` → `node .harness/scripts/verify-on-stop.mjs`
 * Stdin: stop-hook JSON (`status`, `loop_count`). Stdout: `{}` or `{ "followup_message": "..." }`.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_OUTPUT = 12000;

function repoRoot() {
  if (existsSync(join(process.cwd(), '.harness/scripts/check-invariants.mjs'))) {
    return process.cwd();
  }
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..');
}

function readStdin() {
  let raw = '';
  try {
    raw = readFileSync(0, 'utf8');
  } catch {
    return {};
  }
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function emit(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

const input = readStdin();
if (input.status === 'aborted' || input.status === 'error') {
  emit({});
  process.exit(0);
}

const root = repoRoot();
const script = join(root, '.harness/scripts/check-invariants.mjs');
if (!existsSync(script)) {
  emit({
    followup_message:
      'Verify-on-Stop: missing `.harness/scripts/check-invariants.mjs`. Restore that script before marking the task complete.',
  });
  process.exit(0);
}

const result = spawnSync(process.execPath, [script], {
  cwd: root,
  encoding: 'utf8',
  timeout: 30000,
});

if (result.error || result.status === null) {
  const reason = result.error?.message || result.signal || 'no exit status';
  emit({
    followup_message: `Verify-on-Stop could not run \`node .harness/scripts/check-invariants.mjs\`: ${reason}. Fix the hook environment before marking the task complete.`,
  });
  process.exit(0);
}

if (result.status === 0) {
  emit({});
  process.exit(0);
}

const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
const clipped = output.length > MAX_OUTPUT ? `${output.slice(0, MAX_OUTPUT)}\n…(truncated)` : output;
emit({
  followup_message: [
    'Verify-on-Stop failed. Do not mark the task passing and do not end the session.',
    'Fix every FAIL from `node .harness/scripts/check-invariants.mjs`. The stop hook runs that command again when you finish.',
    '',
    clipped || `check-invariants.mjs exited ${result.status} with no output.`,
  ].join('\n'),
});
process.exit(0);
