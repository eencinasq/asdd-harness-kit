#!/usr/bin/env node
/**
 * sync-state.mjs — generate manifest.json and registry.json from append-only session logs.
 *
 * v3.0 state model:
 *   - Sessions are append-only JSON files in .harness/state/slices/<id>/sessions/
 *   - manifest.json is GENERATED per-slice (never hand-edited)
 *   - registry.json is GENERATED globally (never hand-edited)
 *   - PROGRESS.md is GENERATED from the registry (never hand-edited)
 *   - A checkpoint session with `status` parks, abandons, or resumes a slice
 *
 * Usage:
 *   asdd sync
 *   asdd sync --slice <slice-id>
 *
 * Telemetry (REQ-010, design §5.5): the CLI run records the learning and knowledge-index steps, then, in a `finally`
 * after every output is written, appends one root `sync` span and one child span per step through a guarded import of
 * telemetry-lib.mjs (ADR-001). A telemetry failure never changes stdout, stderr, the exit code, or a generated file.
 * Only the CLI block emits: the exported functions (used by the MCP servers) never do.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const slicesDir = join(root, '.harness/state/slices');
const stateDir = join(root, '.harness/state');

function readJson(p) {
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

function writeJson(p, data) {
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, `${JSON.stringify(data, null, 2)}\n`);
}

function parseSessionFile(content) {
  try {
    const data = JSON.parse(content);
    if (!data.timestamp) return null;
    return data;
  } catch { return null; }
}

function readSessions(sliceDir) {
  const sessionsDir = join(sliceDir, 'sessions');
  if (!existsSync(sessionsDir)) return [];
  const files = readdirSync(sessionsDir)
    .filter((n) => n.endsWith('.json'))
    .sort();
  const sessions = [];
  for (const f of files) {
    const data = readJson(join(sessionsDir, f));
    if (data) sessions.push(data);
  }
  // Sort by filename (sequence order), not timestamp, to handle backdated entries
  // and ensure deterministic ordering regardless of clock skew.
  return sessions;
}

export { readSessions };

/**
 * Phase + mode vocabulary comes from the platform registry (D-3), not constants. Lookup order: the project's
 * installed copy (pin fidelity — the kit version the project runs), then the registry bundled with this CLI copy
 * (kit repo, npm package; vendored tools/<name>/src/harness copies resolve tools/<name>/registry, which is absent).
 * Absent vocabulary falls back to the built-in pipeline literals so `asdd sync` never writes degraded phase/mode state.
 */
function platformVocabulary() {
  for (const p of [
    join(root, '.harness/config/contribution-points.json'),
    join(import.meta.dirname, '../../registry/contribution-points.json'),
  ]) {
    const r = readJson(p);
    if (r?.vocabulary) return r.vocabulary;
  }
  return null;
}
const VOCAB = platformVocabulary();
// The missing-registry warning lives on the CLI path (main), not at import: library importers (learning-lib via
// recordDenial, telemetry attribute()) must never write to stderr.
function warnRegistryMissing() {
  if (!VOCAB && existsSync(join(root, '.harness'))) {
    console.error('asdd: .harness/config/contribution-points.json missing — run `asdd install` to install the platform registry');
  }
}

// Ordered pipeline (registry vocabulary.phases, by `order`). 'refactor' is optional and handled in derivePhase.
const FALLBACK_PHASES = ['discovery', 'spec', 'validation', 'domain', 'design', 'task_planning', 'implementation', 'qa', 'knowledge'];
export const PHASES = (VOCAB?.phases?.length ? [...VOCAB.phases].sort((a, b) => a.order - b.order).map((p) => p.id) : FALLBACK_PHASES);

export function derivePhase(sessions) {
  const phaseEvents = sessions.filter((s) =>
    s.event_type === 'phase_started' || s.event_type === 'phase_completed'
  );
  if (phaseEvents.length === 0) return 'discovery';
  const latest = phaseEvents[phaseEvents.length - 1];
  if (latest.event_type === 'phase_completed') {
    // Refactor is optional (post-QA or Self-Healing PR); it hands off to knowledge.
    if (latest.phase === 'refactor') return 'knowledge';
    const idx = PHASES.indexOf(latest.phase);
    return idx >= 0 && idx + 1 < PHASES.length ? PHASES[idx + 1] : latest.phase;
  }
  return latest.phase;
}

