#!/usr/bin/env node
/**
 * asdd profile — read-only telemetry report (telemetry-emitters TASK-013; REQ-020…REQ-023, REQ-004; design §4.6, §6).
 *
 * Usage: asdd profile [--slice <id>] [--bottlenecks] [--json]
 *   --slice <id>    phase durations, gate/hook/sync latency, surface scores, and the activation table of one slice
 *   --bottlenecks   rank every slice with attributed spans in the tail (max surface score, sum, slice_id)
 *   --json          one JSON document (alone: every slice; combinable with --slice and --bottlenecks)
 *
 * Exit 0 report, 2 usage error, 3 when the target has neither spans in the tail nor a session `phase_started`.
 * Reads the bounded tail of the stream (readTail), session files, steering frontmatter, installed skills,
 * project.json `runtimes`, and the hook configs. Writes nothing, emits nothing, and keys only on slice_id, phase,
 * kind (AR-10): span topology fields are never read.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readSessions } from './sync-state.mjs';
import { ACTIVATION_LEGEND, profileModel, readTail } from './telemetry-lib.mjs';
import { parseSteeringFrontmatter } from './validators/steering-tags.mjs';

const USAGE = 'usage: asdd profile [--slice <id>] [--bottlenecks] [--json]';
const SLICE_ID_RE = /^[a-z0-9_-]+$/;
const OBSERVE_CMD_RE = /(asdd(\.mjs)?|"\$b") observe\b/;
const FOOTER = 'Test thrash (H-BOOT, H-LOOP inputs) is not measured; H-* findings are not reported in this version.';

// --- arguments ---

/** { slice, bottlenecks, json } or { error } (REQ-023: unknown option, --slice without an id, no mode). */
export function parseArgs(argv) {
  const opts = { slice: null, bottlenecks: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (a === '--bottlenecks') opts.bottlenecks = true;
    else if (a === '--slice') {
      const id = argv[i + 1];
      if (typeof id !== 'string' || id.startsWith('-') || !SLICE_ID_RE.test(id)) return { error: '--slice needs a slice id' };
      opts.slice = id;
      i += 1;
    } else return { error: `unknown option: ${a}` };
  }
  if (!opts.slice && !opts.bottlenecks && !opts.json) return { error: 'no mode given' };
  return opts;
}

// --- read-only inputs ---

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
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

/** Parsed tail: span objects, plus how many lines were read and skipped as malformed (REQ-022). */
function readSpans(root) {
  const tail = readTail(root);
  const spans = [];
  let malformed = 0;
  for (const { text } of tail.lines) {
    let obj;
    try {
      obj = JSON.parse(text);
    } catch {
      obj = undefined;
    }
    if (isObject(obj)) spans.push(obj);
    else malformed += 1;
  }
  return { spans, tail: { lines_read: tail.lines.length, from_start: tail.fromStart, malformed_skipped: malformed } };
}

function sessionsOf(root, sliceId) {
  return readSessions(join(root, '.harness/state/slices', sliceId));
}

function hasPhaseStarted(sessions) {
  return sessions.some((s) => isObject(s) && s.event_type === 'phase_started');
}

/** `.harness/steering/*.md` with parsed frontmatter (the steering-tags parser, REQ-021). */
function readSteering(root) {
  const out = [];
  for (const name of listDir(join(root, '.harness/steering'))) {
    if (!name.endsWith('.md')) continue;
    const rel = `.harness/steering/${name}`;
    if (!isFile(join(root, rel))) continue;
    let fm = null;
    try {
      fm = parseSteeringFrontmatter(readFileSync(join(root, rel), 'utf8'));
    } catch {
      fm = null;
    }
    if (fm) out.push({ path: rel, inclusion: fm.inclusion, tags: fm.tags });
  }
  return out;
}

function readSkills(root) {
  return listDir(join(root, '.agents/skills'))
    .map((n) => `.agents/skills/${n}/SKILL.md`)
    .filter((rel) => isFile(join(root, rel)));
}

function readRuntimes(root) {
  const project = readJson(join(root, '.harness/config/project.json'));
  return isObject(project) && Array.isArray(project.runtimes) ? project.runtimes : undefined;
}

function commandsOf(entries) {
  const out = [];
  for (const e of Array.isArray(entries) ? entries : []) {
    if (!isObject(e)) continue;
    if (typeof e.command === 'string') out.push(e.command);
    for (const h of Array.isArray(e.hooks) ? e.hooks : []) if (isObject(h) && typeof h.command === 'string') out.push(h.command);
  }
  return out;
}

