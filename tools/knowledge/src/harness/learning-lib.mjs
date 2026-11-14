// GENERATED from cli/src/harness/learning-lib.mjs by asdd kit vendor: edit the source, then rerun it.
/**
 * Self-improving harness: signals → patterns → steering proposals → measured effect.
 *
 * Deterministic and read-only except for the two writers below. Shared by
 * learn.mjs, sync-state.mjs, validators/learning.mjs, verify-on-stop.mjs,
 * harness-status.mjs, and the knowledge MCP server.
 *
 * Signals are read where they already live:
 *   - sensor     FAIL lines of a recorded invariants run (`check-invariants.mjs --live` or `--record`):
 *                raw files in .harness/state/learning/signals/ (local, gitignored), folded by
 *                compactSignals into .harness/state/learning/summaries/<week>-<author>.json (committed)
 *   - warn       WARN lines of a recorded run that keep firing on many days (QG-LEARN-08)
 *   - command    commands denied by the command gate (raw files too; the command text is never stored)
 *   - failure    agent failure log entries with a **Signature:** line (QG-DEB-05)
 *   - override   session `override` events (a gate was acknowledged past)
 *   - blocked    session `phase_blocked` / `feature_blocked` events
 *   - dissent    session `dissent` events
 *   - dismissed  Tech Lead dismissals in .harness/audits/triage.json
 *   - audit      recurring findings in the latest audit report
 *   - escalation lite escalation signals (E1…E5), once per slice
 *   - review     draft comments a human removed from a spec-drift PR review, per checklist rule: ingested by
 *                ingestReviewMetrics from the reviewer's local metrics.jsonl into the weekly summary (counts only)
 *
 * Writers: writeSensorSignal (check-invariants), compactSignals, ingestReviewMetrics and writePatterns (learn.mjs).
 * Cutoffs mirror QG-LEARN-* in .harness/steering/quality-gates.md.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { readBinding } from './drift-lib.mjs';
import { latestReport, loadTriage } from './audit-lib.mjs';
import { deriveEscalationSignals, readSessions } from './sync-state.mjs';

export const OCCURRENCE_THRESHOLD = 3; // QG-LEARN-02
export const WARN_DAYS_THRESHOLD = 5; // QG-LEARN-08: a WARN seen on 5 distinct days is noise
export const VERIFY_WINDOW_SESSIONS = 10; // QG-LEARN-06
export const EPISODE_GAP_MS = 30 * 60 * 1000; // QG-LEARN-01: repeated stop blocks within 30 min are one occurrence

export const SIGNALS_DIR = '.harness/state/learning/signals';
export const SUMMARIES_DIR = '.harness/state/learning/summaries';
export const PATTERNS_FILE = '.harness/state/learning/patterns.json';
export const PROPOSALS_DIR = 'docs/knowledge-base/steering-proposals';
export const PROPOSAL_TEMPLATE = '.harness/steering/templates/steering-proposal.md';
const DEFAULT_FAILURE_LOG = 'docs/agent-failure-log.md';

export const PROPOSAL_STATUSES = ['proposed', 'accepted', 'rejected', 'applied'];
export const CHANGE_TYPES = ['add-guide', 'tighten-guide', 'add-sensor', 'tighten-sensor', 'loosen-sensor', 'remove-sensor', 'product-code'];
// Noise sources mean a sensor fires or blocks without catching a real defect.
const NOISE_SOURCES = new Set(['override', 'dismissed', 'warn', 'review']);
// WARN lines that are already signals of their own, or about the loop itself.
const SKIPPED_WARNS = [/^QG-LEARN-/, /^lite slice "/];

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

export function patternId(signature) {
  return `LP-${createHash('sha1').update(signature).digest('hex').slice(0, 8)}`;
}

/** Top-level area of a path: `docs`, `src`, or two segments for dot-dirs (`.harness/steering`). */
export function pathScope(path) {
  const parts = String(path).replace(/^\.\//, '').split('/').filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? '';
  return parts[0].startsWith('.') ? `${parts[0]}/${parts[1]}` : parts[0];
}

/**
 * Signature of one invariant FAIL line: the check code plus the first path's area
 * (`DRIFT-01:docs`), or the message with names, paths, and numbers blanked out.
 */
export function invariantSignature(message, prefix = 'sensor') {
  const text = String(message).replace(/^(FAIL|WARN)\s+/, '').trim();
  const code = text.match(/^([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+)\b/)?.[1];
  // The token after the code is usually the path (`DRIFT-01 README.md changed …`); else the first a/b path.
  const next = code ? text.slice(code.length).trim().split(/\s+/)[0] : '';
  const path = /\/|\.\w+$/.test(next) ? next : text.match(/(?:^|\s)((?:\.?[\w-]+\/)+[\w.*-]+)/)?.[1];
  if (code) return `${prefix}:${code}${path ? `:${pathScope(path)}` : ''}`;
  const shape = text
    .replace(/"[^"]*"/g, '"*"')
    .replace(/`[^`]*`/g, '`*`')
    .replace(/(?:\.?[\w-]+\/)+[\w.*-]+/g, '<path>')
    .replace(/\d+/g, 'N')
    .slice(0, 80);
  return `${prefix}:${shape}`;
}

function writeRaw(root, payload, now) {
  const dir = join(root, SIGNALS_DIR);
  mkdirSync(dir, { recursive: true });
  const name = `${now.toISOString().replace(/[:.]/g, '-')}-${process.pid}-${payload.source}.json`;
  writeFileSync(join(dir, name), `${JSON.stringify({ schema_version: '1.0', timestamp: now.toISOString(), ...payload }, null, 2)}\n`);
  return `${SIGNALS_DIR}/${name}`;
}

const clean = (lines) => [...new Set(lines.map((l) => String(l).replace(/^(FAIL|WARN)\s+/, '').trim()).filter(Boolean))];

/**
 * Record one invariants run: its FAIL lines, and its WARN lines (QG-LEARN-08).
 * Never throws: a learning write must not break a gate.
 */
export function writeSensorSignal(root, failLines, { warns = [], runtime = null, now = new Date() } = {}) {
  try {
    const fails = clean(failLines);
    const kept = clean(warns).filter((w) => !SKIPPED_WARNS.some((re) => re.test(w)));
    if (!fails.length && !kept.length) return null;
    return writeRaw(root, { source: 'check-invariants', runtime, fails, warns: kept }, now);
  } catch {
    return null;
  }
}

/** Record a command the gate denied, by pattern label only — never the command text. Never throws. */
export function writeCommandSignal(root, label, { runtime = null, now = new Date() } = {}) {
  try {
    return writeRaw(root, { source: 'command-gate', runtime, signals: [{ signature: `command:${label}`, detail: `denied: ${label}` }] }, now);
  } catch {
    return null;
  }
}

/**
 * Slice session directories: active slices, then archived ones. Archiving a slice
 * must not erase its learning evidence, so archived sessions still count.
 */
function sliceDirs(root) {
  const out = [];
  for (const base of ['.harness/state/slices', '.harness/state/archive']) {
    const dir = join(root, base);
    if (!existsSync(dir)) continue;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue;
      if (base.endsWith('archive') && !existsSync(join(dir, e.name, 'sessions'))) continue;
      if (out.some((s) => s.id === e.name)) continue;
      out.push({ id: e.name, dir: join(dir, e.name) });
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

function sliceIds(root) {
  return sliceDirs(root).map((s) => s.id);
}

function git(root, args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

/** Who owns a summary file: HARNESS_AUTHOR, else the git user name, as a slug. */
export function authorSlug(root) {
  const raw = process.env.HARNESS_AUTHOR || git(root, ['config', 'user.name']) || 'local';
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'local';
}

/** ISO-8601 week of a timestamp, e.g. `2026-W44`. */
export function isoWeek(iso) {
  const d = new Date(iso);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function rawSignalFiles(root) {
  const dir = join(root, SIGNALS_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith('.json'))
    .sort()
    .map((n) => ({ path: join(dir, n), data: readJson(join(dir, n)) }))
    .filter((f) => f.data?.timestamp && (Array.isArray(f.data.fails) || Array.isArray(f.data.signals)));
}

function attribute(line, slices) {
  // Attribute to a slice only when the line names exactly one.
  const named = slices.filter((id) => line.includes(id));
  return named.length === 1 ? named[0] : null;
}

/** One entry per distinct signature in a raw file. Run signals are episodic (QG-LEARN-01). */
function rawEntries(data, slices) {
  const seen = new Map();
  const add = (signature, source, line) => {
    if (!seen.has(signature)) seen.set(signature, { signature, source, at: data.timestamp, slice_id: attribute(line, slices), detail: line, episodic: true });
  };
  for (const line of data.fails ?? []) add(invariantSignature(line), 'sensor', line);
  for (const line of data.warns ?? []) add(invariantSignature(line, 'warn'), 'warn', line);
  for (const sig of data.signals ?? []) if (sig?.signature) add(sig.signature, sig.signature.split(':')[0], sig.detail ?? sig.signature);
  return [...seen.values()];
}

/**
 * Fold the local raw signal files into this author's weekly summary files and
 * delete them. Episodes are collapsed here (QG-LEARN-01), so a summary entry is
 * one occurrence. One writer per summary file: the author named in its file name.
 */
export function compactSignals(root, { author = authorSlug(root) } = {}) {
  const files = rawSignalFiles(root);
  if (!files.length) return { compacted: 0, summaries: [] };
  const slices = sliceIds(root);
  const byWeek = new Map();
  for (const f of files) {
    const week = isoWeek(f.data.timestamp);
    if (!byWeek.has(week)) byWeek.set(week, []);
    byWeek.get(week).push(...rawEntries(f.data, slices));
  }
  const written = [];
  for (const [week, entries] of byWeek) {
    const rel = `${SUMMARIES_DIR}/${week}-${author}.json`;
    const summary = readJson(join(root, rel)) ?? { schema_version: '1.0', author, week, signatures: {} };
    for (const e of entries.sort((a, b) => a.at.localeCompare(b.at))) {
      const slot = (summary.signatures[e.signature] ??= { source: e.source, episodes: [], examples: [] });
      const last = slot.episodes.at(-1);
      if (last && Date.parse(e.at) - Date.parse(last.last_at ?? last.at) < EPISODE_GAP_MS) {
        last.last_at = e.at;
      } else {
        slot.episodes.push({ at: e.at, slice_id: e.slice_id });
      }
      if (slot.examples.length < 3 && !slot.examples.includes(e.detail)) slot.examples.push(e.detail);
    }
    mkdirSync(join(root, SUMMARIES_DIR), { recursive: true });
    writeFileSync(join(root, rel), `${JSON.stringify(summary, null, 2)}\n`);
    written.push(rel);
  }
  for (const f of files) rmSync(f.path, { force: true });
  return { compacted: files.length, summaries: written };
}

// ── PR review quality (review-quality REQ-005) ─────────────────────────────────

/**
 * The spec-drift PR reviewer's publish log on this machine: `$PR_REVIEW_ROOT/metrics.jsonl`, else
 * `$XDG_STATE_HOME/pr-review/metrics.jsonl` (default `~/.local/state`), as the server writes it.
 */
export function reviewMetricsFile(env = process.env) {
  const base = env.PR_REVIEW_ROOT || join(env.XDG_STATE_HOME || join(homedir(), '.local/state'), 'pr-review');
  return join(base, 'metrics.jsonl');
}

/** The reviewer names a project by its repository folder; HARNESS_REVIEW_PROJECT overrides it. */
export function reviewProject(root, env = process.env) {
  return env.HARNESS_REVIEW_PROJECT || basename(root);
}

const reviewKey = (r) => `${r.pr}@${r.revision}`;

const tallyOf = (t) => ({
  drafted: Number(t?.drafted) || 0,
  kept: Number(t?.kept) || 0,
  edited: Number(t?.edited) || 0,
  removed: Number(t?.removed) || 0,
});

function summaryFiles(root) {
  const dir = join(root, SUMMARIES_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith('.json'))
    .sort()
    .map((n) => ({ rel: `${SUMMARIES_DIR}/${n}`, data: readJson(join(dir, n)) }))
    .filter((f) => f.data);
}

/** Every recorded review of this project across all authors' summaries, once per PR revision. */
export function recordedReviews(root) {
  const out = new Map();
  for (const { data } of summaryFiles(root)) {
    for (const [key, r] of Object.entries(data.reviews ?? {})) if (!out.has(key)) out.set(key, { key, author: data.author, ...r });
  }
  return [...out.values()].sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

/**
 * Fold this project's published reviews from the local publish log into the author's weekly summaries (one writer per
 * file): counts per checklist rule, the PR number and revision — never comment text. A review already recorded by
 * anyone is skipped. Never throws: learning must not break a command.
 */
export function ingestReviewMetrics(root, { author = authorSlug(root), file = reviewMetricsFile(), project = reviewProject(root) } = {}) {
  try {
    if (!existsSync(file)) return { ingested: 0, file, project };
    const known = new Set(recordedReviews(root).map((r) => r.key));
    const byWeek = new Map();
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      let r;
      try {
        r = line.trim() ? JSON.parse(line) : null;
      } catch {
        r = null;
      }
      if (!r || r.project !== project || !Number.isInteger(r.pr) || !r.at || known.has(reviewKey(r))) continue;
      known.add(reviewKey(r));
      const week = isoWeek(r.at);
      if (!byWeek.has(week)) byWeek.set(week, []);
      byWeek.get(week).push({
        key: reviewKey(r),
        at: r.at,
        pr: r.pr,
        revision: r.revision ?? 1,
        mode: r.mode ?? null,
        event: r.event ?? null,
        suggested_event: r.suggestedEvent ?? null,
        comments: { ...tallyOf(r.comments), added: Number(r.comments?.added) || 0 },
        by_rule: Object.fromEntries(Object.entries(r.byRule ?? {}).map(([rule, t]) => [rule, tallyOf(t)])),
      });
    }
    let ingested = 0;
    for (const [week, reviews] of byWeek) {
      const rel = `${SUMMARIES_DIR}/${week}-${author}.json`;
      const summary = readJson(join(root, rel)) ?? { schema_version: '1.0', author, week, signatures: {} };
      summary.reviews ??= {};
      for (const { key, ...r } of reviews) summary.reviews[key] = r;
      mkdirSync(join(root, SUMMARIES_DIR), { recursive: true });
      writeFileSync(join(root, rel), `${JSON.stringify(summary, null, 2)}\n`);
      ingested += reviews.length;
    }
    return { ingested, file, project };
  } catch {
    return { ingested: 0, file, project };
  }
}

/** One `review:<rule>` noise signal per rule and review with removed draft comments, weighted by how many. */
function reviewSignals(root) {
  const out = [];
  for (const r of recordedReviews(root)) {
    for (const [rule, t] of Object.entries(r.by_rule ?? {})) {
      if (!t.removed) continue;
      out.push({ signature: `review:${rule}`, source: 'review', at: r.at, slice_id: null, detail: `PR #${r.pr} r${r.revision}: ${t.removed} of ${t.drafted} draft comment(s) removed`, weight: t.removed });
    }
  }
  return out;
}

