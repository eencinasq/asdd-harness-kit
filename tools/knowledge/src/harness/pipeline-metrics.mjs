// GENERATED from cli/src/harness/pipeline-metrics.mjs by asdd kit vendor: edit the source, then rerun it.
/**
 * Pipeline adoption metrics (ASDD-ROADMAP P0.1): whether the harness helps or only frictions.
 *
 * Pure reads over registry, per-slice sessions, and learning summaries. Shared by
 * `asdd status --metrics` and unit tests with synthetic fixtures.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { costFromSpans, loadPrices, readUsageSpans } from './cost-lib.mjs';
import { SUMMARIES_DIR } from './learning-lib.mjs';
import { PHASES, readSessions } from './sync-state.mjs';

const MS_HOUR = 3600_000;

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Hours between consecutive phase_completed events for one slice (per completed phase). */
export function phaseDurationsHours(sessions) {
  const completed = sessions
    .filter((s) => s.event_type === 'phase_completed' && typeof s.phase === 'string' && s.timestamp)
    .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  const out = {};
  for (let i = 0; i < completed.length; i += 1) {
    const cur = completed[i];
    const prev = i === 0 ? sessions.find((s) => s.event_type === 'phase_started' && s.timestamp) : completed[i - 1];
    if (!prev?.timestamp) continue;
    const hours = (Date.parse(cur.timestamp) - Date.parse(prev.timestamp)) / MS_HOUR;
    if (!Number.isFinite(hours) || hours < 0) continue;
    (out[cur.phase] ??= []).push(hours);
  }
  return out;
}

/**
 * Count stop-FAIL sensor episodes in learning summaries (signatures starting with `sensor:`).
 * @param {Array<{ data: object }>} summaryFiles
 */
export function stopFailCounts(summaryFiles) {
  let episodes = 0;
  const byCode = {};
  for (const { data } of summaryFiles) {
    for (const [sig, slot] of Object.entries(data?.signatures ?? {})) {
      if (!sig.startsWith('sensor:')) continue;
      const n = Array.isArray(slot.episodes) ? slot.episodes.length : 0;
      episodes += n;
      // A signature without a check code is a message shape (`sensor:<path>: feature …`): count it as `other`.
      const head = sig.slice('sensor:'.length).split(':')[0];
      const code = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+$/.test(head) ? head : 'other';
      byCode[code] = (byCode[code] ?? 0) + n;
    }
  }
  return { episodes, by_code: byCode };
}

/**
 * @param {object} opts
 * @param {string} [opts.root] harness project root (reads disk when fixtures omitted)
 * @param {object[]} [opts.slices] registry.slices fixture
 * @param {Record<string, object[]>} [opts.sessionsBySlice] sessions per slice_id
 * @param {Array<{ data: object }>} [opts.summaries] learning summary fixtures
 * @param {object[]} [opts.patterns] patterns.json.patterns fixture
 * @param {object[]} [opts.spans] telemetry span fixtures (cost-metrics); default: the tail of spans.jsonl
 * @param {object|null} [opts.prices] price table fixture; default: .harness/config/model-prices.json
 * @param {string[]} [opts.runtimes] configured runtimes; default: project.json `runtimes`
 */
