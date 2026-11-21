/**
 * Telemetry library (slice telemetry-emitters, design §3.1): span ids, buildSpan, fail-open emit,
 * schema-subset validator, bounded tail reader, policy (attribute, guidanceTarget, skillTarget), and the pure
 * profile model (phaseMarkers, percentile, surfaceScores, activationRows, profileModel; design §4.5–§4.6).
 * Imports only node: built-ins (REQ-004) and never sync-state.mjs (cycle rule). Writes only .harness/state/telemetry/spans.jsonl (REQ-006).
 */
import fs, { existsSync, openSync, closeSync, writeSync, readSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';

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
// The agent dispatch seam (`asdd span`) and runtime hooks observe turns and subagent dispatches directly.
const DISPATCH_WRITERS = new Set(['asdd-span', 'runtime-hook']);
const DISPATCH_KINDS = new Set(['turn', 'subagent']);

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
    // REQ-005: reserved kinds are evaluator-synthesized; producers may not emit them. Carve-outs: the
    // synthesizers themselves (rollup/heuristic-evaluator writers, synthesized trace_source), and the
    // gate-seam test classifier (kind 'test' is a producer observation when test_runner identifies the runner),
    // and turn/subagent spans from the dispatch seam (asdd-span/runtime-hook writers).
    const attrs = span.attributes;
    const synth = span.writer === 'heuristic-evaluator' || span.writer === 'rollup' || attrs?.trace_source === 'synthesized';
    const producerTest = span.kind === 'test' && typeof attrs?.test_runner === 'string';
    const dispatch = DISPATCH_KINDS.has(span.kind) && DISPATCH_WRITERS.has(span.writer);
    if (FORBIDDEN_KINDS.has(span.kind) && !synth && !producerTest && !dispatch) return false;
    if (builtinSpanProblems(span).length) return false;
    let json = JSON.stringify(span);
    if (typeof json !== 'string') return false;
    let buf = Buffer.from(`${json}\n`, 'utf8');
    if (buf.length > MAX_LINE_BYTES) {
      // Oversize by events: retry once with the payload dropped (minted-span contract).
      const { events, ...rest } = span;
      buf = Buffer.from(`${JSON.stringify({ ...rest, events: [] })}\n`, 'utf8');
      if (buf.length > MAX_LINE_BYTES) return false;
    }
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
  if (schema === undefined) return builtinSpanProblems(obj);
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
export function readTail(root, { maxLines = TAIL_MAX_LINES, maxBytes = TAIL_MAX_BYTES } = {}) {
  const empty = { lines: [], fromStart: true, total: 0 };
  let fd;
  try {
    fd = fs.openSync(join(root, TELEMETRY_DIR, STREAM_FILE), 'r');
  } catch {
    return empty;
  }
  try {
    const size = fs.fstatSync(fd).size;
    const length = Math.min(size, maxBytes);
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
    const kept = all.slice(-maxLines);
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

// --- Profile model (TASK-011, design §4.5–§4.6): pure functions over arrays ---
// No filesystem, no clock, no trace topology: grouping keys are only slice_id, phase, kind, failure_signature (AR-10).

const SURFACES = ['command', 'hook', 'sync'];
// Runtimes with load hooks (design §12.1). Only these can render `not observed`.
const HOOKED_RUNTIMES = new Set(['claude', 'cursor']);
const NOT_MEASURED = Object.freeze(['turn_latency', 'boot_tax', 'tokens', 'h_findings']);
const UNKNOWN = 'unknown';
const NOT_OBSERVED = 'not observed';
const CONFIGURED = 'configured, not observed';

/** REQ-021 legend: exactly three states (TEL-7). */
export const ACTIVATION_LEGEND = Object.freeze([
  Object.freeze({ state: NOT_OBSERVED, meaning: 'a runtime with load hooks reported no load' }),
  Object.freeze({
    state: UNKNOWN,
    meaning:
      'the load is not visible to the kit (loads through shell commands, and every load on a runtime without load hooks)',
  }),
  Object.freeze({ state: CONFIGURED, meaning: 'the file enters context without a tool call' }),
]);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * REQ-020 / ADR-005 disjoint segments. Sorted phase events (completion before start on a tie, then phase name, so the
 * input order never matters): each phase_completed(P) owns (previous phase event of any phase, its own time].
 * phase_started is an anchor only; phase_blocked and other events are ignored. A completed phase gets
 * { start_iso, end_iso, duration_ms (sum of its segments), start_source, segments }; `open_since_iso` when the slice's
 * last phase event re-opens it. A phase with only phase_started is `open`: no end, no duration (no "now").
 */
export function phaseMarkers(sessions) {
  const events = [];
  for (const s of Array.isArray(sessions) ? sessions : []) {
    if (!isObject(s) || (s.event_type !== 'phase_started' && s.event_type !== 'phase_completed')) continue;
    if (typeof s.phase !== 'string' || s.phase === '' || typeof s.timestamp !== 'string') continue;
    const ms = Date.parse(s.timestamp);
    if (Number.isFinite(ms)) events.push({ type: s.event_type, phase: s.phase, ms });
  }
  events.sort((a, b) => a.ms - b.ms || (a.type === b.type ? 0 : a.type === 'phase_completed' ? -1 : 1) || byText(a.phase, b.phase));

  const phases = new Map();
  const state = (phase) => {
    if (!phases.has(phase)) phases.set(phase, { segments: 0, total: 0, start: null, source: null, end: null, started: null });
    return phases.get(phase);
  };
  let prev = null;
  for (const e of events) {
    const p = state(e.phase);
    if (e.type === 'phase_started') {
      p.started = e.ms;
    } else {
      if (prev) {
        if (p.segments === 0) {
          p.start = prev.ms;
          p.source = prev.type === 'phase_started' && prev.phase === e.phase ? 'phase_started' : 'previous_phase_completed';
        }
        p.segments += 1;
        p.total += e.ms - prev.ms;
      }
      p.end = e.ms;
    }
    prev = e;
  }
  const openPhase = prev && prev.type === 'phase_started' ? prev.phase : null;

  const markers = [];
  for (const [phase, p] of phases) {
    let marker;
    let key;
    if (p.end === null) {
      marker = { phase, status: 'open', start_iso: new Date(p.started).toISOString(), start_source: 'phase_started' };
      key = p.started;
    } else if (p.segments === 0) {
      marker = { phase, status: 'completed', end_iso: new Date(p.end).toISOString(), segments: 0 };
      key = p.end;
    } else {
      marker = {
        phase,
        status: 'completed',
        start_iso: new Date(p.start).toISOString(),
        end_iso: new Date(p.end).toISOString(),
        duration_ms: p.total,
        start_source: p.source,
        segments: p.segments,
      };
      key = p.start;
    }
    if (p.end !== null && openPhase === phase) marker.open_since_iso = new Date(p.started).toISOString();
    markers.push({ key, marker });
  }
  markers.sort((a, b) => a.key - b.key || byText(a.marker.phase, b.marker.phase));
  return markers.map((m) => m.marker);
}

/** Nearest-rank percentile (0 < p ≤ 100) of the finite numbers in values; undefined when there are none (OI-3). */
export function percentile(values, p) {
  const nums = (Array.isArray(values) ? values : []).filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (nums.length === 0 || !(p > 0 && p <= 100)) return undefined;
  nums.sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p * nums.length) / 100));
  return nums[rank - 1];
}

