/**
 * Command safety gate. Pattern whitelist/deny first; Jev noul only for dangerous commands.
 *
 * Library use:
 *   import { checkCommandSafety } from './jev-command-gate.mjs';
 *
 * CLI use (runtime hook contracts, auto-detected from the stdin payload):
 *   Cursor `beforeShellExecution`:  stdin {"command": "...", ...}
 *     → stdout {"permission": "allow"|"deny", "user_message": "...", "agent_message": "..."}
 *   Claude Code `PreToolUse` (Bash): stdin {"hook_event_name": "PreToolUse", "tool_input": {"command": "..."}, ...}
 *     → stdout {"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "allow"|"deny", "permissionDecisionReason": "..."}}
 *   Always exits 0 with a JSON verdict; hooks should set failClosed: true
 *   so a gate crash blocks the command instead of letting it through.
 */
import { readFileSync } from 'node:fs';
import { jevNoul } from './jev-client.mjs';

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

export async function checkCommandSafety(command, { override = false } = {}) {
  if (override) {
    return { allowed: true, method: 'override', reason: 'Manual override specified' };
  }
  if (!isDangerousCommand(command)) {
    return { allowed: true, method: 'pattern-whitelist', reason: 'Command does not match dangerous patterns', confidence: 1 };
  }
  const result = await jevNoul(
    'Is this command safe to execute?',
    { command, workingDir: process.cwd() },
    ['not destructive', 'not modifying secrets', 'not force-pushing to protected branches'],
    0
  );
  if (result._unavailable) {
    return {
      allowed: false,
      method: 'jev-unavailable',
      reason: result._reason,
      prob_yes: 0
    };
  }
  const allowed = result.prob_yes >= 0.8;
  return {
    allowed,
    method: 'jev-noul',
    reason: result.reasoning,
    prob_yes: result.prob_yes,
    confidence: result.confidence
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
    output.agent_message = `Command denied by .harness/scripts/jev-command-gate.mjs (${verdict.method}). Ask the user to confirm and retry with an explicit override if it is intentional.`;
  }
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runHook().catch((error) => {
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
