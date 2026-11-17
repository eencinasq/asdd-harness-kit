/**
 * Telemetry library (slice telemetry-emitters, design §3.1): span ids, buildSpan, fail-open emit,
 * schema-subset validator, bounded tail reader, and policy (attribute, guidanceTarget, skillTarget).
 * Imports only node: built-ins (REQ-004) and never sync-state.mjs (cycle rule). Writes only .harness/state/telemetry/spans.jsonl (REQ-006).
 */
import fs from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';
import { randomBytes } from 'node:crypto';

export const TELEMETRY_DIR = '.harness/state/telemetry';
export const STREAM_FILE = 'spans.jsonl';
export const MAX_LINE_BYTES = 4096;
export const TAIL_MAX_LINES = 500;
export const TAIL_MAX_BYTES = 262144;
export const ATTRIBUTION_ENV = 'HARNESS_SLICE_ID';

const TRACE_ID_RE = /^[a-f0-9]{16,32}$/;
const SPAN_ID_RE = /^[a-f0-9]{8,16}$/;
// REQ-005: producers never emit these kinds or set evaluator-reserved attributes.
const FORBIDDEN_KINDS = new Set(['phase', 'turn', 'subagent', 'test']);
const RESERVED_ATTRIBUTES = ['heuristic', 'trigger_span_id', 'source'];

function hex(bytes) {
  return randomBytes(bytes).toString('hex');
}

/**
 * Root trace context. Env ids are honored only when honorEnv is true and HARNESS_TRACE_ID is valid;
 * otherwise ids are self-minted (trace 32 hex, span 16 hex) with no parent.
 */
export function startTrace({ env = process.env, honorEnv = true } = {}) {
  const traceId = env?.HARNESS_TRACE_ID;
  if (honorEnv && typeof traceId === 'string' && TRACE_ID_RE.test(traceId)) {
    const parent = env.HARNESS_SPAN_ID;
    return {
      trace_id: traceId,
      span_id: hex(8),
      parent_span_id: typeof parent === 'string' && SPAN_ID_RE.test(parent) ? parent : null,
      trace_source: 'env',
    };
  }
  return { trace_id: hex(16), span_id: hex(8), parent_span_id: null, trace_source: 'self' };
}

/** Child context: same trace and trace_source, new span id, parent = root span (REQ-005). */
export function childOf(root) {
  return { trace_id: root.trace_id, span_id: hex(8), parent_span_id: root.span_id, trace_source: root.trace_source };
}