function durationOf(span) {
  const d = span.duration_ms;
  return typeof d === 'number' && Number.isFinite(d) && d >= 0 ? d : null;
}

/**
 * REQ-020 bottleneck_score per surface (span kind command|hook|sync): hits (always 0, OI-2) + floor(share / 10%),
 * share = Σ duration_ms(surface) / denominatorMs. Denominator 0 -> share term 0, `share_unknown: true`, no share key.
 * Ordered by score desc, then surface name asc.
 */
export function surfaceScores(spans, denominatorMs) {
  const totals = Object.fromEntries(SURFACES.map((k) => [k, 0]));
  for (const s of Array.isArray(spans) ? spans : []) {
    if (!isObject(s) || !SURFACES.includes(s.kind)) continue;
    const d = durationOf(s);
    if (d !== null) totals[s.kind] += d;
  }
  const known = typeof denominatorMs === 'number' && Number.isFinite(denominatorMs) && denominatorMs > 0;
  const hits = 0;
  return SURFACES.map((surface) => {
    const total = totals[surface];
    if (!known) return { surface, hits, total_ms: total, share_unknown: true, score: hits };
    // (total × 10) / denominator avoids the 0.3 / 0.1 = 2.999… float trap.
    return { surface, hits, total_ms: total, share: total / denominatorMs, score: hits + Math.floor((total * 10) / denominatorMs) };
  }).sort((a, b) => b.score - a.score || byText(a.surface, b.surface));
}

function idsOf(records, key) {
  const ids = new Set();
  for (const r of records) {
    const v = r.attributes[key];
    ids.add(typeof v === 'string' && v !== '' ? v : UNKNOWN);
  }
  return [...ids].sort(byText);
}

