/**
 * Command safety gate — pattern whitelist/deny only.
 *
 * Library use:
 *   import { checkCommandSafety } from './command-gate.mjs';
 *
 * Formerly jev-command-gate.mjs. Hooks call it as `asdd gate`; the installer rewrites hook
 * entries that still name .harness/scripts/command-gate.mjs or jev-command-gate.mjs.
 *
 * CLI use (runtime hook contracts, auto-detected from the stdin payload):
 *   Cursor `beforeShellExecution`:  stdin {"command": "...", ...}
 *     → stdout {"permission": "allow"|"deny", "user_message": "...", "agent_message": "..."}
 *   Claude Code `PreToolUse` (Bash): stdin {"hook_event_name": "PreToolUse", "tool_input": {"command": "..."}, ...}
 *     → stdout {"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "allow"|"deny", "permissionDecisionReason": "..."}}
 *   Always exits 0 with a JSON verdict; hooks should set failClosed: true
 *   so a gate crash blocks the command instead of letting it through.
 *   A hook denial is recorded as a learning signal by pattern label (never the command text).
 *   After the verdict is written, each hook call appends one `command` span (verdict + command_label, never the
 *   command text) through a guarded import of telemetry-lib.mjs; a telemetry failure never changes the verdict.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DANGEROUS_PATTERNS = [
  /^rm\s+-rf/,
  /^rm\s+-r\s/,
  /^drop\s+database/i,
  /^truncate\s+table/i,
  /^git\s+push\s+--force/,
  /^git\s+push\s+-f\b/,
  /^git\s+reset\s+--hard/,
  /^dd\s+if=/,
  /^mkfs/,
  /^chmod\s+777/,
  /^chmod\s+-R\s+777/
];

const ALLOWED_COMMANDS = [
  /^git\s+status/,
  /^git\s+diff/,
  /^git\s+log/,
  /^git\s+branch/,
  /^git\s+add/,
  /^ls\b/,
  /^cat\b/,
  /^echo\b/,
  /^pwd\b/,
  /^node\s+\.harness\/scripts/,
  /^npm\s+test/,
  /^npm\s+run/,
  /^node\s+--test/
];

export function isDangerousCommand(command) {
  const text = String(command || '').trim();
  if (!text) return true;
  if (ALLOWED_COMMANDS.some((pattern) => pattern.test(text))) return false;
  if (DANGEROUS_PATTERNS.some((pattern) => pattern.test(text))) return true;
  if (text.startsWith('sudo ')) return true;
  return false;
}

/** Which dangerous pattern a command hit, as a short label (`git push --force`, `sudo`), or null. */
export function deniedLabel(command) {
  const text = String(command || '').trim();
  if (!text) return 'empty';
  if (ALLOWED_COMMANDS.some((pattern) => pattern.test(text))) return null;
  for (const pattern of DANGEROUS_PATTERNS) {
    const m = text.match(pattern);
    if (m) return m[0].trim().toLowerCase().replace(/\s+/g, ' ');
  }
  return text.startsWith('sudo ') ? 'sudo' : null;
}

/**
 * Span label from the closed set (REQ-007, ADR-007 AMB-009): `override`, `empty`, the denied pattern label,
 * `allowlist`, or `unmatched`. Never command text beyond the pattern label.
 */
export function commandLabel(command, verdict) {
  if (verdict?.method === 'override') return 'override';
  if (verdict?.method === 'no-command') return 'empty';
  if (verdict?.method === 'pattern-deny') return deniedLabel(command) ?? 'unmatched';
  const text = String(command || '').trim();
  if (!text) return 'empty';
  return ALLOWED_COMMANDS.some((pattern) => pattern.test(text)) ? 'allowlist' : 'unmatched';
}

/** Span runtime (ACT-002, D-2): claude for PreToolUse, cursor for a Cursor-shaped payload, else cli. */
export function gateRuntime(input) {
  if (!input || typeof input !== 'object') return 'cli';
  if (input.hook_event_name === 'PreToolUse') return 'claude';
  if (Object.hasOwn(input, 'command') || input.hook_event_name === 'beforeShellExecution') return 'cursor';
  return 'cli';
}

