// GENERATED from cli/src/harness/cost-lib.mjs by asdd kit vendor: edit the source, then rerun it.
/**
 * Token usage and cost (slice cost-metrics, P5.4 / G17). Pure functions plus three guarded file reads.
 *
 * Source: Claude Code is the only runtime whose hook can read token usage — the Stop payload names the session
 * transcript (`transcript_path`), whose assistant entries carry `message.model` and `message.usage`. Verify-on-Stop
 * records the session's cumulative usage per model as `attributes.usage` on its single `hook` span (the attribute bag
 * is open; no schema change). Every other runtime is `unknown`: never estimated.
 *
 * Attribution: per session, consecutive snapshots in time order; each per-model delta goes to the slice and phase of
 * the snapshot's span. A decrease starts a new baseline. Only the last MAX_SPAN_BYTES of spans.jsonl are read, so a
 * session's first visible snapshot counts in full.
 *
 * USD: only from the project's `.harness/config/model-prices.json` (USD per million tokens per model id). The kit
 * ships no prices; a model without a price makes its row's `usd` null, and null propagates to every aggregate.
 */
import { closeSync, existsSync, fstatSync, openSync, readFileSync, readSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const PRICES_FILE = '.harness/config/model-prices.json';
export const SPANS_FILE = '.harness/state/telemetry/spans.jsonl';
export const MAX_TRANSCRIPT_BYTES = 64 * 1024 * 1024;
export const MAX_SPAN_BYTES = 1024 * 1024;
export const MAX_USAGE_MODELS = 8;
/** Runtimes whose hooks expose token usage; any other configured or observed runtime is unknown. */
export const USAGE_RUNTIMES = Object.freeze(['claude']);
/** Runtimes that run no model (the CLI itself, CI): neither measured nor unknown. */
const NO_MODEL_RUNTIMES = new Set(['cli', 'ci']);
const FIELDS = ['input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens'];
const PRICE_KEYS = { input_tokens: 'input', output_tokens: 'output', cache_read_tokens: 'cache_read', cache_write_tokens: 'cache_write' };

const num = (v) => (Number.isFinite(v) && v > 0 ? v : 0);
const zero = () => ({ input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 });
const tokensOf = (row) => FIELDS.reduce((sum, f) => sum + (row[f] ?? 0), 0);

/** Cumulative usage per model in one transcript (JSONL text). Each assistant message id counts once. */
export function transcriptUsage(text) {
  const byId = new Map();
  let sessionId = null;
  for (const raw of String(text ?? '').split('\n')) {
    if (!raw.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!sessionId && typeof entry?.sessionId === 'string') sessionId = entry.sessionId;
    const msg = entry?.message;
    if (entry?.type !== 'assistant' || !msg?.usage || typeof msg.model !== 'string' || msg.model.startsWith('<')) continue;
    // A streamed message is written once per content block with the same id and usage: the last one wins.
    byId.set(msg.id ?? `${byId.size}`, { model: msg.model, usage: msg.usage });
  }
  const models = {};
  for (const { model, usage } of byId.values()) {
    const row = (models[model] ??= { ...zero(), messages: 0 });
    row.input_tokens += num(usage.input_tokens);
    row.output_tokens += num(usage.output_tokens);
    row.cache_read_tokens += num(usage.cache_read_input_tokens);
    row.cache_write_tokens += num(usage.cache_creation_input_tokens);
    row.messages += 1;
  }
  return { session_id: sessionId, models };
}

/** Usage of the transcript at `path`: a regular `.jsonl` file within `maxBytes`, else null. Never throws. */
export function readTranscriptUsage(path, { maxBytes = MAX_TRANSCRIPT_BYTES } = {}) {
  try {
    if (typeof path !== 'string' || !path.endsWith('.jsonl')) return null;
    const st = statSync(path);
    if (!st.isFile() || st.size > maxBytes) return null;
    return transcriptUsage(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** The span attribute for a usage snapshot: at most MAX_USAGE_MODELS models, largest first; null when empty. */
export function usageAttribute(usage, sessionId) {
  const entries = Object.entries(usage?.models ?? {}).filter(([, row]) => tokensOf(row) > 0 || row.messages > 0);
  if (!entries.length) return null;
  entries.sort((a, b) => tokensOf(b[1]) - tokensOf(a[1]) || a[0].localeCompare(b[0]));
  return {
    session_id: usage.session_id ?? sessionId ?? null,
    models: Object.fromEntries(entries.slice(0, MAX_USAGE_MODELS)),
  };
}

/** The project's price table, or null when absent or unreadable. */
export function loadPrices(root = process.cwd()) {
  try {
    const data = JSON.parse(readFileSync(join(root, PRICES_FILE), 'utf8'));
    return data && typeof data.models === 'object' ? data : null;
  } catch {
    return null;
  }
}

/** Parsable spans from the last MAX_SPAN_BYTES of spans.jsonl (the first, possibly partial, line is dropped). */
export function readUsageSpans(root = process.cwd(), { maxBytes = MAX_SPAN_BYTES } = {}) {
  const file = join(root, SPANS_FILE);
  if (!existsSync(file)) return [];
  let fd;
  try {
    fd = openSync(file, 'r');
    const { size } = fstatSync(fd);
    const length = Math.min(size, maxBytes);
    const buf = Buffer.alloc(length);
    readSync(fd, buf, 0, length, size - length);
    let lines = buf.toString('utf8').split('\n');
    if (size > length) lines = lines.slice(1);
    const spans = [];
    for (const raw of lines) {
      if (!raw.trim()) continue;
      try {
        const span = JSON.parse(raw);
        if (span && typeof span === 'object') spans.push(span);
      } catch {
        // skip a bad line
      }
    }
    return spans;
  } catch {
    return [];
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

const usdOf = (model, row, prices) => {
  const p = prices?.models?.[model];
  if (!p) return null;
  let usd = 0;
  for (const f of FIELDS) {
    const rate = Number(p[PRICE_KEYS[f]]);
    if (!Number.isFinite(rate)) return null;
    usd += (row[f] * rate) / 1e6;
  }
  return usd;
};
const round = (usd) => (usd == null ? null : Math.round(usd * 1e6) / 1e6);

/** Bucket rows: tokens per field plus usd (null once any contributing model has no price). */
function bucket() {
  const rows = new Map();
  return {
    add(key, model, delta, prices) {
      const row = rows.get(key) ?? { ...zero(), usd: 0 };
      for (const f of FIELDS) row[f] += delta[f];
      const usd = usdOf(model, delta, prices);
      row.usd = row.usd == null || usd == null ? null : row.usd + usd;
      rows.set(key, row);
    },
    list(keyName) {
      return [...rows.entries()]
        .map(([key, row]) => ({ [keyName]: key, ...row, usd: round(row.usd) }))
        .sort((a, b) => tokensOf(b) - tokensOf(a) || String(a[keyName]).localeCompare(String(b[keyName])));
    },
  };
}

/**
 * `metrics.cost` (REQ-004) from telemetry spans. `runtimes` are the project's configured runtimes; `prices` is the
 * project price table (or null).
 */
export function costFromSpans(spans, { prices = null, runtimes = [] } = {}) {
  const snapshots = (spans ?? []).filter((s) => s?.attributes?.usage?.models && typeof s.attributes.usage.models === 'object');
  const observed = new Set((spans ?? []).map((s) => s?.runtime).filter((r) => typeof r === 'string'));
  const unknown_runtimes = [...new Set([...runtimes, ...observed])]
    .filter((r) => !USAGE_RUNTIMES.includes(r) && !NO_MODEL_RUNTIMES.has(r))
    .sort();

  const totals = { ...zero(), usd: null };
  if (!snapshots.length) {
    return { source: [], totals, by_slice: [], by_phase: [], by_model: [], by_runtime: [], unknown_runtimes };
  }

  const bySlice = bucket();
  const byPhase = bucket();
  const byModel = bucket();
  const byRuntime = bucket();
  const sessions = new Map();
  for (const s of snapshots) {
    const id = s.attributes.usage.session_id ?? `trace:${s.trace_id ?? 'unknown'}`;
    if (!sessions.has(id)) sessions.set(id, []);
    sessions.get(id).push(s);
  }
  let totalUsd = 0;
  for (const list of sessions.values()) {
    list.sort((a, b) => String(a.end_time_iso ?? '').localeCompare(String(b.end_time_iso ?? '')));
    const previous = {};
    for (const s of list) {
      for (const [model, raw] of Object.entries(s.attributes.usage.models)) {
        const current = Object.fromEntries(FIELDS.map((f) => [f, num(raw?.[f])]));
        const before = previous[model];
        const reset = !before || FIELDS.some((f) => current[f] < before[f]);
        const delta = Object.fromEntries(FIELDS.map((f) => [f, reset ? current[f] : current[f] - before[f]]));
        previous[model] = current;
        if (!tokensOf(delta)) continue;
        bySlice.add(s.slice_id ?? null, model, delta, prices);
        byPhase.add(s.phase ?? null, model, delta, prices);
        byModel.add(model, model, delta, prices);
        byRuntime.add(s.runtime ?? 'claude', model, delta, prices);
        for (const f of FIELDS) totals[f] += delta[f];
        const usd = usdOf(model, delta, prices);
        totalUsd = totalUsd == null || usd == null ? null : totalUsd + usd;
      }
    }
  }
  totals.usd = round(totalUsd);

  const runtimeRows = byRuntime.list('runtime').map((r) => ({ ...r, unknown: false }));
  const nulls = Object.fromEntries(FIELDS.map((f) => [f, null]));
  for (const runtime of unknown_runtimes) runtimeRows.push({ runtime, ...nulls, usd: null, unknown: true });

  return {
    source: ['claude-transcript'],
    totals,
    by_slice: bySlice.list('slice_id'),
    by_phase: byPhase.list('phase'),
    by_model: byModel.list('model'),
    by_runtime: runtimeRows,
    unknown_runtimes,
  };
}
