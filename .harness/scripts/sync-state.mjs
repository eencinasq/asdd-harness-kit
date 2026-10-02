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

function derivePhase(sessions) {
  const phaseEvents = sessions.filter((s) =>
    s.event_type === 'phase_started' || s.event_type === 'phase_completed'
  );
  if (phaseEvents.length === 0) return 'discovery';
  const latest = phaseEvents[phaseEvents.length - 1];
  if (latest.event_type === 'phase_completed') {
    const phases = ['discovery', 'spec', 'validation', 'domain', 'design', 'task_planning', 'implementation', 'qa', 'knowledge'];
    const idx = phases.indexOf(latest.phase);
    return idx >= 0 && idx + 1 < phases.length ? phases[idx + 1] : latest.phase;
  }
  return latest.phase;
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

function deriveGates(sessions) {
  const gates = {};
  for (const s of sessions) {
    if (s.event_type === 'phase_completed') {
      gates[s.phase] = {
        status: 'PASS',
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

function deriveOpenDissents(sessions) {
  const dissents = sessions.filter((s) => s.event_type === 'dissent');
  const overrides = sessions.filter((s) => s.event_type === 'override');
  const overridden = new Set(overrides.map((o) => o.dissent_session_id).filter(Boolean));
  return dissents.filter((d) => !overridden.has(d.session_id)).length;
}

function generateSliceManifest(sliceId, sessions) {
  const sliceDir = join(slicesDir, sliceId);
  const existing = readJson(join(sliceDir, 'manifest.json')) || {};

  return {
    schema_version: '3.0',
    slice_id: sliceId,
    phase: derivePhase(sessions),
    status: deriveStatus(sessions),
    mode: existing.mode || 'full',
    created_at: existing.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    paths: existing.paths || {},
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

function main() {
  const args = process.argv.slice(2);
  const sliceArg = args.indexOf('--slice');
  const targetSlice = sliceArg >= 0 ? args[sliceArg + 1] : null;

  if (!existsSync(slicesDir)) {
    console.warn('WARN  no slices directory found');
    return;
  }

  const sliceManifests = [];

  if (targetSlice) {
    const manifest = syncSlice(targetSlice);
    if (manifest) sliceManifests.push(manifest);
  } else {
    for (const entry of readdirSync(slicesDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const manifest = syncSlice(entry.name);
      if (manifest) sliceManifests.push(manifest);
    }
  }

  if (sliceManifests.length > 0) {
    const registry = generateRegistry(sliceManifests);
    writeJson(join(stateDir, 'registry.json'), registry);
    console.log(`SYNC  registry → ${registry.slices.length} slices`);
  }
}

main();