export const SLICE_MODES = VOCAB?.modes?.length ? VOCAB.modes : ['lite', 'hotfix', 'full', 'escalated'];

/** Serial modes: at most one in_progress feature; escalation signals block DONE. */
export function isSerialMode(mode) {
  return mode === 'lite' || mode === 'hotfix';
}

// Lite-first: slices are lite by default. The latest session declaring a mode
// (init-slice --full / --hotfix, or an escalation checkpoint) wins. An already-generated
// manifest mode is honored for back-compat with pre-lite-first state.
export function deriveMode(sessions, existingMode) {
  let mode = SLICE_MODES.includes(existingMode) ? existingMode : 'lite';
  for (const s of sessions) {
    if (typeof s.mode === 'string' && SLICE_MODES.includes(s.mode)) mode = s.mode;
  }
  return mode;
}

// Evidence-based escalation signals (deterministic, sessions-only).
// E2 (concurrent lite features) is a hard rule enforced by features.mjs; the
// remaining signals mark a lite slice as escalation_required.
export function deriveEscalationSignals(sessions) {
  const signals = [];

  const modules = new Set();
  for (const s of sessions) {
    if (s.event_type !== 'feature_started' || !Array.isArray(s.scope_paths)) continue;
    for (const p of s.scope_paths) {
      const first = String(p).replace(/^\/+|\/+$/g, '').split('/')[0];
      if (first) modules.add(first);
    }
  }
  if (modules.size > 1) {
    signals.push({
      type: 'E1-scope-spread',
      evidence: `scope touches ${modules.size} top-level modules: ${Array.from(modules).sort().join(', ')}`,
    });
  }

  const domainTerms = [];
  for (const s of sessions) {
    if (s.event_type === 'checkpoint' && Array.isArray(s.new_domain_terms)) {
      domainTerms.push(...s.new_domain_terms.filter((t) => typeof t === 'string' && t.trim()));
    }
  }
  if (domainTerms.length > 1) {
    signals.push({
      type: 'E3-domain-growth',
      evidence: `${domainTerms.length} new domain terms declared: ${domainTerms.join(', ')}`,
    });
  }

  for (const s of sessions) {
    if (s.event_type === 'dissent') {
      signals.push({
        type: 'E4-dissent',
        evidence: `architectural dissent (${s.session_id || s.timestamp || 'session'})`,
      });
      break;
    }
  }

  for (const s of sessions) {
    if (s.event_type === 'phase_blocked' && s.phase === 'implementation') {
      signals.push({
        type: 'E5-implementation-blocked',
        evidence: `implementation blocked (${s.session_id || s.timestamp || 'session'})`,
      });
      break;
    }
  }

  return signals;
}

export const MANUAL_STATUSES = ['PARKED', 'ABANDONED'];

// The latest checkpoint carrying `status` wins: PARKED/ABANDONED hold until a later
// checkpoint sets `in_progress` (resume / amend), which returns the slice to active work
// even after knowledge was completed (DONE). That `in_progress` holds only until a later
// knowledge completion: then the slice is DONE again unless a feature is still active.
export function deriveStatus(sessions) {
  const statusIdx = sessions.findLastIndex((s) => s.event_type === 'checkpoint' && typeof s.status === 'string');
  const manual = statusIdx >= 0 ? sessions[statusIdx].status : undefined;
  if (MANUAL_STATUSES.includes(manual)) return manual;
  if (manual === 'in_progress') {
    const closedAgain = sessions.slice(statusIdx + 1).some((s) => s.event_type === 'phase_completed' && s.phase === 'knowledge');
    if (!closedAgain) return 'in_progress';
  }
  const activeFeatures = deriveActiveFeatures(sessions);
  if (activeFeatures.length > 0) return 'in_progress';
  const allPhases = sessions.filter((s) => s.event_type === 'phase_completed');
  if (allPhases.some((s) => s.phase === 'knowledge')) return 'DONE';
  return 'in_progress';
}

