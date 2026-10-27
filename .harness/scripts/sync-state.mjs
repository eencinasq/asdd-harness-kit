#!/usr/bin/env node
/**
 * sync-state.mjs — generate manifest.json and registry.json from append-only session logs.
 *
 * v3.0 state model:
 *   - Sessions are append-only JSON files in .harness/state/slices/<id>/sessions/
 *   - manifest.json is GENERATED per-slice (never hand-edited)
 *   - registry.json is GENERATED globally (never hand-edited)
 *   - No lock files, no CCS, no PROGRESS.md, no progress/<id>.md
 *
 * Usage:
 *   node .harness/scripts/sync-state.mjs
 *   node .harness/scripts/sync-state.mjs --slice <slice-id>
 */
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

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

// Ordered pipeline. 'refactor' is optional and handled in derivePhase.
export const PHASES = ['discovery', 'spec', 'validation', 'domain', 'design', 'task_planning', 'implementation', 'qa', 'knowledge'];

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

export const SLICE_MODES = ['lite', 'full', 'escalated'];

// Lite-first: slices are lite by default. The latest session declaring a mode
// (init-slice --full, or an escalation checkpoint) wins. An already-generated
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

function deriveStatus(sessions) {
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
        epic_id: s.source.epic_id || null,
        assigned_by: s.source.assigned_by || null,
        timebox_weeks: s.source.timebox_weeks || null,
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
  const escalationRequired = mode === 'lite' && escalationSignals.length > 0;
  const escalatedFromLite = mode === 'escalated' && sessions.some((s) => s.mode === 'lite');
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
      active_features: m.active_features.length,
      escalation_signals: m.escalation_signals.length,
      escalation_required: m.escalation_required,
      escalated_from_lite: m.escalated_from_lite,
      open_dissents: m.open_dissents,
      last_activity: m.updated_at,
      contributors: m.contributors,
    })),
  };
}

function syncSlice(sliceId) {
  const sliceDir = join(slicesDir, sliceId);
  if (!existsSync(sliceDir)) {
    console.error(`FAIL  slice directory not found: ${sliceDir}`);
    return null;
  }
  const sessions = readSessions(sliceDir);
  const manifest = generateSliceManifest(sliceId, sessions);
  writeJson(join(sliceDir, 'manifest.json'), manifest);
  console.log(`SYNC  ${sliceId} → phase:${manifest.phase} status:${manifest.status} features:${manifest.active_features.length}`);
  return manifest;
}

// Knowledge index is a derived projection — regenerate it after every state
// sync, but never let its failure break the state sync itself.
async function syncKnowledgeIndex() {
  try {
    const { writeKnowledgeIndex } = await import('./sync-knowledge.mjs');
    const meta = await writeKnowledgeIndex(root);
    console.log(`SYNC  knowledge → ${meta.nodes} nodes / ${meta.chunks} chunks`);
  } catch (error) {
    console.warn(`WARN  knowledge index not regenerated: ${error?.message ?? error}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const sliceArg = args.indexOf('--slice');
  const targetSlice = sliceArg >= 0 ? args[sliceArg + 1] : null;

  if (!existsSync(slicesDir)) {
    console.warn('WARN  no slices directory found');
    await syncKnowledgeIndex();
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
        console.log(`SYNC  registry → ${registry.slices.length} slices`);
      }
    }
    await syncKnowledgeIndex();
    return;
  }

  for (const entry of readdirSync(slicesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const manifest = syncSlice(entry.name);
    if (manifest) sliceManifests.push(manifest);
  }

  if (sliceManifests.length > 0) {
    const registry = generateRegistry(sliceManifests);
    writeJson(join(stateDir, 'registry.json'), registry);
    console.log(`SYNC  registry → ${registry.slices.length} slices`);
  }
  await syncKnowledgeIndex();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
