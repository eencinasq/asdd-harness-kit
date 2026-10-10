#!/usr/bin/env node
/**
 * Verify-on-Stop hook (dual protocol, auto-detected from the stdin payload).
 * Runs `node .harness/scripts/check-invariants.mjs --live` and, on failure,
 * blocks the session end so the agent fixes the harness first.
 *
 * Cursor:       `.cursor/hooks.json` → stop hook. Output `{}` or `{ "followup_message": "..." }`.
 * Claude Code:  `.claude/settings.json` → Stop hook. Output `{}` or `{ "decision": "block", "reason": "..." }`
 *               (respects `stop_hook_active` to avoid infinite loops).
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

const isClaude = input.hook_event_name === 'Stop';
if (isClaude && input.stop_hook_active) {
  // Already blocked once — avoid an infinite stop-hook loop.
  emit({});
  process.exit(0);
}

function emitBlock(message) {
  emit(isClaude ? { decision: 'block', reason: message } : { followup_message: message });
}

const root = repoRoot();
const script = join(root, '.harness/scripts/check-invariants.mjs');
if (!existsSync(script)) {
  emitBlock('Verify-on-Stop: missing `.harness/scripts/check-invariants.mjs`. Restore that script before marking the task complete.');
  process.exit(0);
}

const result = spawnSync(process.execPath, [script, '--live'], {
  cwd: root,
  encoding: 'utf8',
  timeout: 30000,
});

if (result.error || result.status === null) {
  const reason = result.error?.message || result.signal || 'no exit status';
  emitBlock(`Verify-on-Stop could not run \`node .harness/scripts/check-invariants.mjs\`: ${reason}. Fix the hook environment before marking the task complete.`);
  process.exit(0);
}

if (result.status === 0) {
  emit({});
  process.exit(0);
}

const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
const clipped = output.length > MAX_OUTPUT ? `${output.slice(0, MAX_OUTPUT)}\n…(truncated)` : output;
emitBlock([
  'Verify-on-Stop failed. Do not mark the task passing and do not end the session.',
  'Fix every FAIL from `node .harness/scripts/check-invariants.mjs`. The stop hook runs that command again when you finish.',
  '',
  clipped || `check-invariants.mjs exited ${result.status} with no output.`,
].join('\n'));
process.exit(0);