function deriveActiveFeatures(sessions) {
  const features = new Map();
  for (const s of sessions) {
    if (s.event_type === 'feature_started') {
      features.set(s.feature_id, {
        id: s.feature_id,
        owner: s.agent || s.human,
        human: s.human,
        since: s.timestamp,
        handoff_from: s.handoff_from || null,
        scope_paths: s.scope_paths || [],
      });
    }
    if (s.event_type === 'feature_completed' || s.event_type === 'feature_blocked') {
      features.delete(s.feature_id);
    }
  }
  return Array.from(features.values());
}

export function deriveGates(sessions) {
  const gates = {};
  for (const s of sessions) {
    if (s.event_type === 'phase_completed') {
      // QG-GATE-02: completing with concerns is WARN; it needs a TL override (QG-GATE-04).
      const hasConcerns = Array.isArray(s.concerns) && s.concerns.length > 0;
      gates[s.phase] = {
        status: hasConcerns ? 'WARN' : 'PASS',
        by: s.human || s.agent,
        at: s.timestamp,
        evidence: s.evidence || null,
        concerns: s.concerns || [],
      };
    }
    if (s.event_type === 'phase_blocked') {
      gates[s.phase] = {
        status: 'BLOCK',
        by: s.human || s.agent,
        at: s.timestamp,
        evidence: s.evidence || null,
        concerns: s.concerns || [],
      };
    }
    if (s.event_type === 'override' && s.phase && s.human && gates[s.phase]) {
      gates[s.phase].acknowledged_by = s.human;
    }
    if (s.event_type === 'dissent' && s.phase) {
      const existing = gates[s.phase] || { status: 'WARN' };
      existing.status = 'WARN';
      existing.concerns = [...(existing.concerns || []), s.note];
      gates[s.phase] = existing;
    }
  }
  return gates;
}

function deriveSessionLog(sessions) {
  return sessions.map((s) => ({
    timestamp: s.timestamp,
    agent: s.agent,
    human: s.human,
    event: s.event_type,
    phase: s.phase || null,
    feature_id: s.feature_id || null,
  }));
}

function deriveContributors(sessions) {
  const set = new Set();
  for (const s of sessions) {
    if (s.human) set.add(s.human);
    if (s.agent) set.add(s.agent);
  }
  return Array.from(set);
}

function deriveSource(sessions) {
  // Find the first session with source metadata (typically the initial/phase_started event)
  for (const s of sessions) {
    if (s.source && typeof s.source === 'object') {
      return {
        tracker_type: s.source.tracker_type || null,
        tracker_url: s.source.tracker_url || null,
        pitch_id: s.source.pitch_id || null,
        scope_id: s.source.scope_id || null,
        cycle: s.source.cycle || null,
        assigned_by: s.source.assigned_by || null,
        // timebox_weeks: older session files
        appetite_weeks: s.source.appetite_weeks || s.source.timebox_weeks || null,
      };
    }
  }
  return null;
}

// Conventional slice paths (when present on disk), then the existing manifest,
// then sessions carrying `features_path` (Task Planning). Latest wins.
export function derivePaths(sessions, existingPaths, sliceId) {
  const paths = {};
  if (sliceId) {
    const conventional = {
      specs: `.harness/specs/${sliceId}`,
      tasks: `.harness/specs/${sliceId}/tasks.md`,
      features: `.harness/features/${sliceId}.features.json`,
    };
    for (const [key, rel] of Object.entries(conventional)) {
      if (existsSync(join(root, rel))) paths[key] = rel;
    }
  }
  Object.assign(paths, existingPaths || {});
  for (const s of sessions) {
    if (typeof s.features_path === 'string' && s.features_path) paths.features = s.features_path;
  }
  return paths;
}

function deriveOpenDissents(sessions) {
  const dissents = sessions.filter((s) => s.event_type === 'dissent');
  const overrides = sessions.filter((s) => s.event_type === 'override');
  const overridden = new Set(overrides.map((o) => o.dissent_session_id).filter(Boolean));
  return dissents.filter((d) => !overridden.has(d.session_id)).length;
}

