#!/usr/bin/env node
/**
 * asdd profile — Phase-2 telemetry readout (profiling v2 §5).
 *
 *   asdd profile --slice <id>     per-slice phase/turn/boot-tax/H-* report
 *   asdd profile --bottlenecks    cross-slice surfaces ranked by bottleneck_score
 *   asdd profile --json           machine-readable rollup
 *
 * Exit 0 on a successful report; 3 when no spans exist for the scope
 * (distinct from "report succeeded"); 2 on usage error. Profiling is a
 * readout — it reports, never gates (telemetry stays fail-open).
 */
import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  TELEMETRY_DIR,
  SCHEMA_VERSION,
  readTail,
  synthesizePhaseSpans,
  emit,
  mintSpan,
  validateSpan,
} from './telemetry-lib.mjs';
import { EVALUATOR_WRITERS, evaluateHeuristics, detectionSpan } from './telemetry-eval.mjs';

const root = process.cwd();
const t0 = Date.now();

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

const args = process.argv.slice(2);
const sliceIdx = args.indexOf('--slice');
const sliceId = sliceIdx >= 0 ? args[sliceIdx + 1] : null;
const wantBottlenecks = args.includes('--bottlenecks');
const wantJson = args.includes('--json');
if (sliceIdx >= 0 && !sliceId) {
  console.error('usage: asdd profile --slice <id> | --bottlenecks [--json]');
  process.exit(2);
}
if (!sliceId && !wantBottlenecks && !wantJson) {
  console.error('usage: asdd profile --slice <id> | --bottlenecks [--json]');
  process.exit(2);
}

function loadSessions(id) {
  const out = [];
  for (const base of ['.harness/state/slices', '.harness/state/archive']) {
    const dir = join(root, base, id, 'sessions');
    if (!existsSync(dir)) continue;
    for (const n of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
      try { out.push(JSON.parse(readFileSync(join(dir, n), 'utf8'))); } catch { /* skip */ }
    }
  }
  return out;
}

const tail = readTail(root);
const allSpans = [];
for (const { text } of tail.lines) {
  try {
    const s = JSON.parse(text);
    if (s && typeof s === 'object' && validateSpan(s).length === 0) allSpans.push(s);
  } catch { /* malformed lines are skipped by the readout; the validator warns */ }
}

// Fires: append a detection span per new finding (AR-4 — producers are never
// annotated; detection spans self-mint their own trace).
function fireFindings(findings, existingDetections) {
  for (const f of findings) {
    const det = detectionSpan(f, { env: {} });
    if (!validateSpan(det).length) {
      emit(det, { root });
      existingDetections.push(det);
    }
  }
}

// bottleneck_score(surface) = Σ severity×hits + 1 per 10% span-time share.
const SEVERITY = { High: 3, Medium: 2, Low: 1 };
const FINDING_SEVERITY = { 'H-BOOT': 'High', 'H-LOOP': 'High', 'H-SURGE': 'Medium', 'H-STALL': 'Medium', 'H-PHANTOM': 'Medium' };

function scoreSurfaces(spans, findings, totalMs) {
  const bySurface = new Map();
  const acc = (name) => bySurface.get(name) ?? bySurface.set(name, { surface: name, ms: 0, wasted_ms: 0, hits: {} }).get(name);
  for (const s of spans) {
    const surf = acc(s.process_name || s.kind);
    surf.ms += s.duration_ms || 0;
    if (s.kind === 'test') surf.wasted_ms += s.attributes?.boot_duration_ms ?? 0;
  }
  for (const f of findings) {
    const trigger = spans.find((s) => s.span_id === f.trigger_span_id);
    const surf = acc(trigger?.process_name ?? (f.phase ? `phase:${f.phase}` : `slice:${f.slice_id ?? 'unknown'}`));
    surf.hits[f.heuristic] = (surf.hits[f.heuristic] ?? 0) + 1;
    if (f.heuristic === 'H-STALL') surf.wasted_ms += (f.silent_min ?? 0) * 60000;
  }
  const rows = [...bySurface.values()].map((r) => ({
    ...r,
    share_pct: totalMs ? Math.round((r.ms / totalMs) * 100) : 0,
    bottleneck_score: Object.entries(r.hits).reduce((sum, [h, n]) => sum + (SEVERITY[FINDING_SEVERITY[h]] ?? 1) * n, 0)
      + Math.floor((totalMs ? (r.ms / totalMs) * 100 : 0) / 10),
  }));
  rows.sort((a, b) => b.bottleneck_score - a.bottleneck_score || b.wasted_ms - a.wasted_ms);
  return rows;
}