function isActivationRecord(s) {
  return isObject(s) && s.kind === 'tool' && isObject(s.attributes) && typeof s.attributes.target_path === 'string';
}

/**
 * REQ-021 activation table of one phase. records: the slice's activation spans (any phase); steering:
 * [{ path, inclusion, tags }] (parsed frontmatter); skills: installed `.agents/skills/<n>/SKILL.md` paths; runtimes:
 * project.json `runtimes` (non-array -> columns are the runtimes seen in records, runtimes_configured false);
 * observeHooks: { claude, cursor } true when that runtime's observe entry is present; configured: [{ path, runtime }]
 * files that enter context without a tool call. Cell states: `observed (n)`, `not observed` (hooked runtime with its
 * observe entry only), `unknown`.
 */
export function activationRows({ phase, records, steering, skills, runtimes, observeHooks, configured } = {}) {
  const all = (Array.isArray(records) ? records : []).filter(isActivationRecord);
  const inPhase = all.filter((r) => r.phase === phase);
  const runtimesConfigured = Array.isArray(runtimes);
  const columns = runtimesConfigured
    ? [...new Set(runtimes.filter((r) => typeof r === 'string' && r !== ''))]
    : [...new Set(all.map((r) => r.runtime).filter((r) => typeof r === 'string' && r !== ''))].sort(byText);
  const hooks = isObject(observeHooks) ? observeHooks : {};

  const expectedSteering = (Array.isArray(steering) ? steering : [])
    .filter((f) => isObject(f) && typeof f.path === 'string')
    .filter((f) => f.inclusion === 'always' || (f.inclusion === 'auto' && Array.isArray(f.tags) && f.tags.includes(phase)))
    .map((f) => f.path)
    .sort(byText);
  const expectedSkills = (Array.isArray(skills) ? skills : []).filter((p) => typeof p === 'string').sort(byText);
  const rows = [
    ...expectedSteering.map((target) => ({ target, type: 'steering', expected: true })),
    ...expectedSkills.map((target) => ({ target, type: 'skill', expected: true })),
  ];
  const listed = new Set(rows.map((r) => r.target));
  const extra = [...new Set(inPhase.map((r) => r.attributes.target_path))].filter((t) => !listed.has(t)).sort(byText);
  for (const target of extra) {
    rows.push({ target, type: target.startsWith('.agents/skills/') ? 'skill' : 'steering', expected: false });
  }

  for (const row of rows) {
    row.cells = {};
    for (const runtime of columns) {
      const hit = inPhase.filter((r) => r.attributes.target_path === row.target && r.runtime === runtime);
      if (hit.length > 0) {
        row.cells[runtime] = {
          state: 'observed',
          label: `observed (${hit.length})`,
          count: hit.length,
          runtime_session_ids: idsOf(hit, 'runtime_session_id'),
          agent_ids: idsOf(hit, 'agent_id'),
        };
      } else {
        const state = HOOKED_RUNTIMES.has(runtime) && hooks[runtime] === true ? NOT_OBSERVED : UNKNOWN;
        row.cells[runtime] = { state, label: state };
      }
    }
  }

  const configuredRows = (Array.isArray(configured) ? configured : [])
    .filter((c) => isObject(c) && typeof c.path === 'string')
    .map((c) => ({ target: c.path, runtime: c.runtime, state: CONFIGURED, label: CONFIGURED }))
    .sort((a, b) => byText(a.target, b.target) || byText(String(a.runtime), String(b.runtime)));

  return { phase, columns, runtimes_configured: runtimesConfigured, rows, configured: configuredRows };
}

/**
 * REQ-020/REQ-021 profile of one slice. spans: parsed tail lines; sessions: the slice's sessions; the rest is passed to
 * activationRows. Unmeasured values are absent (OI-3), with the fixed `not_measured` list. Writes nothing (REQ-022).
 */