/** True per runtime when the project's hook config holds the observe entry (design §12.1-§12.2). */
function readObserveHooks(root) {
  const claude = readJson(join(root, '.claude/settings.json'));
  const cursor = readJson(join(root, '.cursor/hooks.json'));
  const has = (cfg, event) => isObject(cfg) && isObject(cfg.hooks) && commandsOf(cfg.hooks[event]).some((c) => OBSERVE_CMD_RE.test(c));
  return { claude: has(claude, 'PostToolUse'), cursor: has(cursor, 'beforeReadFile') };
}

/** Files that enter context without a tool call, computed now (REQ-021, Q-9). */
function readConfigured(root) {
  const out = [];
  if (isFile(join(root, 'CLAUDE.md'))) out.push({ path: 'CLAUDE.md', runtime: 'claude' });
  for (const name of listDir(join(root, '.cursor/rules'))) {
    if (!name.endsWith('.mdc')) continue;
    let text = '';
    try {
      text = readFileSync(join(root, '.cursor/rules', name), 'utf8');
    } catch {
      continue;
    }
    const fm = text.startsWith('---\n') ? text.slice(4, Math.max(4, text.indexOf('\n---', 4))) : '';
    if (/^alwaysApply:\s*true\s*$/m.test(fm)) out.push({ path: `.cursor/rules/${name}`, runtime: 'cursor' });
  }
  if (isFile(join(root, '.harness/steering/skills.md'))) out.push({ path: '.harness/steering/skills.md', runtime: 'all' });
  return out;
}

// --- model ---

function sliceIds(root, spans) {
  const ids = new Set();
  for (const id of listDir(join(root, '.harness/state/slices'))) {
    if (SLICE_ID_RE.test(id) && hasPhaseStarted(sessionsOf(root, id))) ids.add(id);
  }
  for (const s of spans) if (typeof s.slice_id === 'string' && SLICE_ID_RE.test(s.slice_id)) ids.add(s.slice_id);
  return [...ids].sort();
}

function modelOf(ctx, sliceId) {
  return profileModel({ sliceId, spans: ctx.spans, sessions: sessionsOf(ctx.root, sliceId), ...ctx.config });
}

function hasTelemetry(ctx, sliceId) {
  return ctx.spans.some((s) => s.slice_id === sliceId) || hasPhaseStarted(sessionsOf(ctx.root, sliceId));
}

/** --bottlenecks: slices with attributed spans, by max score desc, sum desc, slice_id asc (in memory). */
function rankBottlenecks(ctx) {
  const ranked = [];
  for (const id of ctx.ids) {
    const m = modelOf(ctx, id);
    if (m.attributed_spans === 0) continue;
    const scores = m.scores.map((s) => s.score);
    ranked.push({ slice_id: id, max_score: Math.max(...scores), sum_score: scores.reduce((a, b) => a + b, 0), scores: m.scores });
  }
  return ranked.sort((a, b) => b.max_score - a.max_score || b.sum_score - a.sum_score || (a.slice_id < b.slice_id ? -1 : 1));
}

function jsonEntry(m) {
  return {
    slice_id: m.slice_id,
    phase_durations: m.phase_durations,
    latencies: m.latencies,
    activation: m.activation,
    scores: m.scores,
    attributed_spans: m.attributed_spans,
    unattributed_spans: m.unattributed_spans,
    not_measured: m.not_measured,
  };
}

// --- text rendering ---