function generateSliceManifest(sliceId, sessions) {
  const sliceDir = join(slicesDir, sliceId);
  const existing = readJson(join(sliceDir, 'manifest.json')) || {};
  const mode = deriveMode(sessions, existing.mode);
  const escalationSignals = deriveEscalationSignals(sessions);
  const escalationRequired = isSerialMode(mode) && escalationSignals.length > 0;
  const escalatedFromLite =
    mode === 'escalated' && sessions.some((s) => s.mode === 'lite' || s.mode === 'hotfix');
  let status = deriveStatus(sessions);
  if (status === 'DONE' && escalationRequired) {
    // Lite-first closure gate: a lite slice cannot complete with unaddressed
    // escalation signals. Escalate (checkpoint mode=escalated) first.
    status = 'in_progress';
  }

  return {
    schema_version: '3.0',
    slice_id: sliceId,
    phase: derivePhase(sessions),
    status,
    mode,
    escalation_signals: escalationSignals,
    escalation_required: escalationRequired,
    escalated_from_lite: escalatedFromLite,
    created_at: existing.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    paths: derivePaths(sessions, existing.paths, sliceId),
    gates: deriveGates(sessions),
    active_features: deriveActiveFeatures(sessions),
    open_dissents: deriveOpenDissents(sessions),
    source: deriveSource(sessions),
    session_log: deriveSessionLog(sessions),
    contributors: deriveContributors(sessions),
  };
}

function generateRegistry(sliceManifests) {
  return {
    schema_version: '3.0',
    generated_at: new Date().toISOString(),
    slices: sliceManifests.map((m) => ({
      slice_id: m.slice_id,
      phase: m.phase,
      status: m.status,
      mode: m.mode,
      // Legacy/foreign manifests may lack the v3 derived arrays — never crash the whole sync on one.
      active_features: (m.active_features ?? []).length,
      escalation_signals: (m.escalation_signals ?? []).length,
      escalation_required: m.escalation_required,
      escalated_from_lite: m.escalated_from_lite,
      open_dissents: m.open_dissents,
      last_activity: m.updated_at,
      contributors: m.contributors,
    })),
  };
}

/** PROGRESS.md is a generated view of the registry (one owner; never hand-edited). */
function writeProgress(registry) {
  const rows = registry.slices.map((s) => `| ${s.slice_id} | ${s.mode || '—'} | ${s.phase || '—'} | ${s.status || '—'} | ${s.active_features ?? 0} |`);
  const text = [
    '# Progress',
    '',
    '> Generated by `asdd sync` from `.harness/state/registry.json`. Do not edit by hand.',
    '',
    '| Slice | Mode | Phase | Status | Active features |',
    '|-------|------|-------|--------|-----------------|',
    ...(rows.length ? rows : ['| — | — | — | — | — |']),
    '',
  ].join('\n');
  writeFileSync(join(root, '.harness/PROGRESS.md'), text);
}

/**
 * AR-3 collision resolution (K-6): when two session files share a sequence
 * number, the earliest timestamp keeps the number; later ones are renamed to
 * the next free sequences. Deterministic and content-preserving — the rename
 * is recorded in the sync output so the coordinator sees it.
 */
function resolveSessionCollisions(sliceId, sliceDir) {
  const sessionsDir = join(sliceDir, 'sessions');
  if (!existsSync(sessionsDir)) return;
  const SESSION_RE = /^(\d+)-(.+\.json)$/;
  const files = readdirSync(sessionsDir).filter((n) => SESSION_RE.test(n));
  const bySeq = new Map();
  for (const f of files) {
    const seq = Number(SESSION_RE.exec(f)[1]);
    const list = bySeq.get(seq) ?? [];
    list.push(f);
    bySeq.set(seq, list);
  }
  const timestampOf = (f) => {
    try {
      const data = JSON.parse(readFileSync(join(sessionsDir, f), 'utf8'));
      return Date.parse(data.timestamp) || 0;
    } catch {
      return 0;
    }
  };
  const used = new Set(bySeq.keys());
  let next = Math.max(0, ...used) + 1;
  for (const [, group] of bySeq) {
    if (group.length < 2) continue;
    group.sort((a, b) => timestampOf(a) - timestampOf(b) || a.localeCompare(b));
    for (const loser of group.slice(1)) {
      while (used.has(next)) next += 1;
      const target = `${String(next).padStart(3, '0')}-${SESSION_RE.exec(loser)[2]}`;
      renameSync(join(sessionsDir, loser), join(sessionsDir, target));
      console.log(`SYNC  ${sliceId} renamed ${loser} → ${target} (AR-3 collision)`);
      used.add(next);
      next += 1;
    }
  }
}

