// GENERATED from cli/src/harness/pipeline-metrics.mjs by asdd kit vendor: edit the source, then rerun it.
/**
 * Pipeline adoption metrics (ASDD-ROADMAP P0.1): whether the harness helps or only frictions.
 *
 * Pure reads over registry, per-slice sessions, and learning summaries. Shared by
 * `asdd status --metrics` and unit tests with synthetic fixtures.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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
      const code = sig.slice('sensor:'.length).split(':')[0];
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
  lines.push('');
  return lines.join('\n');
}