/** Team review quality from every recorded review: totals and the rules whose comments humans remove most. */
export function reviewQuality(root, { limit = 10 } = {}) {
  const reviews = recordedReviews(root);
  if (!reviews.length) return null;
  const totals = { drafted: 0, kept: 0, edited: 0, removed: 0, added: 0 };
  const rules = new Map();
  for (const r of reviews) {
    for (const k of Object.keys(totals)) totals[k] += Number(r.comments?.[k]) || 0;
    for (const [rule, t] of Object.entries(r.by_rule ?? {})) {
      const acc = rules.get(rule) ?? { rule, drafted: 0, kept: 0, edited: 0, removed: 0 };
      for (const k of ['drafted', 'kept', 'edited', 'removed']) acc[k] += Number(t[k]) || 0;
      rules.set(rule, acc);
    }
  }
  return {
    reviews: reviews.length,
    authors: [...new Set(reviews.map((r) => r.author).filter(Boolean))].sort(),
    first_at: reviews[0].at,
    last_at: reviews.at(-1).at,
    ...totals,
    acceptance: totals.drafted ? (totals.kept + totals.edited) / totals.drafted : null,
    by_rule: [...rules.values()]
      .sort((a, b) => b.removed - a.removed || b.drafted - a.drafted || a.rule.localeCompare(b.rule))
      .slice(0, limit),
  };
}

