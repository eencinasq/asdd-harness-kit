// GENERATED from cli/src/harness/command-gate.mjs by asdd kit vendor: edit the source, then rerun it.
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

// Learning is best-effort and lazy: a missing lib must never change the verdict.
async function recordDenial(command, runtime) {
  try {
    const root = process.cwd();
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

async function runHook() {
  const input = readStdin();
  const isClaude = input.hook_event_name === 'PreToolUse';
  const command = isClaude
    ? String(input.tool_input?.command ?? '')
    : typeof input.command === 'string' ? input.command : '';
  const verdict = command
    ? await checkCommandSafety(command, { override: input.override === true })
    : { allowed: true, method: 'no-command', reason: 'no command in hook payload' };
  if (!verdict.allowed) await recordDenial(command, isClaude ? 'claude' : 'cursor');

  if (isClaude) {
    const output = {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: verdict.allowed ? 'allow' : 'deny',
      },
    };
    if (!verdict.allowed) {
      output.hookSpecificOutput.permissionDecisionReason =
        `Blocked by harness command gate (${verdict.method}): ${verdict.reason || 'unsafe command'}. Ask the user to confirm before retrying.`;
    }
    process.stdout.write(`${JSON.stringify(output)}\n`);
    return;
  }

  const output = { permission: verdict.allowed ? 'allow' : 'deny' };
  if (!verdict.allowed) {
    output.user_message = `Blocked by harness command gate (${verdict.method}): ${verdict.reason || 'unsafe command'}`;
    output.agent_message = `Command denied by the asdd command gate (${verdict.method}). Ask the user to confirm and retry with an explicit override if it is intentional.`;
  }
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

/** Hook entrypoint: read the payload on stdin, print the verdict JSON. Never exits non-zero. */
export async function runHookCli() {
  await runHook().catch((error) => {
    const claudeDeny = {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `Command gate error: ${error.message}`,
      },
    };
    process.stdout.write(
      `${JSON.stringify({ permission: 'deny', user_message: `Command gate error: ${error.message}`, ...claudeDeny })}\n`
    );
    process.exitCode = 0;
  });
}