export function profileModel({ sliceId, spans, sessions, steering, skills, runtimes, observeHooks, configured } = {}) {
  const list = (Array.isArray(spans) ? spans : []).filter(isObject);
  const attributed = list.filter((s) => s.slice_id === sliceId);
  const unattributed = list.filter((s) => s.slice_id === null || s.slice_id === undefined).length;

  const markers = phaseMarkers(sessions);
  const denominator = markers.reduce((sum, m) => sum + (m.status === 'completed' && m.duration_ms ? m.duration_ms : 0), 0);

  const latencies = {};
  for (const kind of SURFACES) {
    const durations = attributed.filter((s) => s.kind === kind).map(durationOf).filter((d) => d !== null);
    if (durations.length > 0) {
      latencies[kind] = { count: durations.length, p50: percentile(durations, 50), p95: percentile(durations, 95) };
    }
  }

  const phases = markers.map((m) => m.phase);
  const recordPhases = attributed
    .filter(isActivationRecord)
    .map((r) => r.phase)
    .filter((p) => typeof p === 'string' && !phases.includes(p));
  phases.push(...[...new Set(recordPhases)].sort(byText));

  return {
    slice_id: sliceId,
    phase_durations: markers,
    latencies,
    scores: surfaceScores(attributed, denominator),
    activation: phases.map((phase) =>
      activationRows({ phase, records: attributed, steering, skills, runtimes, observeHooks, configured }),
    ),
    attributed_spans: attributed.length,
    unattributed_spans: unattributed,
    legend: ACTIVATION_LEGEND,
    not_measured: [...NOT_MEASURED],
  };
}


// --- minted-span contract (telemetry-phase2): mintSpan, emitSpan, builtin checks, phase synthesis,
// --- H-* evaluator, detection spans, command timing. Shares the stream contract above.

export const SPANS_FILE = STREAM_FILE;
export const TAIL_LINES = TAIL_MAX_LINES;
export const TAIL_BYTES = TAIL_MAX_BYTES;
export const SCHEMA_VERSION = '1.0';

const KINDS = new Set(['phase', 'turn', 'command', 'test', 'sensor', 'hook', 'sync', 'subagent', 'tool']);
const SPAN_PHASES = new Set(['discovery', 'spec', 'validation', 'domain', 'design', 'task_planning', 'implementation', 'qa', 'refactor', 'knowledge']);
const STATUSES = new Set(['OK', 'ERROR', 'TIMEOUT']);
const RESERVED_ATTRS = new Set(RESERVED_ATTRIBUTES);
const TOP_KEYS = new Set([
  'schema_version', 'trace_id', 'span_id', 'parent_span_id', 'kind', 'slice_id', 'phase',
  'process_name', 'runtime', 'start_time_iso', 'end_time_iso', 'duration_ms',
  'status', 'attributes', 'events', 'writer',
]);
const HEX_TRACE = TRACE_ID_RE;
const HEX_SPAN = SPAN_ID_RE;
const SLICE_ID = SLICE_ID_RE;
const hash = (s, n) => createHash('sha256').update(s).digest('hex').slice(0, n);

export const spansPath = (root) => join(root, TELEMETRY_DIR, SPANS_FILE);

/**
 * Fill a producer span's ids and timestamps. Env-inherited
 * HARNESS_TRACE_ID ⇒ child of that invocation (trace_source:"env");
 * absent ⇒ self-minted root (trace_source:"self").
 */
export function mintSpan(partial = {}, { env = process.env } = {}) {
  const envTrace = typeof env.HARNESS_TRACE_ID === 'string' && HEX_TRACE.test(env.HARNESS_TRACE_ID) ? env.HARNESS_TRACE_ID : null;
  const envSpan = typeof env.HARNESS_SPAN_ID === 'string' && HEX_SPAN.test(env.HARNESS_SPAN_ID) ? env.HARNESS_SPAN_ID : null;
  const attributes = { trace_source: envTrace ? 'env' : 'self', ...(partial.attributes ?? {}) };
  const span = {
    schema_version: SCHEMA_VERSION,
    trace_id: envTrace ?? hex(16),
    span_id: hex(8),
    parent_span_id: envTrace ? envSpan : null,
    status: 'OK',
    duration_ms: 0,
    events: [],
    ...partial,
    attributes,
  };
  return span;
}

/** Light structural check mirroring telemetry.schema.json — returns a problem list ([] = valid). */