function syncSlice(sliceId) {
  const sliceDir = join(slicesDir, sliceId);
  if (!existsSync(sliceDir)) {
    console.error(`FAIL  slice directory not found: ${sliceDir}`);
    return null;
  }
  resolveSessionCollisions(sliceId, sliceDir);
  const sessions = readSessions(sliceDir);
  const manifest = generateSliceManifest(sliceId, sessions);
  writeJson(join(sliceDir, 'manifest.json'), manifest);
  console.log(`SYNC  ${sliceId} → phase:${manifest.phase} status:${manifest.status} features:${manifest.active_features.length}`);
  return manifest;
}

// Knowledge index is a derived projection — regenerate it after every state
// sync, but never let its failure break the state sync itself. Returns the ok flag.
async function syncKnowledgeIndex() {
  try {
    const { writeKnowledgeIndex } = await import('./sync-knowledge.mjs');
    const meta = await writeKnowledgeIndex(root);
    console.log(`SYNC  knowledge → ${meta.nodes} nodes / ${meta.chunks} chunks`);
    return true;
  } catch (error) {
    console.warn(`WARN  knowledge index not regenerated: ${error?.message ?? error}`);
    return false;
  }
}

// Learning patterns are a derived projection too (QG-LEARN-*); a failure never breaks the sync.
// Run as a child: learning-lib imports this module, and importing it from inside
// this module's top-level await would deadlock.
// Returns null when learn.mjs is absent, else { ok, exitCode } (ok: exit 0 and parseable output).
function syncLearning() {
  const script = fileURLToPath(new URL('./learn.mjs', import.meta.url));
  if (!existsSync(script)) return null;
  const result = spawnSync(process.execPath, [script, '--summary'], { cwd: root, encoding: 'utf8', timeout: 60000 });
  let parsed = false;
  try {
    const summary = JSON.parse(result.stdout);
    console.log(`SYNC  learning → ${summary.patterns} patterns (${summary.open} open)`);
    parsed = true;
  } catch {
    console.warn(`WARN  learning patterns not regenerated: ${(result.stderr || result.error?.message || `exit ${result.status}`).trim()}`);
  }
  return { ok: parsed && result.status === 0, exitCode: result.status };
}

/**
 * The derived projections (learning, then the knowledge index), unchanged in order and output. When `run` is given,
 * each step that ran is recorded as { name, start, end, ok, attributes } for the run's child spans.
 */
async function syncDerived(run) {
  let start = Date.now();
  const learning = syncLearning();
  if (learning && run) {
    const attributes = typeof learning.exitCode === 'number' ? { exit_code: learning.exitCode } : {};
    run.steps.push({ name: 'learning', start, end: Date.now(), ok: learning.ok, attributes });
  }
  start = Date.now();
  const knowledge = await syncKnowledgeIndex();
  if (run) run.steps.push({ name: 'knowledge-index', start, end: Date.now(), ok: knowledge, attributes: {} });
}

/**
 * Appends the run's span tree (REQ-010, REQ-005): one child per recorded step via childOf(root), then the root
 * `sync` span (ERROR when main() threw). Best-effort after every output (ADR-001): a missing or broken lib, a throw,
 * or emit() returning false is a no-op; nothing is printed and process.exitCode is untouched.
 */
async function emitSyncSpans(run, failed) {
  const tel = await import('./telemetry-lib.mjs').catch(() => null);
  try {
    if (!tel) return;
    const end = Date.now();
    const runtime = process.env.HARNESS_RUNTIME || 'cli';
    const { slice_id, phase } = tel.attribute(root);
    const rootCtx = tel.startTrace();
    const common = { kind: 'sync', runtime, slice_id, phase, writer: 'sync-state' };
    for (const step of run.steps) {
      const span = tel.buildSpan(tel.childOf(rootCtx), {
        ...common,
        process_name: `sync-state/${step.name}`,
        start: step.start,
        end: step.end,
        status: step.ok ? 'OK' : 'ERROR',
        attributes: step.attributes,
      });
      tel.emit(span, { root });
    }
    const rootSpan = tel.buildSpan(rootCtx, { ...common, process_name: 'sync-state', start: run.start, end, status: failed ? 'ERROR' : 'OK' });
    tel.emit(rootSpan, { root });
  } catch {
    // ignore
  }
}

