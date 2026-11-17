/**
 * Telemetry evaluator module (telemetry-phase2): the H-* heuristic detector, detection spans,
 * and the non-gate command timer. Separated from telemetry-lib.mjs so the library keeps its
 * producer contract (REQ-004 builtins-only, REQ-020 no heuristic weights in the library).
 * Imports telemetry-lib for the minted-span contract only.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mintSpan } from './telemetry-lib.mjs';

const hash = (s, n) => createHash('sha256').update(s).digest('hex').slice(0, n);

export const DEDUP_WINDOW_MIN = 30;
export const EVALUATOR_WRITERS = new Set(['heuristic-evaluator', 'harness-profile', 'validators/telemetry.mjs']);

/** Median helper (p50). */

const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const p95 = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(s.length * 0.95) - 1)];
};

/**
 * H-* evaluator (D-4, AR-8, AR-10). Producer spans only; detection keys on
 * (slice_id, phase, failure_signature) — never trace topology. Returns
 * finding objects; the caller appends detection spans + learning signals.
 * `existingDetections` dedupes (heuristic, signature, slice) per 30-min window.
 */
export function evaluateHeuristics(spans, { sessions = [], now = new Date() } = {}) {
  const producer = spans.filter((s) => !EVALUATOR_WRITERS.has(s.writer));
  const findings = [];
  const deduped = new Set();
  for (const s of spans.filter((x) => x.writer === 'heuristic-evaluator')) {
    const a = s.attributes ?? {};
    if (!a.heuristic) continue;
    const ageMin = (now.getTime() - Date.parse(s.start_time_iso)) / 60000;
    if (Number.isFinite(ageMin) && ageMin <= DEDUP_WINDOW_MIN) {
      deduped.add(`${a.heuristic}|${a.failure_signature ?? '-'}|${s.slice_id ?? '-'}`);
    }
  }
  const fire = (heuristic, { slice_id = null, phase = null, failure_signature = null, trigger_span_id = null, evidence = {} }) => {
    const key = `${heuristic}|${failure_signature ?? '-'}|${slice_id ?? '-'}`;
    if (deduped.has(key)) return;
    deduped.add(key);
    findings.push({ heuristic, slice_id, phase, failure_signature, trigger_span_id, dedup_window_min: DEDUP_WINDOW_MIN, ...evidence });
  };

  const bySlice = new Map();
  for (const s of producer) {
    if (!s.slice_id) continue;
    if (!bySlice.has(s.slice_id)) bySlice.set(s.slice_id, []);
    bySlice.get(s.slice_id).push(s);
  }

  for (const [sliceId, list] of bySlice) {
    const sorted = [...list].sort((a, b) => String(a.start_time_iso).localeCompare(String(b.start_time_iso)));

    // H-BOOT — median flag over the ≥3 most recent test spans.
    const tests = sorted.filter((s) => s.kind === 'test');
    if (tests.length >= 3) {
      const recent = tests.slice(-3).filter((s) => typeof s.attributes?.boot_duration_ms === 'number' && s.duration_ms > 0);
      if (recent.length >= 3) {
        const flagged = recent.filter((s) => s.attributes.boot_duration_ms / s.duration_ms > 0.5);
        if (flagged.length >= 2) {
          fire('H-BOOT', { slice_id: sliceId, failure_signature: `test-boot:${sliceId}`, trigger_span_id: flagged.at(-1).span_id, evidence: { flagged: flagged.length, window: recent.length } });
        }
      }
    }

    // H-LOOP — ≥3 consecutive ERROR on one failure_signature per slice+phase.
    const runs = new Map();
    for (const s of sorted) {
      const sig = s.attributes?.failure_signature;
      if (!sig) continue;
      const key = `${s.phase ?? '-'}|${sig}`;
      const run = runs.get(key) ?? { count: 0, last: null };
      if (s.status === 'ERROR' || (s.kind === 'test' && (s.attributes?.failed_count ?? 0) > 0)) {
        run.count += 1; run.last = s;
      } else if (s.status === 'OK') {
        run.count = 0; run.last = null;
      }
      runs.set(key, run);
      if (run.count === 3) {
        fire('H-LOOP', { slice_id: sliceId, phase: s.phase ?? null, failure_signature: sig, trigger_span_id: s.span_id, evidence: { consecutive_failures: run.count } });
      }
    }

    // H-SURGE — >80 KB or +50% vs previous turn for the same slice+phase.
    const turns = sorted.filter((s) => s.kind === 'turn' && typeof s.attributes?.context_bytes_loaded === 'number');
    const prevByPhase = new Map();
    for (const s of turns) {
      const key = s.phase ?? '-';
      const bytes = s.attributes.context_bytes_loaded;
      const prev = prevByPhase.get(key);
      if (bytes > 80000 || (prev && bytes > prev * 1.5)) {
        fire('H-SURGE', { slice_id: sliceId, phase: s.phase ?? null, failure_signature: `context:${key}`, trigger_span_id: s.span_id, evidence: { context_bytes_loaded: bytes, prev_bytes: prev ?? null } });
      }
      prevByPhase.set(key, bytes);
    }

    // H-PHANTOM — ≥2 phantom reads in one turn (grouped by trace_id invocation).
    const phantomsByTrace = new Map();
    for (const s of sorted.filter((x) => x.kind === 'tool' && ['Read', 'Grep', 'Glob'].includes(x.attributes?.tool_name) && x.attributes?.target_path_exists === false)) {
      const t = s.trace_id;
      const l = phantomsByTrace.get(t) ?? [];
      l.push(s);
      phantomsByTrace.set(t, l);
      if (l.length === 2) {
        fire('H-PHANTOM', { slice_id: sliceId, phase: s.phase ?? null, failure_signature: `phantom:${t.slice(0, 12)}`, trigger_span_id: s.span_id, evidence: { phantom_reads: l.length, trace_id: t } });
      }
    }
  }

  // H-STALL — active slice+phase silent >15 min (sessions + span/event times).
  const active = new Map();
  for (const s of [...sessions].sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)))) {
    if (!s.slice_id || !s.phase) continue;
    const key = `${s.slice_id}|${s.phase}`;
    if (s.event_type === 'phase_started') active.set(key, s.timestamp);
    if (s.event_type === 'phase_completed') active.delete(key);
  }
  for (const [key, startedAt] of active) {
    const [sliceId, phase] = key.split('|');
    let latest = Date.parse(startedAt) || 0;
    for (const s of producer.filter((x) => x.slice_id === sliceId && x.phase === phase)) {
      latest = Math.max(latest, Date.parse(s.end_time_iso) || 0, ...(s.events ?? []).map((e) => Date.parse(e.time_iso) || 0));
    }
    for (const s of sessions.filter((x) => x.slice_id === sliceId)) latest = Math.max(latest, Date.parse(s.timestamp) || 0);
    const silentMs = now.getTime() - latest;
    if (silentMs > 15 * 60000) {
      fire('H-STALL', { slice_id: sliceId, phase, failure_signature: `stall:${sliceId}:${phase}`, trigger_span_id: null, evidence: { silent_min: Math.floor(silentMs / 60000) } });
    }
  }

  return findings;
}