export function computePipelineMetrics(opts = {}) {
  const root = opts.root ?? process.cwd();
  const registry = opts.slices
    ? { slices: opts.slices }
    : readJson(join(root, '.harness/state/registry.json')) ?? { slices: [] };
  const slices = Array.isArray(registry.slices) ? registry.slices : [];

  const done = slices.filter((s) => s.status === 'DONE');
  const liteDone = done.filter((s) => (s.mode === 'lite' || s.mode === 'hotfix') && !s.escalated_from_lite);
  const escalated = slices.filter((s) => s.mode === 'escalated' || s.escalated_from_lite || s.escalation_required);

  const durations = {};
  for (const phase of PHASES) durations[phase] = [];

  for (const s of slices) {
    const sessions = opts.sessionsBySlice
      ? (opts.sessionsBySlice[s.slice_id] ?? [])
      : readSessions(join(root, '.harness/state/slices', s.slice_id));
    const per = phaseDurationsHours(sessions);
    for (const [phase, hours] of Object.entries(per)) {
      (durations[phase] ??= []).push(...hours);
    }
  }

  const phase_median_hours = {};
  for (const phase of PHASES) {
    const m = median(durations[phase] ?? []);
    if (m != null) phase_median_hours[phase] = Math.round(m * 1000) / 1000;
  }

  let summaries = opts.summaries;
  if (!summaries) {
    const dir = join(root, SUMMARIES_DIR);
    summaries = existsSync(dir)
      ? readdirSync(dir)
          .filter((n) => n.endsWith('.json'))
          .sort()
          .map((n) => ({ data: readJson(join(dir, n)) }))
          .filter((f) => f.data)
      : [];
  }

  const stop = stopFailCounts(summaries);

  const patterns = opts.patterns
    ?? readJson(join(root, '.harness/state/learning/patterns.json'))?.patterns
    ?? [];
  const open_patterns = patterns.filter((p) => p.status === 'open').length;

  const lite_share = done.length ? liteDone.length / done.length : null;

  // cost-metrics: tokens and USD from Claude Stop usage snapshots; runtimes without a token source are unknown.
  const runtimes = opts.runtimes ?? readJson(join(root, '.harness/config/project.json'))?.runtimes ?? [];
  const cost = costFromSpans(opts.spans ?? readUsageSpans(root), {
    prices: opts.prices === undefined ? loadPrices(root) : opts.prices,
    runtimes: Array.isArray(runtimes) ? runtimes : [],
  });

  return {
    generated_at: new Date().toISOString(),
    slices: {
      total: slices.length,
      done: done.length,
      in_progress: slices.filter((s) => s.status === 'in_progress').length,
      lite_done: liteDone.length,
      lite_share,
      escalated: escalated.length,
      escalation_rate: slices.length ? escalated.length / slices.length : null,
    },
    phase_median_hours,
    stop_fail: stop,
    open_patterns,
    cost,
  };
}

/** Human-readable block for `asdd status --metrics`. */
export function formatPipelineMetrics(m) {
  const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
  const lines = [
    '== Pipeline metrics ==',
    `  slices          ${m.slices.total} total · ${m.slices.done} DONE · ${m.slices.in_progress} in_progress`,
    `  lite share      ${pct(m.slices.lite_share)} of DONE (never escalated)`,
    `  escalation rate ${pct(m.slices.escalation_rate)} of all slices (escalated / signals open)`,
    `  stop FAILs      ${m.stop_fail.episodes} sensor episode(s) in learning summaries`,
  ];
  const codes = Object.entries(m.stop_fail.by_code).sort((a, b) => b[1] - a[1]);
  if (codes.length) {
    lines.push(`                   by code: ${codes.map(([c, n]) => `${c}×${n}`).join(', ')}`);
  }
  const phases = Object.entries(m.phase_median_hours);
  if (phases.length) {
    lines.push(`  phase medians  ${phases.map(([p, h]) => `${p}=${h}h`).join(' · ')}`);
  } else {
    lines.push('  phase medians  — (need phase_completed timestamps)');
  }
  lines.push(`  open patterns  ${m.open_patterns}`);
  if (m.cost) lines.push(...formatCost(m.cost));
  lines.push('');
  return lines.join('\n');
}

const fmtUsd = (usd) => (usd == null ? 'USD n/a (no price for every model; .harness/config/model-prices.json)' : `$${usd}`);
const total = (r) => (r.input_tokens ?? 0) + (r.output_tokens ?? 0) + (r.cache_read_tokens ?? 0) + (r.cache_write_tokens ?? 0);

/** Text lines for metrics.cost (cost-metrics REQ-001…003). */
export function formatCost(cost) {
  const lines = [];
  const t = cost.totals;
  if (!cost.source.length) {
    lines.push('  tokens         — (no usage recorded yet; Claude Code records it at Stop)');
  } else {
    lines.push(`  tokens         in ${t.input_tokens} · out ${t.output_tokens} · cache read ${t.cache_read_tokens} · cache write ${t.cache_write_tokens} · ${fmtUsd(t.usd)}`);
    const list = (rows, key) => rows.map((r) => `${r[key] ?? '(unattributed)'} ${total(r)}${r.usd == null ? '' : ` ($${r.usd})`}`).join(' · ');
    lines.push(`                   by model   ${list(cost.by_model, 'model')}`);
    lines.push(`                   by slice   ${list(cost.by_slice, 'slice_id')}`);
    lines.push(`                   by phase   ${list(cost.by_phase, 'phase')}`);
    const known = cost.by_runtime.filter((r) => !r.unknown);
    lines.push(`                   by runtime ${list(known, 'runtime')}`);
  }
  if (cost.unknown_runtimes.length) {
    lines.push(`  unknown        ${cost.unknown_runtimes.join(', ')} (no token source; not estimated)`);
  }
  return lines;
}