function runSignals(root, slices) {
  const out = [];
  for (const f of rawSignalFiles(root)) out.push(...rawEntries(f.data, slices));
  const dir = join(root, SUMMARIES_DIR);
  if (existsSync(dir)) {
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
      const summary = readJson(join(dir, name));
      for (const [signature, slot] of Object.entries(summary?.signatures ?? {})) {
        for (const ep of slot.episodes ?? []) {
          out.push({ signature, source: slot.source ?? 'sensor', at: ep.at, slice_id: ep.slice_id ?? null, detail: slot.examples?.[0] ?? signature, collapsed: true });
        }
      }
    }
  }
  return out;
}

/** Failure log path from the QG-BIND binding, else the kit default. */
export function failureLogPath(root) {
  return readBinding(root, '.harness/steering/quality-gates.project.md', 'Failure log path')[0] || DEFAULT_FAILURE_LOG;
}

/** Entries of the agent failure log, each starting at `- **Date:**`. Fenced blocks (the template) are ignored. */
export function parseFailureLog(text) {
  const body = text.replace(/```[\s\S]*?```/g, '');
  const entries = [];
  let current = null;
  for (const line of body.split('\n')) {
    const field = line.match(/^\s*-\s*\*\*([\w ]+):\*\*\s*(.*)$/);
    if (!field) continue;
    const key = field[1].trim().toLowerCase();
    const value = field[2].trim();
    if (key === 'date') {
      current = { date: value };
      entries.push(current);
    } else if (current) {
      current[key] = value;
    }
  }
  return entries;
}