/** Build the detection span for a finding (writer: heuristic-evaluator). */
export function detectionSpan(finding, { env = {} } = {}) {
  const now = new Date();
  const span = mintSpan({
    kind: 'sensor',
    slice_id: finding.slice_id ?? null,
    phase: finding.phase ?? null,
    process_name: 'heuristic-evaluator',
    runtime: 'cli',
    start_time_iso: now.toISOString(),
    end_time_iso: now.toISOString(),
    duration_ms: 0,
    status: 'OK',
    writer: 'heuristic-evaluator',
    attributes: {
      heuristic: finding.heuristic,
      trigger_span_id: finding.trigger_span_id ?? undefined,
      failure_signature: finding.failure_signature ?? undefined,
      consecutive_failures: finding.consecutive_failures,
      dedup_window_min: finding.dedup_window_min,
      context_bytes_loaded: finding.context_bytes_loaded,
      silent_min: finding.silent_min,
    },
  }, { env });
  for (const k of Object.keys(span.attributes)) if (span.attributes[k] === undefined) delete span.attributes[k];
  return span;
}

/**
 * Non-gate test/command wrapper (D-3): run a command, emit exactly one span
 * with honest timing. `bootMs` may be supplied by a runner-aware caller;
 * omitted when unmeasurable. Returns the spawn result.
 */

/**
 * Non-gate test/command wrapper (D-3): run a command, emit exactly one span
 * with honest timing. `bootMs` may be supplied by a runner-aware caller;
 * omitted when unmeasurable. Returns the spawn result.
 */
export function measureCommand(command, { root = process.cwd(), sliceId = null, phase = null, runner = null, bootMs = null, env = process.env } = {}) {
  const t0 = Date.now();
  const result = spawnSync('sh', ['-c', command], { cwd: root, encoding: 'utf8', env });
  const end = new Date();
  const isTest = /\b(test|jest|vitest|node --test)\b/.test(command) || /^test:/.test(runner ?? '');
  const attributes = {
    command_label: runner ?? (isTest ? 'test:script' : 'command:script'),
    exit_code: result.status ?? -1,
    ...(runner ? { test_runner: runner } : {}),
    ...(typeof bootMs === 'number' ? { boot_duration_ms: bootMs, execution_duration_ms: Math.max(0, end.getTime() - t0 - bootMs) } : {}),
    ...(result.status && result.status !== 0 ? { failure_signature: `command:${runner ?? 'script'}` } : {}),
  };
  emit(mintSpan({
    kind: isTest ? 'test' : 'command',
    slice_id: sliceId,
    phase,
    process_name: isTest ? 'test-runner' : 'command',
    runtime: 'cli',
    start_time_iso: new Date(t0).toISOString(),
    end_time_iso: end.toISOString(),
    duration_ms: end.getTime() - t0,
    status: result.error?.code === 'ETIMEDOUT' ? 'TIMEOUT' : (result.status === 0 ? 'OK' : 'ERROR'),
    writer: 'measureCommand',
    attributes,
  }, { env }), { root });
  return result;
}