function fmtDuration(ms) {
  if (ms >= 3_600_000) return `${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
  if (ms >= 60_000) return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
  return `${ms} ms`;
}

function table(rows) {
  const widths = [];
  for (const r of rows) r.forEach((c, i) => (widths[i] = Math.max(widths[i] || 0, String(c).length)));
  return rows.map((r) => r.map((c, i) => (i === r.length - 1 ? String(c) : String(c).padEnd(widths[i]))).join('  '));
}

function indent(lines) {
  return lines.map((l) => `  ${l}`);
}

function renderPhases(m) {
  const out = ['Phase durations (session phase events):'];
  if (m.phase_durations.length === 0) return [...out, '  no phase events'];
  const rows = [['phase', 'status', 'start', 'end', 'duration', 'start source']];
  for (const p of m.phase_durations) {
    rows.push([
      p.phase,
      p.status,
      p.start_iso || '-',
      p.end_iso || '-',
      typeof p.duration_ms === 'number' ? fmtDuration(p.duration_ms) : '-',
      `${p.start_source || '-'}${p.open_since_iso ? ` (open again since ${p.open_since_iso})` : ''}`,
    ]);
  }
  return [...out, ...indent(table(rows))];
}

function renderLatencies(m) {
  const out = ['Latency of attributed spans (duration_ms, nearest rank):'];
  for (const kind of ['command', 'hook', 'sync']) {
    const l = m.latencies[kind];
    out.push(l ? `  ${kind.padEnd(7)}  n=${l.count}  p50=${l.p50} ms  p95=${l.p95} ms` : `  ${kind.padEnd(7)}  no spans`);
  }
  return out;
}

function renderScores(m) {
  const out = ['Bottleneck score per surface (hits 0: no H-* heuristic evaluated):'];
  m.scores.forEach((s, i) => {
    const share = s.share_unknown ? 'share unknown' : `share ${(s.share * 100).toFixed(1)}%`;
    out.push(`  ${i + 1}. ${s.surface.padEnd(7)}  score ${s.score}  ${share}`);
  });
  return out;
}

function renderActivation(m) {
  const out = [];
  const details = [];
  for (const a of m.activation) {
    out.push(`Activation (phase ${a.phase}):`);
    if (!a.runtimes_configured) out.push('  runtimes not configured (.harness/config/project.json has no runtimes; columns are the runtimes seen in records)');
    const rows = [['target', ...a.columns]];
    for (const row of a.rows) {
      rows.push([row.target, ...a.columns.map((c) => row.cells[c].label)]);
      for (const c of a.columns) {
        const cell = row.cells[c];
        if (cell.state === 'observed') {
          details.push(`  ${a.phase}: ${row.target} [${c}]: sessions ${cell.runtime_session_ids.join(', ')}; agents ${cell.agent_ids.join(', ')}`);
        }
      }
    }
    if (a.rows.length === 0) out.push('  no expected or observed guidance');
    else out.push(...indent(table(rows)));
    out.push('');
  }
  if (details.length > 0) out.push('Observed records (runtime session ids; agent ids):', ...details, '');
  const configured = m.activation[0]?.configured || [];
  if (configured.length > 0) {
    out.push('Configured, not observed (enter context without a tool call):');
    out.push(...indent(table(configured.map((c) => [c.target, `[${c.runtime}]`, c.label]))));
    out.push('');
  }
  out.push('Legend:', ...ACTIVATION_LEGEND.map((l) => `  - ${l.state}: ${l.meaning}`));
  return out;
}

function renderSlice(m, tail) {
  const out = [`asdd profile: slice ${m.slice_id}`, `tail: ${tail.lines_read} lines read, malformed lines skipped: ${tail.malformed_skipped}`, ''];
  out.push(...renderPhases(m), '');
  if (m.attributed_spans === 0) {
    out.push(`no attributed spans for ${m.slice_id} (unattributed spans in the tail: ${m.unattributed_spans})`);
    return out;
  }
  out.push(...renderLatencies(m), '', ...renderScores(m), '');
  out.push(`unattributed spans in the tail: ${m.unattributed_spans}`, '');
  out.push(...renderActivation(m));
  return out;
}

function renderBottlenecks(ranked, unattributed) {
  const out = ['asdd profile: bottlenecks (max surface score, then sum, then slice_id)'];
  if (ranked.length === 0) {
    out.push(`no slice has attributed spans in the tail (unattributed spans in the tail: ${unattributed})`);
    return out;
  }
  ranked.forEach((r, i) => {
    const parts = r.scores.map((s) => `${s.surface} ${s.score}`).join(', ');
    out.push(`  ${i + 1}. ${r.slice_id}  max ${r.max_score}  sum ${r.sum_score}  (${parts})`);
  });
  return out;
}

// --- main ---

export function main(argv = process.argv.slice(2), root = process.cwd()) {
  const opts = parseArgs(argv);
  if (opts.error) {
    process.stderr.write(`asdd profile: ${opts.error}\n${USAGE}\n`);
    return 2;
  }
  const { spans, tail } = readSpans(root);
  const ctx = {
    root,
    spans,
    config: {
      steering: readSteering(root),
      skills: readSkills(root),
      runtimes: readRuntimes(root),
      observeHooks: readObserveHooks(root),
      configured: readConfigured(root),
    },
  };
  ctx.ids = sliceIds(root, spans);

  const targets = opts.slice ? [opts.slice] : ctx.ids;
  if (opts.slice ? !hasTelemetry(ctx, opts.slice) : targets.length === 0) {
    process.stderr.write(`asdd profile: no telemetry exists for ${opts.slice || 'any slice'}\n`);
    return 3;
  }
  const unattributed = spans.filter((s) => s.slice_id === null || s.slice_id === undefined).length;
  const ranked = opts.bottlenecks ? rankBottlenecks(ctx) : null;

  if (opts.json) {
    const doc = { schema_version: '1.0', generated_at: new Date().toISOString(), tail, slices: targets.map((id) => jsonEntry(modelOf(ctx, id))) };
    if (ranked) doc.bottlenecks = ranked;
    process.stdout.write(`${JSON.stringify(doc, null, 2)}\n`);
    return 0;
  }
  const out = [];
  if (ranked) out.push(...renderBottlenecks(ranked, unattributed), '');
  if (opts.slice) out.push(...renderSlice(modelOf(ctx, opts.slice), tail), '');
  out.push(FOOTER);
  process.stdout.write(`${out.join('\n')}\n`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main();
}
