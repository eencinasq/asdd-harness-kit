/**
 * `asdd ui` insights (slice ui-insights / P5.7): read-only models behind the Insights tab.
 *
 *   activationInsights  installed steering/skills vs activation records in the telemetry tail (asdd observe)
 *   summarizeSkillEval  compact `asdd skill-eval --json` suite (no probe output shipped to the page)
 *   createSkillEvalRunner  async, argv-only run of `asdd skill-eval --json` (no shell, timeout)
 *   costInsights        `metrics.cost` from computePipelineMetrics (owned by slice cost-metrics), tolerated absent
 *
 * Every model carries `source: present | absent | error` and, when not present, a `hint` naming the command that
 * produces the data (REQ-004). Node built-ins only; nothing here writes to the repository.
 */
import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { readTail } from './telemetry-lib.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Window values the API accepts: whole days, or `all`. */
export const WINDOW_RE = /^(?:all|[1-9][0-9]{0,2})$/;
/** A git ref safe to pass as one argv element: no leading `-`, no spaces or shell metacharacters. */
const SAFE_REF_RE = /^(?!-)[A-Za-z0-9._/~^@{}-]{1,120}$/;
// Telemetry design D-3: Cursor has no load hook, so its loads are never measured.
const HOOKLESS = new Set(['cursor']);

export const HINTS = Object.freeze({
  activation:
    'No activation records yet. Loads are recorded by `asdd observe claude`, which `asdd install --runtime=claude` wires as a PostToolUse(Read|Skill) hook; they land in .harness/state/telemetry/spans.jsonl.',
  skillEval: 'No skill-eval results. Run `asdd skill-eval` (fixtures live in cli/eval/skills/<skill>/*.json).',
  cost: 'No cost data. `asdd status --metrics` reports tokens and cost once slice cost-metrics records them; runtimes without token data show unknown.',
});

export const isSafeRef = (ref) => typeof ref === 'string' && SAFE_REF_RE.test(ref) && !ref.includes('..');

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function listDir(dir) {
  try {
    return readdirSync(dir).sort();
  } catch {
    return [];
  }
}

