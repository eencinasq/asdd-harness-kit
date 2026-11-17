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

// Read-only mode (po-readonly-gate, G28): the PO/PM shaping session sets HARNESS_GATE_MODE=readonly. Deny by default;
// only these read commands pass, segment by segment. A denylist cannot enumerate every way a shell writes.
const ASDD = String.raw`(?:node\s+(?:\S*\/)?cli\/bin\/asdd\.mjs|npx\s+asdd(?:-harness-kit)?|asdd)`;
const READONLY_COMMANDS = [
  /^(?:ls|cat|head|tail|wc|pwd|echo|printf|grep|rg|cut|tr|uniq|which|basename|dirname|date|true|test|jq|stat|file|tree)\b/,
  /^sort\b(?!.*\s-o\b)/,
  /^find\b(?!.*\s-(?:delete|exec|execdir|ok|okdir|fprint|fprint0|fprintf|fls)\b)/,
  /^git\s+(?:status|log|diff|show|rev-parse|ls-files|blame|grep|shortlog|describe)\b/,
  /^git\s+branch(?:\s+(?:-a|-r|-v|-vv|--list|--show-current|--contains\s+\S+))*\s*$/,
  new RegExp(`^${ASDD}\\s+(?:status|drift|check|check-config|doctor|converge|waves|portfolio|skill-eval|help|--version|knowledge\\s+(?:search|trace|slice|status|patterns|sync))\\b`),
  new RegExp(`^${ASDD}\\s+intake\\b.*\\s--dry-run\\b`),
  /^codegraph\s+(?:explore|query|context|node|files|status|sync|init)\b/,
  /^gh\s+(?:issue|pr)\s+(?:view|list|status)\b/,
  /^gh\s+search\b/,
];

/** True when the session runs the gate in read-only mode (HARNESS_GATE_MODE=readonly). */
export function isReadonlyMode(env = process.env) {
  return String(env?.HARNESS_GATE_MODE ?? '').trim().toLowerCase() === 'readonly';
}

/** Read-only verdict: every segment must be an allowlisted read; no file redirection, no command substitution. */
export function readonlyVerdict(command) {
  const text = String(command || '').trim();
  if (!text) return { allowed: false, reason: 'empty command' };
  if (/\$\(|`|<\(|>\(/.test(text)) return { allowed: false, reason: 'command substitution is not allowed in read-only mode' };
  const stripped = text.replace(/\d?>&\d/g, ' ').replace(/(?:\d|&)?>>?\s*\/dev\/null/g, ' ');
  if (/>/.test(stripped)) return { allowed: false, reason: 'writing to a file is not allowed in read-only mode' };
  for (const raw of stripped.split(/&&|\|\||;|\||\n/)) {
    const segment = raw.trim().replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+/, '');
    if (!segment) continue;
    if (!READONLY_COMMANDS.some((re) => re.test(segment))) {
      return { allowed: false, reason: `"${segment.split(/\s+/).slice(0, 3).join(' ')}" is not a read-only command` };
    }
  }
  return { allowed: true, reason: 'read-only allowlist' };
}

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
    writeCommandSignal(root, isReadonlyMode() ? 'readonly' : deniedLabel(command) ?? 'unknown', { runtime });
  } catch {
    // ignore
  }
}

export async function checkCommandSafety(command, { override = false, env = process.env } = {}) {
  // Read-only mode: the override flag does not apply (the PO session cannot opt out of it).
  if (isReadonlyMode(env)) {
    const v = readonlyVerdict(command);
    return v.allowed
      ? { allowed: true, method: 'readonly-allow', reason: v.reason, confidence: 1 }
      : { allowed: false, method: 'readonly-deny', reason: `${v.reason}; this session is read-only (HARNESS_GATE_MODE=readonly)`, confidence: 1 };
  }
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