function toMs(value, fallback) {
  if (value instanceof Date) return value.getTime();
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Builds a schema 1.0 span. fields: kind, process_name, status (default OK), runtime, slice_id, phase,
 * writer (default process_name), start/end (Date or epoch ms, default now), attributes, events.
 * undefined/null attributes are omitted (AR-7, TEL-8).
 */
export function buildSpan(ctx, fields = {}) {
  const now = Date.now();
  const start = toMs(fields.start, now);
  const end = toMs(fields.end, now);
  const attributes = { trace_source: ctx.trace_source };
  for (const [key, value] of Object.entries(fields.attributes || {})) {
    if (value !== undefined && value !== null) attributes[key] = value;
  }
  const span = {
    schema_version: '1.0',
    trace_id: ctx.trace_id,
    span_id: ctx.span_id,
    parent_span_id: ctx.parent_span_id ?? null,
    kind: fields.kind,
  };
  for (const key of ['slice_id', 'phase']) if (fields[key] !== undefined) span[key] = fields[key];
  span.process_name = fields.process_name;
  if (fields.runtime !== undefined) span.runtime = fields.runtime;
  span.start_time_iso = new Date(start).toISOString();
  span.end_time_iso = new Date(end).toISOString();
  span.duration_ms = Math.max(0, end - start);
  span.status = fields.status || 'OK';
  span.attributes = attributes;
  if (Array.isArray(fields.events)) span.events = fields.events;
  span.writer = fields.writer || fields.process_name;
  return span;
}

/**
 * Appends one span as one LF-terminated line (≤ MAX_LINE_BYTES) with one append-mode write.
 * Fail-open: never throws, never writes to stdout/stderr, never touches process.exitCode,
 * never creates the telemetry directory. Returns true only when the whole line was written.
 */
export function emit(span, { root = process.cwd() } = {}) {
  try {
    if (!span || typeof span !== 'object' || Array.isArray(span)) return false;
    if (FORBIDDEN_KINDS.has(span.kind)) return false;
    const attrs = span.attributes;
    if (attrs && typeof attrs === 'object' && RESERVED_ATTRIBUTES.some((k) => Object.hasOwn(attrs, k))) return false;
    const json = JSON.stringify(span);
    if (typeof json !== 'string') return false;
    const buf = Buffer.from(`${json}\n`, 'utf8');
    if (buf.length > MAX_LINE_BYTES) return false;
    // 'a' creates spans.jsonl when the directory exists; a missing directory fails with ENOENT.
    const fd = fs.openSync(join(root, TELEMETRY_DIR, STREAM_FILE), 'a');
    try {
      return fs.writeSync(fd, buf) === buf.length;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return false;
  }
}

// --- validateSpan: the draft-07 subset telemetry.schema.json uses ---

const DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/i;

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function matchesType(value, type) {
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  return typeOf(value) === type;
}

function check(value, schema, path, errors) {
  if (!schema || typeof schema !== 'object') return;
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchesType(value, t))) {
      errors.push(`${path}: expected type ${types.join('|')}, got ${typeOf(value)}`);
      return;
    }
  }
  if (Object.hasOwn(schema, 'const') && value !== schema.const) {
    errors.push(`${path}: must equal ${JSON.stringify(schema.const)}`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(`${path}: ${JSON.stringify(value)} is not one of ${JSON.stringify(schema.enum)}`);
  }
  if (typeof value === 'string') {
    if (schema.pattern !== undefined && !new RegExp(schema.pattern, 'u').test(value)) {
      errors.push(`${path}: does not match ${schema.pattern}`);
    }
    if (schema.minLength !== undefined && [...value].length < schema.minLength) {
      errors.push(`${path}: shorter than ${schema.minLength}`);
    }
    if (schema.format === 'date-time' && (!DATE_TIME_RE.test(value) || Number.isNaN(Date.parse(value)))) {
      errors.push(`${path}: not a date-time`);
    }
  }
  if (typeof value === 'number' && schema.minimum !== undefined && value < schema.minimum) {
    errors.push(`${path}: below minimum ${schema.minimum}`);
  }
  if (Array.isArray(value) && schema.items) {
    value.forEach((item, i) => check(item, schema.items, `${path}[${i}]`, errors));
  }
  if (typeOf(value) === 'object') {
    for (const key of schema.required || []) {
      if (!Object.hasOwn(value, key)) errors.push(`${path}: missing required ${key}`);
    }
    const props = schema.properties || {};
    for (const [key, child] of Object.entries(value)) {
      if (Object.hasOwn(props, key)) check(child, props[key], `${path}.${key}`, errors);
      else if (schema.additionalProperties === false) errors.push(`${path}: unknown property ${key}`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        check(child, schema.additionalProperties, `${path}.${key}`, errors);
      }
    }
  }
}

/** Validates obj against the schema object (read from telemetry.schema.json); returns error strings. */
export function validateSpan(obj, schema) {
  const errors = [];
  try {
    check(obj, schema, '$', errors);
  } catch (err) {
    errors.push(`$: validator error ${err?.message || err}`);
  }
  return errors;
}

/**
 * Bounded tail of the stream (REQ-022): one readSync of at most TAIL_MAX_BYTES. When the window starts
 * after byte 0, its first byte is only the "preceding byte": if it is not LF the cut first line is dropped.
 * Returns the last TAIL_MAX_LINES lines, numbered from 1 within the tail; total = complete lines in the window.
 */
export function readTail(root) {
  const empty = { lines: [], fromStart: true, total: 0 };
  let fd;
  try {
    fd = fs.openSync(join(root, TELEMETRY_DIR, STREAM_FILE), 'r');
  } catch {
    return empty;
  }
  try {
    const size = fs.fstatSync(fd).size;
    const length = Math.min(size, TAIL_MAX_BYTES);
    const start = size - length;
    const buf = Buffer.alloc(length);
    const got = fs.readSync(fd, buf, 0, length, start);
    let text = buf.subarray(0, got).toString('utf8');
    if (start > 0) {
      const precededByLf = text[0] === '\n';
      text = text.slice(1);
      if (!precededByLf) {
        const lf = text.indexOf('\n');
        text = lf === -1 ? '' : text.slice(lf + 1);
      }
    }
    const all = text.split('\n');
    if (all.at(-1) === '') all.pop();
    const kept = all.slice(-TAIL_MAX_LINES);
    return {
      lines: kept.map((line, i) => ({ n: i + 1, text: line })),
      fromStart: start === 0 && kept.length === all.length,
      total: all.length,
    };
  } catch {
    return empty;
  } finally {
    try {
      fs.closeSync(fd);
    } catch {
      /* ignore */
    }
  }
}