function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/** `inclusion:` from a steering file's YAML frontmatter (always | auto | …), or null. */
function inclusionOf(text) {
  const fm = /^---\n([\s\S]*?)\n---/.exec(text);
  const m = fm && /^inclusion:\s*["']?([A-Za-z-]+)["']?\s*$/m.exec(fm[1]);
  return m ? m[1] : null;
}

/** Installed guidance: `.harness/steering/*.md` (with inclusion) and `.agents/skills/<n>/SKILL.md`. */
export function installedGuidance(root) {
  const items = [];
  for (const name of listDir(join(root, '.harness/steering'))) {
    if (!name.endsWith('.md')) continue;
    const path = `.harness/steering/${name}`;
    if (!isFile(join(root, path))) continue;
    let inclusion = null;
    try {
      inclusion = inclusionOf(readFileSync(join(root, path), 'utf8'));
    } catch {
      inclusion = null;
    }
    items.push({ path, type: 'steering', inclusion });
  }
  for (const name of listDir(join(root, '.agents/skills'))) {
    const path = `.agents/skills/${name}/SKILL.md`;
    if (isFile(join(root, path))) items.push({ path, type: 'skill', inclusion: null });
  }
  return items;
}

/** Runtime columns: project.json `runtimes`, each with how its loads are measured. */
function runtimeColumns(root) {
  const config = readJson(join(root, '.harness/config/project.json'));
  const runtimes = Array.isArray(config?.runtimes) ? config.runtimes.filter((r) => typeof r === 'string' && r) : [];
  let claudeWired = false;
  try {
    claudeWired = /\bobserve\b/.test(readFileSync(join(root, '.claude/settings.json'), 'utf8'));
  } catch {
    claudeWired = false;
  }
  return runtimes.map((runtime) => {
    if (runtime === 'claude') return { runtime, measured: claudeWired ? 'observed' : 'hook not wired' };
    if (HOOKLESS.has(runtime)) return { runtime, measured: 'not measured' };
    return { runtime, measured: 'unknown' };
  });
}

const isActivation = (s) =>
  s !== null &&
  typeof s === 'object' &&
  !Array.isArray(s) &&
  s.kind === 'tool' &&
  s.attributes !== null &&
  typeof s.attributes === 'object' &&
  typeof s.attributes.target_path === 'string';

/**
 * REQ-001: installed vs loaded per steering file and skill over `window` days (or `all`), from the bounded telemetry
 * tail. Items never loaded in the window are flagged. Loaded paths that are not installed are listed in `extra`.
 */
export function activationInsights(root, { window = '30', now = Date.now() } = {}) {
  const win = WINDOW_RE.test(String(window)) ? String(window) : '30';
  const since = win === 'all' ? null : now - Number(win) * DAY_MS;
  const tail = readTail(root);
  const records = [];
  let malformed = 0;
  for (const { text } of tail.lines) {
    let obj;
    try {
      obj = JSON.parse(text);
    } catch {
      malformed += 1;
      continue;
    }
    if (!isActivation(obj)) continue;
    const at = Date.parse(obj.start_time_iso);
    if (since !== null && !(at >= since)) continue;
    records.push(obj);
  }

  const counts = new Map();
  for (const r of records) {
    const path = r.attributes.target_path;
    const runtime = typeof r.runtime === 'string' && r.runtime ? r.runtime : 'unknown';
    const entry = counts.get(path) ?? { total: 0, by_runtime: {} };
    entry.total += 1;
    entry.by_runtime[runtime] = (entry.by_runtime[runtime] ?? 0) + 1;
    counts.set(path, entry);
  }
  const installed = installedGuidance(root);
  const known = new Set(installed.map((i) => i.path));
  const items = installed.map((i) => {
    const loads = counts.get(i.path) ?? { total: 0, by_runtime: {} };
    return { ...i, loads, never_loaded: loads.total === 0 };
  });
  const extra = [...counts.entries()]
    .filter(([path]) => !known.has(path))
    .map(([path, loads]) => ({ path, loads }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const streamExists = existsSync(join(root, '.harness/state/telemetry/spans.jsonl'));
  const anyActivation = tail.lines.some(({ text }) => {
    try {
      return isActivation(JSON.parse(text));
    } catch {
      return false;
    }
  });
  const present = streamExists && anyActivation;
  return {
    source: present ? 'present' : 'absent',
    ...(present ? {} : { hint: HINTS.activation }),
    window_days: win === 'all' ? null : Number(win),
    window: win,
    runtimes: runtimeColumns(root),
    records_in_window: records.length,
    never_loaded: items.filter((i) => i.never_loaded).length,
    items,
    extra,
    tail: { lines_read: tail.lines.length, from_start: tail.fromStart, malformed_skipped: malformed },
  };
}

/** REQ-002: compact skill-eval suite: per skill and case, pass/fail, delta, first failures; no probe output. */
export function summarizeSkillEval(suite, { generatedAt = new Date().toISOString() } = {}) {
  const skills = Array.isArray(suite?.skills) ? suite.skills : [];
  const total = Number(suite?.total) || 0;
  if (skills.length === 0 || total === 0) return { source: 'absent', hint: HINTS.skillEval, generated_at: generatedAt };
  return {
    source: 'present',
    generated_at: generatedAt,
    ok: Boolean(suite.ok),
    total,
    passed: Number(suite.passed) || 0,
    failed: Number(suite.failed) || 0,
    baseline: typeof suite.baseline === 'string' ? suite.baseline : null,
    regressed: Array.isArray(suite.regressed) ? suite.regressed.map(String) : [],
    skills: skills.map((s) => ({
      name: String(s.name ?? ''),
      total: Number(s.total) || 0,
      passed: Number(s.passed) || 0,
      failed: Number(s.failed) || 0,
      cases: (Array.isArray(s.results) ? s.results : []).map((r) => ({
        id: String(r.id ?? ''),
        ok: Boolean(r.ok),
        ...(typeof r.delta === 'string' ? { delta: r.delta } : {}),
        failures: (Array.isArray(r.failures) ? r.failures : []).slice(0, 3).map((f) => String(typeof f === 'string' ? f : f?.detail ?? f?.type ?? f).slice(0, 200)),
      })),
    })),
  };
}

/**
 * Runs `node <bin> skill-eval --json [--baseline <ref>]` in `root`: argv only (no shell), bounded time and output.
 * skill-eval exits 1 when a fixture fails, so stdout is parsed whatever the exit code.
 */
export function runSkillEvalCli({ root, bin, baseline, timeoutMs = 120_000 }) {
  const args = [bin, 'skill-eval', '--json', ...(baseline ? ['--baseline', baseline] : [])];
  return new Promise((resolve, reject) => {
    execFile(process.execPath, args, { cwd: root, timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, windowsHide: true }, (err, stdout) => {
      try {
        resolve(JSON.parse(String(stdout || '')));
      } catch {
        reject(new Error(err ? `asdd skill-eval failed: ${err.message.split('\n')[0]}` : 'asdd skill-eval printed no JSON'));
      }
    });
  });
}

/** In-memory cache per baseline: a GET runs skill-eval only when nothing is cached or `refresh` is set. */
export function createSkillEvalRunner({ root, bin, run } = {}) {
  const runner = typeof run === 'function' ? run : (opts) => runSkillEvalCli({ root, bin, ...opts });
  const cache = new Map();
  return async function get({ refresh = false, baseline = null } = {}) {
    const key = baseline ?? '';
    if (!refresh && cache.has(key)) return cache.get(key);
    let model;
    try {
      model = summarizeSkillEval(await runner({ baseline }));
    } catch (err) {
      model = { source: 'error', error: String(err?.message || err), hint: HINTS.skillEval, generated_at: new Date().toISOString() };
    }
    cache.set(key, model);
    return model;
  };
}

/** REQ-003: `metrics.cost` (contract owned by slice cost-metrics) passed through; absent when it is missing. */
export function costInsights(metrics) {
  const cost = metrics && typeof metrics === 'object' ? metrics.cost : null;
  if (!cost || typeof cost !== 'object' || Array.isArray(cost)) return { source: 'absent', hint: HINTS.cost };
  const list = (v) => (Array.isArray(v) ? v : []);
  return {
    source: 'present',
    sources: list(cost.source).map(String),
    totals: cost.totals && typeof cost.totals === 'object' ? cost.totals : {},
    by_slice: list(cost.by_slice),
    by_phase: list(cost.by_phase),
    by_model: list(cost.by_model),
    by_runtime: list(cost.by_runtime),
    unknown_runtimes: list(cost.unknown_runtimes).map(String),
  };
}