/**
 * Evidence of a passing feature, recorded by the harness (no commit needed): when a feature is passing and has no
 * evidence_hash, it gets the hash of the files its scope_paths cover; a feature that is not passing loses it (it is
 * re-stamped when it passes again). DRIFT-02 recomputes the hash and reopens the feature when the files changed.
 * evidence_commit (the pre-hash contract) is dropped. Returns the number of features changed.
 */
export async function stampEvidence(rootDir = root, { only = null } = {}) {
  const dir = join(rootDir, '.harness/features');
  if (!existsSync(dir)) return 0;
  // scope-lib, not drift-lib: drift-lib → validators/features → sync-state would be an import cycle.
  const { evidenceHash, EVIDENCE_HASH_RE } = await import('./scope-lib.mjs');
  const { normalizeScopePath } = await import('./validators/paths.mjs');
  let changedCount = 0;
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.features.json')).sort()) {
    if (only && name !== `${only}.features.json`) continue;
    const file = join(dir, name);
    let data;
    try {
      data = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      continue;
    }
    let changed = false;
    for (const f of Array.isArray(data.features) ? data.features : []) {
      const before = JSON.stringify(f);
      if ('evidence_commit' in f) {
        delete f.evidence_commit;
        changed = true;
      }
      const scopes = (Array.isArray(f.scope_paths) ? f.scope_paths : []).map(normalizeScopePath).filter(Boolean);
      if (f.status === 'passing' && !EVIDENCE_HASH_RE.test(String(f.evidence_hash ?? '')) && scopes.length) {
        f.evidence_hash = evidenceHash(rootDir, scopes);
        console.log(`STAMP ${name.replace('.features.json', '')} ${f.id} evidence_hash ${f.evidence_hash.slice(0, 12)}`);
        changed = true;
      } else if (f.status !== 'passing' && 'evidence_hash' in f) {
        delete f.evidence_hash;
        changed = true;
      }
      if (JSON.stringify(f) !== before) changedCount += 1;
    }
    if (changed) writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  }
  return changedCount;
}

async function main(run = null) {
  const args = process.argv.slice(2);
  const sliceArg = args.indexOf('--slice');
  const targetSlice = sliceArg >= 0 ? args[sliceArg + 1] : null;
  warnRegistryMissing();
  await stampEvidence(root, { only: targetSlice });

  if (!existsSync(slicesDir)) {
    console.warn('WARN  no slices directory found');
    await syncDerived(run);
    return;
  }

  const sliceManifests = [];

  if (targetSlice) {
    const manifest = syncSlice(targetSlice);
    if (manifest) {
      // Partial sync: merge the target into the existing registry instead of
      // overwriting it with a single-slice view.
      const existing = readJson(join(stateDir, 'registry.json'));
      const ids = new Set(
        (Array.isArray(existing?.slices) ? existing.slices : [])
          .map((s) => s?.slice_id)
          .filter(Boolean)
      );
      ids.add(targetSlice);
      const sliceManifests = [];
      for (const id of Array.from(ids).sort()) {
        const m = id === targetSlice ? manifest : readJson(join(slicesDir, id, 'manifest.json'));
        if (m) sliceManifests.push(m);
      }
      if (sliceManifests.length > 0) {
        const registry = generateRegistry(sliceManifests);
        writeJson(join(stateDir, 'registry.json'), registry);
        writeProgress(registry);
        console.log(`SYNC  registry → ${registry.slices.length} slices`);
      }
    }
    await syncDerived(run);
    return;
  }

  for (const entry of readdirSync(slicesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const manifest = syncSlice(entry.name);
    if (manifest) sliceManifests.push(manifest);
  }

  // Always rewrite: with zero slices left (all archived), a stale registry would keep listing them.
  const registry = generateRegistry(sliceManifests);
  writeJson(join(stateDir, 'registry.json'), registry);
  writeProgress(registry);
  console.log(`SYNC  registry → ${registry.slices.length} slices`);
  await syncDerived(run);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const run = { start: Date.now(), steps: [] };
  let failed = false;
  try {
    await main(run);
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    await emitSyncSpans(run, failed);
  }
}
