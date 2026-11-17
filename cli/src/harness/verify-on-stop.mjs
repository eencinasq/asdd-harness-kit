#!/usr/bin/env node
/**
 * Verify-on-Stop hook (dual protocol, auto-detected from the stdin payload).
 * Runs `asdd check --live` (check-invariants.mjs next to this file) and, on failure,
 * blocks the session end so the agent fixes the harness first — unless stop mode is
 * `advisory` (`stop.mode` in project.json or `HARNESS_STOP_MODE=advisory`).
 *
 * Cursor:       `.cursor/hooks.json` → stop hook. Output `{}` or `{ "followup_message": "..." }`.
 * Claude Code:  `.claude/settings.json` → Stop hook. Output `{}` or `{ "decision": "block", "reason": "..." }`
 *               (respects `stop_hook_active` to avoid infinite loops).
 *
 * `--live` also records each failing run as a learning signal (QG-LEARN-01);
 * HARNESS_RUNTIME tells check-invariants which runtime blocked.
 *
 * Every exit path goes through finish(): the payload is written first, then one `hook` span is appended through a
 * guarded import of telemetry-lib.mjs (ADR-001); a telemetry failure never changes stdout, stderr, or the exit code.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isAdvisoryStop } from './stop-mode.mjs';

const MAX_OUTPUT = 12000;
const startedAt = Date.now();

/** The hook runs at the project root; the invariants script ships next to this file (in the CLI). */
const repoRoot = () => process.cwd();

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

/** Span runtime (design §4.3): claude for a Claude Stop payload, cursor for a Cursor-shaped payload, else cli. */
function hookRuntime(payload) {
  if (payload.hook_event_name === 'Stop') return 'claude';
  if (Object.hasOwn(payload, 'status') || payload.hook_event_name === 'stop') return 'cursor';
  return 'cli';
}

/** `check --live` attributes, only for a numeric exit status: exit_code and the count of `FAIL ` lines. */
function checkAttrs(result) {
  const lines = `${result.stdout || ''}\n${result.stderr || ''}`.split('\n');
  return { exit_code: result.status, violations_count: lines.filter((line) => /^FAIL\s/.test(line)).length };
}

// Telemetry is best-effort and runs only after the payload is written (ADR-001): a missing or broken lib, a throw,
// or emit() returning false is a no-op.
async function emitHookSpan(outcome, attrs) {
  const tel = await import('./telemetry-lib.mjs').catch(() => null);
  try {
    if (!tel) return;
    const where = repoRoot();
    const { slice_id, phase } = tel.attribute(where);
    const span = tel.buildSpan(tel.startTrace(), {
      kind: 'hook',
      process_name: 'verify-on-stop',
      runtime: hookRuntime(input),
      slice_id,
      phase,
      start: startedAt,
      end: Date.now(),
      status: outcome === 'could-not-run' ? 'ERROR' : 'OK',
      attributes: { outcome, ...attrs },
    });
    tel.emit(span, { root: where });
  } catch {
    // ignore
  }
}

/** The single exit: write the payload exactly as before, emit one `hook` span, exit 0. */
async function finish(outcome, payload, attrs = {}) {
  emit(payload);
  await emitHookSpan(outcome, attrs);
  process.exit(0);
}

const input = readStdin();
if (input.status === 'aborted' || input.status === 'error') {
  await finish('guard-skip', {});
}

const isClaude = input.hook_event_name === 'Stop';
if (isClaude && input.stop_hook_active) {
  // Already blocked once — avoid an infinite stop-hook loop.
  await finish('guard-skip', {});
}

function blockPayload(message) {
  return isClaude ? { decision: 'block', reason: message } : { followup_message: message };
}

const root = repoRoot();
const script = join(dirname(fileURLToPath(import.meta.url)), 'check-invariants.mjs');
if (!existsSync(script)) {
  await finish('could-not-run', blockPayload('Verify-on-Stop: the asdd CLI is incomplete (check-invariants.mjs is missing). Reinstall it: npx asdd-harness-kit install .'));
}

const result = spawnSync(process.execPath, [script, '--live'], {
  cwd: root,
  encoding: 'utf8',
  timeout: 30000,
  env: { ...process.env, HARNESS_RUNTIME: isClaude ? 'claude' : 'cursor' },
});

if (result.error || result.status === null) {
  const reason = result.error?.message || result.signal || 'no exit status';
  await finish('could-not-run', blockPayload(`Verify-on-Stop could not run \`asdd check\`: ${reason}. Fix the hook environment before marking the task complete.`));
}

if (result.status === 0) {
  await finish('pass', {}, checkAttrs(result));
}

const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
const clipped = output.length > MAX_OUTPUT ? `${output.slice(0, MAX_OUTPUT)}\n…(truncated)` : output;
const detail = clipped || `check-invariants.mjs exited ${result.status} with no output.`;

if (isAdvisoryStop(root)) {
  // Advisory: still ran --live (learning signals), but do not block the session.
  console.error(['Verify-on-Stop advisory: asdd check reported FAILs (session not blocked).', detail].join('\n'));
  await finish('advisory', {}, checkAttrs(result));
}

await finish('block', blockPayload([
  'Verify-on-Stop failed. Do not mark the task passing and do not end the session.',
  'Fix every FAIL from `asdd check`. The stop hook runs that command again when you finish.',
  '',
  detail,
].join('\n')), checkAttrs(result));