// --- Policy (TASK-004): attribution and guidance targets ---

const SLICE_ID_RE = /^[a-z0-9_-]+$/;
// telemetry.schema.json `phase` enum (string members); anything else -> unattributed so a span stays valid.
const PHASES = new Set([
  'discovery',
  'spec',
  'validation',
  'domain',
  'design',
  'task_planning',
  'implementation',
  'qa',
  'refactor',
  'knowledge',
]);
const SKILL_NAME_RE = /^[A-Za-z0-9._-]+$/;
const SKILL_ALIAS_ROOTS = new Set(['.agents', '.claude', '.cursor', '.devin']);
const NONE = Object.freeze({ slice_id: null, phase: null });

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** { slice_id, phase } from the slice's generated manifest, or both null (missing, unparsable, phase off-enum). */
function sliceFromManifest(root, id) {
  if (typeof id !== 'string' || !SLICE_ID_RE.test(id)) return { ...NONE };
  const manifest = readJson(join(root, '.harness/state/slices', id, 'manifest.json'));
  const phase = manifest && typeof manifest === 'object' ? manifest.phase : undefined;
  return PHASES.has(phase) ? { slice_id: id, phase } : { ...NONE };
}

/**
 * REQ-017 / design §4.3 (OI-1). Rule 1: HARNESS_SLICE_ID set -> that slice + its manifest phase when the id is valid
 * and the manifest parses, else both null (never falls through). Rule 2: exactly one `in_progress` slice in
 * registry.json -> that slice + its manifest phase. Rule 3: both null. Reads only registry.json and one manifest;
 * never consults trace ids.
 */
export function attribute(root = process.cwd(), env = process.env) {
  try {
    const explicit = env ? env[ATTRIBUTION_ENV] : undefined;
    if (explicit !== undefined) return sliceFromManifest(root, explicit);
    const registry = readJson(join(root, '.harness/state/registry.json'));
    const slices = registry && Array.isArray(registry.slices) ? registry.slices : [];
    const live = slices.filter((s) => s && typeof s === 'object' && s.status === 'in_progress');
    return live.length === 1 ? sliceFromManifest(root, live[0].slice_id) : { ...NONE };
  } catch {
    return { ...NONE };
  }
}

/** `<n>/SKILL.md` or `<n>/references/**` under a skills tree; null otherwise. */
function skillRest(segments) {
  const [name, ...rest] = segments;
  if (!name || !SKILL_NAME_RE.test(name)) return null;
  if (rest.length === 1 && rest[0] === 'SKILL.md') return segments;
  if (rest.length >= 2 && rest[0] === 'references') return segments;
  return null;
}

/**
 * REQ-015 / design §12.4: canonical repo-relative guidance path or null. String operations only (no stat/realpath).
 * Keeps `.harness/steering/**` and `.agents/skills/<n>/(SKILL.md|references/**)`; rewrites the `.claude`, `.cursor`
 * and `.devin` skills aliases to `.agents/skills/`. Rejects NUL, `..` segments, `:` and paths outside root.
 */
export function guidanceTarget(raw, root) {
  try {
    if (typeof raw !== 'string' || raw === '' || raw.includes('\0')) return null;
    let rel = raw;
    if (isAbsolute(raw)) {
      if (typeof root !== 'string' || root === '') return null;
      rel = relative(root, raw);
    }
    if (rel.startsWith('..') || isAbsolute(rel)) return null;
    const posix = rel.split(sep).join('/').replace(/\\/g, '/');
    if (posix.includes(':')) return null;
    const parts = posix.split('/');
    if (parts.includes('..')) return null;
    const segments = parts.filter((p) => p !== '' && p !== '.');
    const [top, second, ...rest] = segments;
    if (top === '.harness' && second === 'steering' && rest.length >= 1) return segments.join('/');
    if (SKILL_ALIAS_ROOTS.has(top) && second === 'skills') {
      const kept = skillRest(rest);
      return kept ? ['.agents', 'skills', ...kept].join('/') : null;
    }
    return null;
  } catch {
    return null;
  }
}

/** Skill tool name -> `.agents/skills/<name>/SKILL.md` only when that file exists; `:`, `/`, `..` -> null. */
export function skillTarget(name, root = process.cwd()) {
  try {
    if (typeof name !== 'string' || !SKILL_NAME_RE.test(name) || name === '.' || name.includes('..')) return null;
    const target = `.agents/skills/${name}/SKILL.md`;
    return fs.statSync(join(root, target)).isFile() ? target : null;
  } catch {
    return null;
  }
}
