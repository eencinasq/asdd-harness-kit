/**
 * `asdd observe <runtime>` — runtime-hook adapter for guidance activation records (slice telemetry-emitters,
 * design §12.3, ADR-002/003/004). REQ-013, REQ-015, REQ-016, REQ-018.
 *
 * CLI use (until TASK-014 registers `asdd observe`): `node cli/src/harness/telemetry-observe.mjs <runtime>`.
 *   Claude Code `PostToolUse` (matcher `Read|Skill`): stdin payload → no stdout, exit 0.
 *   Cursor: hookless default until TASK-012 (D-3) → stdout `{"permission":"allow"}`, exit 0, no span.
 *   Any other or missing runtime argv → no stdout, exit 0, no span.
 *
 * Fail-open: always exits 0 and never writes to stderr. Exit 2 would send stderr to the model (fixtures README, OI-6).
 * Reads only the payload key paths in PAYLOAD_KEYS (ADR-004: each one occurs in a committed fixture); a missing key
 * means the attribute is omitted, a missing path or skill name means no record (REQ-016). Not vendored (ADR-003).
 */
import * as telemetry from './telemetry-lib.mjs';

export const CURSOR_ALLOW = '{"permission":"allow"}\n';

/** Key paths read per runtime, by role. Cursor keys arrive with TASK-012 only on a `ship` D-3 outcome. */
export const PAYLOAD_KEYS = Object.freeze({
  claude: Object.freeze({
    event: 'hook_event_name',
    tool: 'tool_name',
    read_path: 'tool_input.file_path',
    skill_name: 'tool_input.skill',
    session: 'session_id',
    agent: 'agent_id',
  }),
});

const ANSWERS = Object.freeze({ claude: '', cursor: CURSOR_ALLOW });
const CLAUDE_EVENT = 'PostToolUse';
const ID_RE = /^[A-Za-z0-9._:-]+$/;
const ID_MAX = 128;

function keyPath(payload, path) {
  let cur = payload;
  for (const key of path.split('.')) {
    if (!cur || typeof cur !== 'object' || Array.isArray(cur) || !Object.hasOwn(cur, key)) return undefined;
    cur = cur[key];
  }
  return cur;
}

/** A payload id copied as is when it is a short token, otherwise omitted (REQ-016: never coerced or guessed). */
function idOrUndefined(value) {
  return typeof value === 'string' && value.length <= ID_MAX && ID_RE.test(value) ? value : undefined;
}

/** Claude: the canonical target for a `PostToolUse` Read/Skill payload, or null. Read is string-only (no fs). */
function claudeTarget(payload, lib, root) {
  const keys = PAYLOAD_KEYS.claude;
  if (keyPath(payload, keys.event) !== CLAUDE_EVENT) return null;
  const tool = keyPath(payload, keys.tool);
  if (tool === 'Read') {
    const target = lib.guidanceTarget(keyPath(payload, keys.read_path), root);
    return target ? { tool, target } : null;
  }
  if (tool === 'Skill') {
    const name = keyPath(payload, keys.skill_name);
    if (typeof name !== 'string') return null;
    const target = lib.skillTarget(name, root);
    return target ? { tool, target } : null;
  }
  return null;
}

/**
 * Handles one hook payload. Returns `{ answer, span }`: `answer` is the exact stdout text for the runtime ('' for
 * Claude and unknown runtimes), `span` the record handed to emit or null. Never throws; never touches stdout,
 * stderr or process.exitCode. deps: { root, env, lib } (lib overrides telemetry-lib exports; tests only).
 */
export function handleObserve(raw, runtime, deps = {}) {
  if (typeof runtime !== 'string' || !Object.hasOwn(ANSWERS, runtime)) return { answer: '', span: null };
  const answer = ANSWERS[runtime];
  let span = null;
  try {
    if (runtime !== 'claude') return { answer, span };
    const root = deps.root ?? process.cwd();
    const env = deps.env ?? process.env;
    const lib = { ...telemetry, ...(deps.lib || {}) };
    const payload = JSON.parse(String(raw ?? ''));
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { answer, span };
    const hit = claudeTarget(payload, lib, root);
    if (!hit) return { answer, span };
    const { slice_id, phase } = lib.attribute(root, env);
    const ctx = lib.startTrace({ env, honorEnv: false });
    const built = lib.buildSpan(ctx, {
      kind: 'tool',
      process_name: 'asdd-observe',
      writer: 'runtime-hook',
      runtime: 'claude',
      slice_id,
      phase,
      attributes: {
        tool_name: hit.tool,
        target_path: hit.target,
        runtime_session_id: idOrUndefined(keyPath(payload, PAYLOAD_KEYS.claude.session)),
        agent_id: idOrUndefined(keyPath(payload, PAYLOAD_KEYS.claude.agent)),
      },
    });
    if (lib.emit(built, { root }) === true) span = built;
  } catch {
    span = null;
  }
  return { answer, span };
}

async function readStdin() {
  if (process.stdin.isTTY) return '';
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

/** Hook entrypoint: read stdin, write the runtime answer, exit 0 whatever happens. */
export async function runObserveCli(argv = process.argv.slice(2)) {
  const runtime = argv[0];
  const fallback = typeof runtime === 'string' && Object.hasOwn(ANSWERS, runtime) ? ANSWERS[runtime] : '';
  let answer = fallback;
  try {
    answer = handleObserve(await readStdin(), runtime).answer;
  } catch {
    answer = fallback;
  }
  try {
    if (answer) process.stdout.write(answer);
  } catch {
    /* host closed stdout: nothing to answer to */
  }
  process.exitCode = 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runObserveCli();
}
