import fs from 'node:fs';
import { join } from 'node:path';
import { MAX_LINE_BYTES, STREAM_FILE, TELEMETRY_DIR, readTail, validateSpan } from '../telemetry-lib.mjs';

/**
 * Telemetry validator (REQ-019, ADR-006; slice telemetry-emitters). WARN-only sensor:
 * - silent when .harness/state/telemetry/ is absent (no finding, nothing read beyond that check);
 * - TEL-W1: the schema file is missing or does not parse as JSON;
 * - TEL-W2: one WARN per bad line in the bounded tail (readTail: not JSON, schema errors, over 4,096 bytes with
 *   its LF, no attributes.trace_source), numbered per OI-5 (design §4.4);
 * - TEL-W3 (OI-7, design §8): registration incomplete (gitignore lines, contract files, runtime load hook).
 * Reads only; never writes (REQ-006). check-invariants loads it with a guarded import, maps fail to warn, and keeps
 * its WARNs out of the learning signal.
 */

const STREAM_PATH = `${TELEMETRY_DIR}/${STREAM_FILE}`;
const SCHEMA_FILE = 'telemetry.schema.json';
const CONTRACT_FILES = [SCHEMA_FILE, 'README.md'];
const IGNORE_LINES = [STREAM_PATH, `${TELEMETRY_DIR}/slices/`];
const FIX = 'run `asdd install .`';
const MAX_SCHEMA_ERRORS = 3;
// The installed (shell wrapper "$b") and kit-self (asdd.mjs) observe commands (design §12.2, TASK-014).
const OBSERVE_CMD = /(asdd(\.mjs)?|"\$b") observe\b/;
const LOAD_HOOKS = {
  claude: { file: '.claude/settings.json', event: 'PostToolUse' },
  cursor: { file: '.cursor/hooks.json', event: 'beforeReadFile' },
};

function readJsonFile(path) {
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function schemaFinding(root) {
  const path = join(root, TELEMETRY_DIR, SCHEMA_FILE);
  if (!fs.existsSync(path)) return { schema: null, finding: `TEL-W1 ${TELEMETRY_DIR}/${SCHEMA_FILE} is missing; span lines are not schema-checked` };
  try {
    return { schema: JSON.parse(fs.readFileSync(path, 'utf8')), finding: null };
  } catch (err) {
    return { schema: null, finding: `TEL-W1 ${TELEMETRY_DIR}/${SCHEMA_FILE} does not parse as JSON (${err.message}); span lines are not schema-checked` };
  }
}

function lineProblems(text, schema) {
  const problems = [];
  if (Buffer.byteLength(text, 'utf8') + 1 > MAX_LINE_BYTES) problems.push(`exceeds ${MAX_LINE_BYTES} bytes`);
  let span;
  try {
    span = JSON.parse(text);
  } catch {
    problems.push('not JSON');
    return problems;
  }
  if (schema) {
    const errors = validateSpan(span, schema);
    if (errors.length) {
      const more = errors.length > MAX_SCHEMA_ERRORS ? ` (+${errors.length - MAX_SCHEMA_ERRORS} more)` : '';
      problems.push(`schema: ${errors.slice(0, MAX_SCHEMA_ERRORS).join('; ')}${more}`);
    }
  }
  const attrs = span && typeof span === 'object' ? span.attributes : undefined;
  if (!attrs || typeof attrs !== 'object' || !Object.hasOwn(attrs, 'trace_source')) problems.push('missing attributes.trace_source');
  return problems;
}

function lineFindings(root, schema) {
  const tail = readTail(root);
  const label = (n) =>
    tail.fromStart
      ? `${STREAM_PATH} line ${n}`
      : `${STREAM_PATH} tail line ${n} (numbered from the start of the last ${tail.lines.length} lines read; the file is longer)`;
  const findings = [];
  for (const { n, text } of tail.lines) {
    const problems = lineProblems(text, schema);
    if (problems.length) findings.push(`TEL-W2 ${label(n)}: ${problems.join('; ')}`);
  }
  return findings;
}

function hasObserveEntry(config, event) {
  const entries = config?.hooks?.[event];
  if (!Array.isArray(entries)) return false;
  const commands = entries.flatMap((e) => [e?.command, ...(Array.isArray(e?.hooks) ? e.hooks.map((h) => h?.command) : [])]);
  return commands.some((c) => typeof c === 'string' && OBSERVE_CMD.test(c));
}

function registrationFindings(root) {
  const findings = [];
  let ignored = [];
  try {
    ignored = fs.readFileSync(join(root, '.gitignore'), 'utf8').split(/\r?\n/).map((l) => l.trim());
  } catch {
    /* no .gitignore: every line is missing */
  }
  const missingIgnores = IGNORE_LINES.filter((l) => !ignored.includes(l));
  if (missingIgnores.length) findings.push(`TEL-W3 .gitignore lacks ${missingIgnores.join(', ')}; ${FIX}`);

  const missingFiles = CONTRACT_FILES.filter((f) => !fs.existsSync(join(root, TELEMETRY_DIR, f)));
  if (missingFiles.length) findings.push(`TEL-W3 ${TELEMETRY_DIR}/ lacks ${missingFiles.join(', ')}; ${FIX}`);

  const project = readJsonFile(join(root, '.harness/config/project.json'));
  const runtimes = Array.isArray(project?.runtimes) ? project.runtimes : [];
  for (const [runtime, hook] of Object.entries(LOAD_HOOKS)) {
    if (!runtimes.includes(runtime)) continue;
    if (!hasObserveEntry(readJsonFile(join(root, hook.file)), hook.event)) {
      findings.push(`TEL-W3 runtime ${runtime}: ${hook.file} ${hook.event} has no asdd observe entry (guidance loads are not recorded); ${FIX}`);
    }
  }
  return findings;
}

/** All telemetry WARN messages for root; [] when the telemetry location is absent. */
export function telemetryFindings(root) {
  if (!fs.existsSync(join(root, TELEMETRY_DIR))) return [];
  const { schema, finding } = schemaFinding(root);
  return [...(finding ? [finding] : []), ...lineFindings(root, schema), ...registrationFindings(root)];
}

export default function validate(ctx) {
  for (const msg of telemetryFindings(ctx.root)) ctx.warn(msg);
}