/** Light structural check mirroring telemetry.schema.json — returns a problem list ([] = valid). */
function builtinSpanProblems(span) {
  const problems = [];
  if (!span || typeof span !== 'object' || Array.isArray(span)) return ['span is not an object'];
  for (const k of ['schema_version', 'trace_id', 'span_id', 'kind', 'process_name', 'start_time_iso', 'end_time_iso', 'duration_ms', 'status']) {
    if (!(k in span)) problems.push(`missing required key ${k}`);
  }
  for (const k of Object.keys(span)) if (!TOP_KEYS.has(k)) problems.push(`unknown top-level key ${k}`);
  if (span.schema_version !== SCHEMA_VERSION) problems.push(`schema_version must be "${SCHEMA_VERSION}"`);
  if (typeof span.trace_id === 'string' && !HEX_TRACE.test(span.trace_id)) problems.push('trace_id must be hex 16-32');
  if (typeof span.span_id === 'string' && !HEX_SPAN.test(span.span_id)) problems.push('span_id must be hex 8-16');
  if (span.parent_span_id !== undefined && span.parent_span_id !== null && (typeof span.parent_span_id !== 'string' || !HEX_SPAN.test(span.parent_span_id))) problems.push('parent_span_id must be hex 8-16 or null');
  if (span.kind !== undefined && !KINDS.has(span.kind)) problems.push(`unknown kind "${span.kind}"`);
  if (span.slice_id !== undefined && span.slice_id !== null && (typeof span.slice_id !== 'string' || !SLICE_ID.test(span.slice_id))) problems.push('slice_id must match ^[a-z0-9_-]+$ or be null');
  if (span.phase !== undefined && span.phase !== null && !SPAN_PHASES.has(span.phase)) problems.push(`unknown phase "${span.phase}"`);
  if (typeof span.process_name === 'string' && span.process_name.length === 0) problems.push('process_name must be non-empty');
  for (const t of ['start_time_iso', 'end_time_iso']) {
    if (typeof span[t] === 'string' && Number.isNaN(Date.parse(span[t]))) problems.push(`${t} is not a valid date-time`);
  }
  if (typeof span.duration_ms === 'number' && span.duration_ms < 0) problems.push('duration_ms must be >= 0');
  if (span.status !== undefined && !STATUSES.has(span.status)) problems.push(`unknown status "${span.status}"`);
  if (span.events !== undefined && !Array.isArray(span.events)) problems.push('events must be an array');
  const attrs = span.attributes ?? {};
  if (attrs && typeof attrs === 'object') {
    // Evaluator-reserved attrs are legal only on evaluator/rollup spans (DOM-006).
    const evaluator = span.writer === 'heuristic-evaluator';
    const synthesized = span.writer === 'rollup' || attrs.trace_source === 'synthesized';
    for (const k of RESERVED_ATTRS) {
      const allowed = (k === 'source' ? synthesized : evaluator);
      if (k in attrs && !allowed) problems.push(`producer-set reserved attribute ${k}`);
    }
    if (!['env', 'self', 'synthesized'].includes(attrs.trace_source)) problems.push('attributes.trace_source must be env|self|synthesized');
  }
  return problems;
}

/** Emit from inside a library caller — identical contract, root defaulted. */
export function emitSpan(span, root = process.cwd()) {
  return emit(span, { root });
}

/**
 * Synthesize deterministic `phase` window markers from a slice's session
 * phase_started/phase_completed pairs (A-6, D-1). span_id/trace_id are content
 * hashes of (slice_id, phase, window) → re-synthesis yields identical lines.
 */
export function synthesizePhaseSpans(root, sliceId) {
  const out = [];
  for (const base of ['.harness/state/slices', '.harness/state/archive']) {
    const dir = join(root, base, sliceId, 'sessions');
    if (!existsSync(dir)) continue;
    const events = readdirSync(dir)
      .filter((n) => n.endsWith('.json'))
      .map((n) => { try { return JSON.parse(readFileSync(join(dir, n), 'utf8')); } catch { return null; } })
      .filter((s) => s && (s.event_type === 'phase_started' || s.event_type === 'phase_completed') && s.phase)
      .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
    const open = new Map();
    for (const s of events) {
      if (s.event_type === 'phase_started') { open.set(s.phase, s); continue; }
      const started = open.get(s.phase);
      if (!started) continue;
      open.delete(s.phase);
      const start = started.timestamp;
      const end = s.timestamp;
      const key = `phase|${sliceId}|${s.phase}|${start}|${end}`;
      const span = {
        schema_version: SCHEMA_VERSION,
        trace_id: hash(`trace|${key}`, 32),
        span_id: hash(`span|${key}`, 16),
        parent_span_id: null,
        kind: 'phase',
        slice_id: sliceId,
        phase: s.phase,
        process_name: `asdd-${s.phase}`,
        runtime: 'cli',
        start_time_iso: start,
        end_time_iso: end,
        duration_ms: Math.max(0, Date.parse(end) - Date.parse(start)),
        status: 'OK',
        attributes: { trace_source: 'synthesized', source: 'session_events', ...(s.feature_id ? { feature_id: s.feature_id } : {}) },
        writer: 'rollup',
        events: [],
      };
      out.push(span);
    }
  }
  return out;
}