function sliceRollup(id) {
  const producerSpans = allSpans.filter((s) => s.slice_id === id);
  const phaseSpans = synthesizePhaseSpans(root, id);
  const spans = [...producerSpans, ...phaseSpans.filter((p) => !producerSpans.some((s) => s.span_id === p.span_id))];
  const sessions = loadSessions(id);
  const detections = allSpans.filter((s) => s.slice_id === id && EVALUATOR_WRITERS.has(s.writer));
  const findings = evaluateHeuristics([...spans, ...detections], { sessions });
  fireFindings(findings, detections);

  const turns = producerSpans.filter((s) => s.kind === 'turn');
  const lat = turns.map((s) => s.duration_ms).filter(Number.isFinite);
  const tests = producerSpans.filter((s) => s.kind === 'test');
  const boot = tests.reduce((sum, s) => sum + (s.attributes?.boot_duration_ms ?? 0), 0);
  const testMs = tests.reduce((sum, s) => sum + (s.duration_ms ?? 0), 0);
  const bytes = turns.map((s) => s.attributes?.context_bytes_loaded).filter(Number.isFinite);
  const ctxSlope = bytes.length > 1
    ? (bytes.at(-1) - bytes[0]) / (bytes.length - 1)
    : 0;
  const totalMs = spans.reduce((sum, s) => sum + (s.duration_ms ?? 0), 0);

  return {
    schema_version: SCHEMA_VERSION,
    slice_id: id,
    generated_at: new Date().toISOString(),
    window: { tail_lines: tail.lines.length, truncated: tail.truncated },
    metrics: {
      phase_durations: Object.fromEntries(
        spans.filter((s) => s.kind === 'phase' && s.phase)
          .map((s) => [s.phase, (spans.filter((x) => x.kind === 'phase' && x.phase === s.phase).reduce((a, x) => a + x.duration_ms, 0))])
      ),
      turn_latency_p50_ms: median(lat),
      turn_latency_p95_ms: p95(lat),
      turn_count: turns.length,
      test_boot_tax: testMs ? +(boot / testMs).toFixed(3) : null,
      context_expansion_bytes_per_turn: Math.round(ctxSlope),
      diagnose_fix_loop_count: detections.filter((s) => s.attributes?.heuristic === 'H-LOOP').length,
      total_span_time_ms: totalMs,
    },
    findings: [...detections.map((s) => ({ heuristic: s.attributes?.heuristic, trigger_span_id: s.attributes?.trigger_span_id, span_id: s.span_id })),
      ...findings.map((f) => ({ heuristic: f.heuristic, failure_signature: f.failure_signature, trigger_span_id: f.trigger_span_id, ...f.evidence }))],
    surfaces: scoreSurfaces(spans, findings, totalMs),
  };
}

function printSlice(r) {
  console.log(`PROFILE ${r.slice_id} — ${r.metrics.total_span_time_ms} ms span-time across ${r.window.tail_lines} tail lines${r.window.truncated ? ' (truncated)' : ''}`);
  for (const [phase, ms] of Object.entries(r.metrics.phase_durations)) {
    console.log(`  ${phase.padEnd(16)} ${String(ms).padStart(8)} ms`);
  }
  console.log(`  turns ${r.metrics.turn_count} · p50 ${r.metrics.turn_latency_p50_ms} ms · p95 ${r.metrics.turn_latency_p95_ms} ms`);
  if (r.metrics.test_boot_tax != null) console.log(`  test boot tax ${(r.metrics.test_boot_tax * 100).toFixed(1)}%`);
  for (const f of r.findings) {
    console.log(`  ${f.heuristic ?? 'finding'}  sig:${f.failure_signature ?? '-'}  trigger:${f.trigger_span_id ?? '-'}`);
  }
  for (const s of r.surfaces.slice(0, 5)) {
    if (s.bottleneck_score > 0) console.log(`  bottleneck ${s.bottleneck_score.toFixed(1).padStart(5)}  ${s.surface} (${s.share_pct}% of span-time)`);
  }
}

async function main() {
  let exitCode = 0;
  let out = null;

  if (wantBottlenecks) {
    const ids = [...new Set(allSpans.map((s) => s.slice_id).filter(Boolean))].sort();
    const rows = [];
    for (const id of ids) {
      const r = sliceRollup(id);
      rows.push({ slice_id: id, surfaces: r.surfaces, findings: r.findings });
    }
    out = { schema_version: SCHEMA_VERSION, generated_at: new Date().toISOString(), slices: rows };
    if (wantJson) {
      console.log(JSON.stringify(out, null, 2));
    } else {
      for (const row of rows) {
        for (const s of row.surfaces.filter((s) => s.bottleneck_score > 0)) {
          console.log(`${String(s.bottleneck_score.toFixed(1)).padStart(6)}  ${row.slice_id}  ${s.surface}  wasted ${s.wasted_ms} ms`);
        }
      }
      if (!rows.length) console.log('PROFILE  no span-bearing slices');
    }
    if (!ids.length) exitCode = 3;
  } else if (sliceId) {
    const r = sliceRollup(sliceId);
    const hasSpans = allSpans.some((s) => s.slice_id === sliceId) || r.metrics.turn_count > 0
      || Object.keys(r.metrics.phase_durations).length > 0;
    if (!hasSpans) {
      console.error(`PROFILE  no spans for slice ${sliceId} (telemetry may be pre-instrumentation)`);
      process.exit(3);
    }
    const dir = join(root, TELEMETRY_DIR, 'slices', sliceId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'profiling.json'), JSON.stringify(r, null, 2) + '\n');
    out = r;
    if (wantJson) console.log(JSON.stringify(r, null, 2)); else printSlice(r);
  } else {
    out = { schema_version: SCHEMA_VERSION, generated_at: new Date().toISOString(), window: { tail_lines: tail.lines.length, truncated: tail.truncated }, slices: [...new Set(allSpans.map((s) => s.slice_id).filter(Boolean))].sort() };
    console.log(JSON.stringify(out, null, 2));
    if (!allSpans.length) exitCode = 3;
  }

  // Self-observing span — harness-profile writer is excluded from heuristic inputs.
  try {
    emit(mintSpan({
      kind: 'sensor',
      process_name: 'harness-profile',
      runtime: 'cli',
      slice_id: sliceId ?? null,
      start_time_iso: new Date(t0).toISOString(),
      end_time_iso: new Date().toISOString(),
      duration_ms: Date.now() - t0,
      status: 'OK',
      writer: 'harness-profile',
      attributes: { command_label: 'asdd-profile', exit_code: exitCode, violations_count: 0 },
    }), { root });
  } catch { /* telemetry degrades to silence */ }

  process.exit(exitCode);
}

await main();