// Telemetry is best-effort and runs only after the verdict is written (ADR-001): a missing or broken lib, a throw,
// or emit() returning false is a no-op.
async function emitGateSpan(root, { runtime, start, end, status, attributes }) {
  const tel = await import('./telemetry-lib.mjs').catch(() => null);
  try {
    if (!tel) return;
    const where = root ?? process.cwd();
    const { slice_id, phase } = tel.attribute(where);
    const span = tel.buildSpan(tel.startTrace(), {
      kind: 'command',
      process_name: 'command-gate',
      runtime,
      slice_id,
      phase,
      start,
      end,
      status,
      attributes,
    });
    tel.emit(span, { root: where });
  } catch {
    // ignore
  }
}

// Learning is best-effort and lazy: a missing lib must never change the verdict.
async function recordDenial(command, runtime, where) {
  try {
    const root = where ?? process.cwd();
    if (!existsSync(join(root, '.harness'))) return;
    const { writeCommandSignal } = await import('./learning-lib.mjs');
    writeCommandSignal(root, deniedLabel(command) ?? 'unknown', { runtime });
  } catch {
    // ignore
  }
}

export async function checkCommandSafety(command, { override = false } = {}) {
  if (override) {
    return { allowed: true, method: 'override', reason: 'Manual override specified' };
  }
  if (!isDangerousCommand(command)) {
    return { allowed: true, method: 'pattern-whitelist', reason: 'Command does not match dangerous patterns', confidence: 1 };
  }
  // Fail-closed on dangerous patterns.
  return {
    allowed: false,
    method: 'pattern-deny',
    reason: 'Command matches a dangerous pattern; ask the user to confirm and retry with override if intentional',
    confidence: 1,
  };
}

function readStdin() {
  try {
    const raw = readFileSync(0, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

const writeStdout = (line) => process.stdout.write(line);

/**
 * One hook call: read the payload, write the verdict JSON, then emit one `command` span (REQ-007).
 * Seam for tests: `readInput`, `write`, `safety` (defaults: stdin, stdout, checkCommandSafety), `root` for the
 * telemetry stream (default cwd), and `state`, which runHookCli reads on its error path.
 */
export async function runHook({ readInput = readStdin, write = writeStdout, safety = checkCommandSafety, root, state = {} } = {}) {
  state.start = Date.now();
  const input = readInput();
  state.input = input;
  const isClaude = input.hook_event_name === 'PreToolUse';
  const command = isClaude
    ? String(input.tool_input?.command ?? '')
    : typeof input.command === 'string' ? input.command : '';
  const verdict = command
    ? await safety(command, { override: input.override === true })
    : { allowed: true, method: 'no-command', reason: 'no command in hook payload' };
  if (!verdict.allowed) await recordDenial(command, isClaude ? 'claude' : 'cursor', root);

  let output;
  if (isClaude) {
    output = {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: verdict.allowed ? 'allow' : 'deny',
      },
    };
    if (!verdict.allowed) {
      output.hookSpecificOutput.permissionDecisionReason =
        `Blocked by harness command gate (${verdict.method}): ${verdict.reason || 'unsafe command'}. Ask the user to confirm before retrying.`;
    }
  } else {
    output = { permission: verdict.allowed ? 'allow' : 'deny' };
    if (!verdict.allowed) {
      output.user_message = `Blocked by harness command gate (${verdict.method}): ${verdict.reason || 'unsafe command'}`;
      output.agent_message = `Command denied by the asdd command gate (${verdict.method}). Ask the user to confirm and retry with an explicit override if it is intentional.`;
    }
  }
  state.label = commandLabel(command, verdict);
  write(`${JSON.stringify(output)}\n`);
  const end = Date.now();

  await emitGateSpan(root, {
    runtime: gateRuntime(input),
    start: state.start,
    end,
    status: 'OK',
    attributes: { verdict: verdict.allowed ? 'allow' : 'deny', command_label: state.label },
  });
}

/** Hook entrypoint: read the payload on stdin, print the verdict JSON. Never exits non-zero. Accepts runHook's seam. */
export async function runHookCli(deps = {}) {
  const write = deps.write ?? writeStdout;
  const state = {};
  await runHook({ ...deps, write, state }).catch(async (error) => {
    const claudeDeny = {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `Command gate error: ${error.message}`,
      },
    };
    write(
      `${JSON.stringify({ permission: 'deny', user_message: `Command gate error: ${error.message}`, ...claudeDeny })}\n`
    );
    process.exitCode = 0;
    // REQ-007: the error path still emits its span, after the deny is written (fail-closed first).
    await emitGateSpan(deps.root, {
      runtime: gateRuntime(state.input),
      start: state.start,
      end: Date.now(),
      status: 'ERROR',
      attributes: { verdict: 'deny', command_label: state.label },
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runHookCli();
}