function failureSignals(root) {
  const rel = failureLogPath(root);
  const p = join(root, rel);
  if (!existsSync(p)) return { signals: [], unsigned: 0 };
  const entries = parseFailureLog(readFileSync(p, 'utf8'));
  const signals = [];
  let unsigned = 0;
  for (const e of entries) {
    const sig = e.signature?.replace(/`/g, '').trim();
    if (!sig || sig === '<signature>') {
      unsigned += 1;
      continue;
    }
    signals.push({
      signature: `failure:${sig}`,
      source: 'failure',
      at: /^\d{4}-\d{2}-\d{2}/.test(e.date) ? e.date : null,
      slice_id: e.slice || null,
      detail: e.failure || sig,
    });
  }
  return { signals, unsigned };
}

function sessionSignals(root, slices) {
  const out = [];
  for (const { id, dir } of sliceDirs(root)) {
    if (!slices.includes(id)) continue;
    const sessions = readSessions(dir);
    const featureArea = new Map();
    for (const s of sessions) {
      if (s.event_type === 'feature_started' && Array.isArray(s.scope_paths) && s.scope_paths.length) featureArea.set(s.feature_id, pathScope(s.scope_paths[0]));
      if (s.event_type === 'phase_blocked') {
        out.push({ signature: `blocked:phase:${s.phase || 'unknown'}`, source: 'blocked', at: s.timestamp || null, slice_id: id, detail: s.evidence || s.note || `${s.phase} blocked` });
      }
      if (s.event_type === 'feature_blocked') {
        const area = featureArea.get(s.feature_id);
        out.push({ signature: `blocked:feature${area ? `:${area}` : ''}`, source: 'blocked', at: s.timestamp || null, slice_id: id, detail: s.evidence || s.note || `${s.feature_id} blocked` });
      }
      if (s.event_type === 'dissent') {
        out.push({ signature: `dissent:${s.phase || 'any'}`, source: 'dissent', at: s.timestamp || null, slice_id: id, detail: s.note || 'dissent' });
      }
      if (s.event_type !== 'override') continue;
      out.push({
        signature: `override:${s.phase || 'gate'}`,
        source: 'override',
        at: s.timestamp || null,
        slice_id: id,
        detail: s.note || s.evidence || `override on ${s.phase || 'gate'}`,
      });
    }
    const last = sessions.at(-1)?.timestamp ?? null;
    for (const e of deriveEscalationSignals(sessions)) {
      out.push({ signature: `escalation:${e.type}`, source: 'escalation', at: last, slice_id: id, detail: e.evidence });
    }
  }
  return out;
}

function auditSignals(root) {
  const out = [];
  for (const [id, entry] of Object.entries(loadTriage(root))) {
    if (entry?.decision !== 'dismissed') continue;
    out.push({ signature: `dismissed:${entry.check || 'unknown'}`, source: 'dismissed', at: entry.at || null, slice_id: null, detail: `${id}: ${entry.reason || ''}`.trim() });
  }
  const report = latestReport(root)?.report;
  const recurring = new Set(report?.recurring ?? []);
  for (const f of report?.findings ?? []) {
    if (!recurring.has(f.id)) continue;
    out.push({ signature: `audit:${f.id}`, source: 'audit', at: f.last_seen || report.generated_at || null, slice_id: f.slice_id || null, detail: f.message || f.check, weight: f.occurrences || 1 });
  }
  return out;
}

export function collectSignals(root) {
  const slices = sliceIds(root);
  const failures = failureSignals(root);
  return {
    signals: [...runSignals(root, slices), ...failures.signals, ...sessionSignals(root, slices), ...auditSignals(root), ...reviewSignals(root)],
    unsigned_failures: failures.unsigned,
  };
}

/**
 * Occurrences of one signature. Run signals within EPISODE_GAP_MS collapse into one
 * (summaries are already collapsed); WARN signals count distinct days (QG-LEARN-08);
 * audit signals carry their own count.
 */
export function countOccurrences(signals) {
  if (signals.length && signals.every((s) => s.source === 'warn')) {
    return new Set(signals.map((s) => String(s.at).slice(0, 10))).size;
  }
  let total = 0;
  let lastRun = null;
  const sorted = [...signals].sort((a, b) => String(a.at).localeCompare(String(b.at)));
  for (const s of sorted) {
    if ((s.episodic || s.source === 'sensor') && !s.collapsed) {
      const t = Date.parse(s.at);
      if (lastRun !== null && Number.isFinite(t) && t - lastRun < EPISODE_GAP_MS) {
        lastRun = t;
        continue;
      }
      lastRun = Number.isFinite(t) ? t : lastRun;
    }
    total += s.weight ?? 1;
  }
  return total;
}

/** Occurrences a signature needs to open: WARN-only patterns count days (QG-LEARN-08). */
export function thresholdFor(signals) {
  return signals.length && signals.every((s) => s.source === 'warn') ? WARN_DAYS_THRESHOLD : OCCURRENCE_THRESHOLD;
}

/** `key: value` frontmatter of a proposal file. */
export function parseProposal(text) {
  if (!text.startsWith('---\n')) return null;
  const end = text.indexOf('\n---', 4);
  if (end < 0) return null;
  const fields = {};
  for (const line of text.slice(4, end).split('\n')) {
    const m = line.match(/^([\w-]+):\s*(.*)$/);
    if (m) fields[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return fields;
}

export function loadProposals(root) {
  const dir = join(root, PROPOSALS_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => /^SP-\d+.*\.md$/.test(n))
    .sort()
    .map((n) => ({ file: `${PROPOSALS_DIR}/${n}`, ...(parseProposal(readFileSync(join(dir, n), 'utf8')) ?? {}) }));
}

function allSessions(root) {
  const out = [];
  for (const { id, dir } of sliceDirs(root)) {
    for (const s of readSessions(dir)) {
      if (s.timestamp) out.push({ timestamp: s.timestamp, slice_id: id, scope_paths: Array.isArray(s.scope_paths) ? s.scope_paths : [] });
    }
  }
  return out;
}

const DECIDED_STATUSES = new Set(['accepted', 'rejected', 'applied']);

/** Contract problems of one steering proposal (QG-LEARN-03, QG-LEARN-05). */
export function proposalFindings(root, proposal, patternIds) {
  const out = [];
  const where = proposal.file;
  const name = where.split('/').pop();
  if (!proposal.id) return [`${where}: missing frontmatter (id, pattern, status, control, change, success)`];
  if (!/^SP-\d{3,}$/.test(proposal.id) || !name.startsWith(proposal.id)) out.push(`${where}: id "${proposal.id}" must be SP-NNN and match the file name`);
  if (!proposal.pattern) out.push(`${where}: missing pattern`);
  else if (!patternIds.has(proposal.pattern)) out.push(`${where}: pattern ${proposal.pattern} matches no learning signal (run learn.mjs --all)`);
  if (!PROPOSAL_STATUSES.includes(proposal.status)) out.push(`${where}: status must be one of ${PROPOSAL_STATUSES.join(', ')} (got "${proposal.status ?? ''}")`);
  if (!CHANGE_TYPES.includes(proposal.change)) out.push(`${where}: change must be one of ${CHANGE_TYPES.join(', ')} (got "${proposal.change ?? ''}")`);
  const control = String(proposal.control ?? '').split('#')[0].trim();
  if (!control || control.startsWith('<')) out.push(`${where}: control must name the guide or sensor file to change`);
  else if (!existsSync(join(root, control))) out.push(`${where}: control ${control} does not exist`);
  if (!proposal.success || proposal.success.startsWith('<')) out.push(`${where}: success criterion is unfilled`);
  if (DECIDED_STATUSES.has(proposal.status) && !proposal.decided_by) out.push(`${where}: status ${proposal.status} needs decided_by (Tech Lead decision)`);
  if (proposal.status === 'applied' && !proposal.applied_commit) out.push(`${where}: status applied needs applied_commit (the commit that changed ${control || 'the control'})`);
  if (proposal.applied_at && !Number.isFinite(Date.parse(proposal.applied_at))) out.push(`${where}: applied_at must be an ISO date`);
  return out;
}

const NEXT_FOR_PATTERN = {
  proposed: (p) => `fill ${p.proposals[0]?.file ?? 'the proposal'} and ask the Tech Lead to decide (status accepted or rejected, decided_by)`,
  accepted: (p) => `apply the change to the control, then set status applied with applied_commit in ${p.proposals[0]?.file ?? 'the proposal'}`,
  applied: () => 'nothing: asdd learn verifies the change after the next sessions (QG-LEARN-06)',
  verified: () => null,
  watching: () => null,
};

/**
 * Read-only learning view (spec-drift `learning_report`, spec-drift-apps REQ-002): every pattern and proposal, what each
 * proposal still lacks (the same `proposalFindings` the invariants use), and the command a human runs next. Writes nothing.
 */
export function learningReport(root, { limit = 50 } = {}) {
  const proposals = loadProposals(root);
  const { patterns, unsigned_failures } = derivePatterns(root, { proposals });
  const ids = new Set(patterns.map((p) => p.id));
  const nextFor = (p) =>
    p.status === 'open' ? `asdd learn --propose ${p.id}` : (NEXT_FOR_PATTERN[p.status]?.(p) ?? null);
  return {
    summary: {
      patterns: patterns.length,
      open: patterns.filter((p) => p.status === 'open').length,
      in_flight: patterns.filter((p) => ['proposed', 'accepted', 'applied'].includes(p.status)).length,
      verified: patterns.filter((p) => p.status === 'verified').length,
      proposals: proposals.length,
      unsigned_failures,
    },
    patterns: patterns.slice(0, limit).map((p) => ({
      id: p.id,
      signature: p.signature,
      kind: p.kind,
      occurrences: p.occurrences,
      threshold: p.threshold,
      status: p.status,
      reopened: p.reopened,
      slices: p.slices,
      last_seen: p.last_seen,
      proposals: p.proposals.map((x) => ({ id: x.id, status: x.status })),
      next: nextFor(p),
    })),
    proposals: proposals.map((pr) => {
      const missing = proposalFindings(root, pr, ids).map((f) => f.slice(pr.file.length + 2));
      const decided = DECIDED_STATUSES.has(pr.status);
      return {
        id: pr.id ?? null,
        file: pr.file,
        pattern: pr.pattern ?? null,
        status: pr.status ?? null,
        change: pr.change ?? null,
        control: pr.control ?? null,
        decided_by: pr.decided_by ?? null,
        missing,
        next: missing.length
          ? `edit ${pr.file}: ${missing[0]}`
          : decided
            ? null
            : `Tech Lead: set status accepted or rejected, and decided_by, in ${pr.file}`,
      };
    }),
    // Team PR review quality (review-quality REQ-005); null until `asdd learn` has recorded a review.
    review_quality: reviewQuality(root),
  };
}

/** Area a pattern is about (`sensor:DRIFT-01:docs` → `docs`, `blocked:feature:src` → `src`), or null. */
export function signatureArea(signature) {
  const m = signature.match(/^(?:sensor|warn):[A-Z][A-Z0-9-]*-\d+:(.+)$/) ?? signature.match(/^blocked:feature:(.+)$/);
  return m ? m[1] : null;
}

/**
 * Compact learning view for review (spec-drift): open and reopened patterns,
 * marked `relevant` when they are about a changed file's area or a linked slice.
 */
export function learningForReview(root, { changed = [], slices = [], limit = 10 } = {}) {
  const { patterns } = derivePatterns(root);
  const touches = (area) => area && changed.some((f) => f === area || f.startsWith(`${area}/`));
  const open = patterns
    .filter((p) => p.status === 'open')
    .map((p) => ({
      id: p.id,
      signature: p.signature,
      kind: p.kind,
      occurrences: p.occurrences,
      reopened: p.reopened,
      relevant: Boolean(touches(signatureArea(p.signature)) || p.slices.some((s) => slices.includes(s))),
    }))
    .sort((a, b) => Number(b.relevant) - Number(a.relevant) || b.occurrences - a.occurrences);
  return {
    open: open.length,
    relevant: open.filter((p) => p.relevant).length,
    in_flight: patterns.filter((p) => ['proposed', 'accepted', 'applied'].includes(p.status)).length,
    patterns: open.slice(0, limit),
  };
}

/** When a proposal was applied: `applied_at`, else the date of `applied_commit`. */
export function appliedTime(root, proposal) {
  const at = Date.parse(proposal.applied_at);
  if (Number.isFinite(at)) return at;
  if (!proposal.applied_commit) return NaN;
  return Date.parse(git(root, ['show', '-s', '--format=%cI', proposal.applied_commit]) ?? '');
}

/**
 * Effect of a proposal. An applied change is `ineffective` once its signature recurs
 * after it was applied (QG-LEARN-05) and `verified` after VERIFY_WINDOW_SESSIONS quiet
 * sessions (QG-LEARN-06). For a pattern with an area, only sessions whose scope_paths
 * touch that area count; otherwise every session does.
 */
export function proposalEffect(proposal, signals, sessions, { applied = Date.parse(proposal.applied_at), area = null } = {}) {
  if (proposal.status !== 'applied') return { status: proposal.status, recurrences: 0 };
  if (!Number.isFinite(applied)) return { status: 'applied', recurrences: 0 };
  const after = signals.filter((s) => Number.isFinite(Date.parse(s.at)) && Date.parse(s.at) > applied);
  const recurrences = countOccurrences(after);
  if (recurrences > 0) return { status: 'ineffective', recurrences };
  const relevant = sessions.filter(
    (s) => Date.parse(s.timestamp) > applied && (!area || s.scope_paths.some((p) => p === area || String(p).startsWith(`${area}/`)))
  );
  const quiet = relevant.length;
  return { status: quiet >= VERIFY_WINDOW_SESSIONS ? 'verified' : 'applied', recurrences: 0, quiet_sessions: quiet, ...(area ? { area } : {}) };
}

const STATUS_RANK = ['verified', 'applied', 'accepted', 'proposed', 'rejected'];

export function derivePatterns(root, { signals, proposals = loadProposals(root), sessions = allSessions(root) } = {}) {
  const collected = signals ? { signals, unsigned_failures: 0 } : collectSignals(root);
  const groups = new Map();
  for (const s of collected.signals) {
    if (!groups.has(s.signature)) groups.set(s.signature, []);
    groups.get(s.signature).push(s);
  }

  const patterns = [];
  for (const [signature, group] of groups) {
    const id = patternId(signature);
    const times = group.map((s) => s.at).filter(Boolean).sort();
    const linked = proposals
      .filter((p) => p.pattern === id && PROPOSAL_STATUSES.includes(p.status))
      .map((p) => ({ id: p.id, file: p.file, declared: p.status, ...proposalEffect(p, group, sessions, { applied: appliedTime(root, p), area: signatureArea(signature) }) }));
    const occurrences = countOccurrences(group);
    const live = linked.filter((p) => p.status !== 'ineffective').sort((a, b) => STATUS_RANK.indexOf(a.status) - STATUS_RANK.indexOf(b.status));
    let status;
    if (live.length) status = live[0].status;
    else if (linked.length) status = 'open'; // every applied change failed: reopened
    else status = occurrences >= thresholdFor(group) ? 'open' : 'watching';
    patterns.push({
      id,
      signature,
      kind: group.every((s) => NOISE_SOURCES.has(s.source)) ? 'noise' : 'escape',
      occurrences,
      threshold: thresholdFor(group),
      status,
      reopened: status === 'open' && linked.length > 0,
      first_seen: times[0] ?? null,
      last_seen: times.at(-1) ?? null,
      sources: [...new Set(group.map((s) => s.source))].sort(),
      slices: [...new Set(group.map((s) => s.slice_id).filter(Boolean))].sort(),
      examples: [...new Set(group.map((s) => s.detail))].slice(0, 3),
      proposals: linked,
    });
  }
  patterns.sort((a, b) => b.occurrences - a.occurrences || a.signature.localeCompare(b.signature));
  return { patterns, unsigned_failures: collected.unsigned_failures };
}

export function writePatterns(root, now = new Date().toISOString()) {
  const { patterns, unsigned_failures } = derivePatterns(root);
  const data = {
    schema_version: '1.0',
    generated_at: now,
    threshold: OCCURRENCE_THRESHOLD,
    summary: {
      patterns: patterns.length,
      open: patterns.filter((p) => p.status === 'open').length,
      in_flight: patterns.filter((p) => ['proposed', 'accepted', 'applied'].includes(p.status)).length,
      verified: patterns.filter((p) => p.status === 'verified').length,
      unsigned_failures,
    },
    patterns,
  };
  const p = join(root, PATTERNS_FILE);
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, `${JSON.stringify(data, null, 2)}\n`);
  return data;
}

export function readPatterns(root) {
  return readJson(join(root, PATTERNS_FILE));
}

/** Next free SP-NNN in the proposals directory. */
export function nextProposalId(root) {
  const used = loadProposals(root)
    .map((p) => Number(String(p.id || p.file.split('/').pop()).match(/SP-(\d+)/)?.[1]))
    .filter(Number.isFinite);
  return `SP-${String(Math.max(0, ...used) + 1).padStart(3, '0')}`;
}

/** Signatures already used in the failure log, with counts, so agents reuse them verbatim (QG-DEB-05). */
export function failureSignatures(root) {
  const counts = new Map();
  for (const s of failureSignals(root).signals) {
    const sig = s.signature.replace(/^failure:/, '');
    counts.set(sig, (counts.get(sig) ?? 0) + 1);
  }
  return [...counts].map(([signature, entries]) => ({ signature, entries })).sort((a, b) => b.entries - a.entries || a.signature.localeCompare(b.signature));
}

export const KIT_REPO = 'eencinasq/asdd-harness-kit';

/** Files the kit owns here: managed files of an installed project, else every artifact (the kit repo). */
function kitOwned(root) {
  const installed = readJson(join(root, '.harness/config/installed-versions.json'));
  if (Array.isArray(installed?.managed_files)) return { files: new Set(installed.managed_files), version: installed.kit_version ?? installed.version ?? null };
  const versions = readJson(join(root, '.harness/config/versions.json'));
  return { files: new Set(Object.keys(versions?.artifacts ?? {})), version: versions?.kit_version ?? null };
}

/**
 * Lessons worth sending upstream: verified or ineffective proposals whose control is
 * a kit-owned file. Only generic fields leave the project — no examples, slice names,
 * proposal bodies, or command text.
 */
export function exportLessons(root) {
  const { files, version } = kitOwned(root);
  const proposals = new Map(loadProposals(root).map((p) => [p.id, p]));
  const lessons = [];
  for (const pattern of derivePatterns(root, { proposals: [...proposals.values()] }).patterns) {
    for (const effect of pattern.proposals) {
      if (!['verified', 'ineffective'].includes(effect.status)) continue;
      const p = proposals.get(effect.id);
      const control = String(p?.control ?? '').split('#')[0].trim();
      if (!files.has(control)) continue;
      lessons.push({
        signature: pattern.signature,
        kind: pattern.kind,
        occurrences: pattern.occurrences,
        control,
        change: p.change,
        success: p.success,
        result: effect.status,
        ...(effect.status === 'ineffective' ? { recurrences: effect.recurrences } : { quiet_sessions: effect.quiet_sessions }),
      });
    }
  }
  const lines = [
    `## Harness lessons (kit ${version ?? 'unknown'})`,
    '',
    'Generated by `asdd learn --export`. Only generic fields are included.',
    '',
  ];
  if (!lessons.length) lines.push('_No verified or ineffective proposals on kit-owned controls yet._');
  for (const l of lessons) {
    lines.push(`### ${l.result === 'verified' ? 'Worked' : 'Did not work'}: ${l.change} on \`${l.control}\``, '');
    lines.push(`- Pattern: \`${l.signature}\` (${l.kind}, ×${l.occurrences})`);
    lines.push(`- Success criterion: ${l.success}`);
    lines.push(l.result === 'verified' ? `- Quiet sessions after the change: ${l.quiet_sessions}` : `- Recurrences after the change: ${l.recurrences}`);
    lines.push('');
  }
  return { lessons, markdown: `${lines.join('\n').trimEnd()}\n` };
}
