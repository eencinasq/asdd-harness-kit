#!/usr/bin/env node
/**
 * migrate-v2-v3.mjs — migrate from editable manifest model (v2.0) to append-only sessions (v3.0).
 *
 * Usage:
 *   node scripts/migrate-v2-v3.mjs --dry-run
 *   node scripts/migrate-v2-v3.mjs --write
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const dryRun = process.argv.includes('--dry-run');
const writeMode = process.argv.includes('--write');

if (!dryRun && !writeMode) {
  console.error('Usage: node scripts/migrate-v2-v3.mjs --dry-run | --write');
  process.exit(1);
}

function readJson(p) {
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

function log(action, path) {
  const prefix = dryRun ? 'DRY-RUN' : action;
  console.log(`${prefix}  ${path.replace(root + '/', '')}`);
}

function writeJson(p, data) {
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, `${JSON.stringify(data, null, 2)}\n`);
}

function migrateSlice(sliceId, sliceEntry) {
  const sliceDir = join(root, '.harness/state/slices', sliceId);
  const sessionsDir = join(sliceDir, 'sessions');
  const manifestPath = join(sliceDir, 'manifest.json');

  if (!existsSync(manifestPath)) {
    console.warn(`SKIP  ${sliceId}: no per-slice manifest found`);
    return;
  }

  const v2Manifest = readJson(manifestPath);
  if (!v2Manifest) {
    console.warn(`SKIP  ${sliceId}: cannot parse manifest`);
    return;
  }

  if (v2Manifest.schema_version === '3.0') {
    console.log(`SKIP  ${sliceId}: already v3.0`);
    return;
  }

  if (existsSync(sessionsDir) && readdirSync(sessionsDir).length > 0) {
    console.warn(`WARN  ${sliceId}: sessions/ already exists — partial migration?`);
  }

  log('CREATE', sessionsDir);
  if (!dryRun) mkdirSync(sessionsDir, { recursive: true });

  let seq = 1;
  const sessions = [];

  // Initial session: slice creation
  sessions.push({
    schema_version: '1.0',
    session_id: `sess-${sliceId}-${String(seq++).padStart(3, '0')}`,
    timestamp: v2Manifest.created_at || new Date().toISOString(),
    agent: 'human',
    human: 'squad',
    slice_id: sliceId,
    event_type: 'phase_started',
    phase: 'discovery',
    evidence: 'Slice initialized (v2→v3 migration)',
    concerns: [],
  });

  // Convert completed phases to session events
  const phases = ['discovery', 'spec', 'validation', 'domain', 'design', 'task_planning', 'implementation', 'qa', 'knowledge'];
  const currentPhase = v2Manifest.phase || 'discovery';
  const currentPhaseIndex = phases.indexOf(currentPhase);

  for (let i = 0; i < currentPhaseIndex && i < phases.length; i++) {
    const phase = phases[i];
    const gate = v2Manifest.gates?.[phase];
    if (gate) {
      sessions.push({
        schema_version: '1.0',
        session_id: `sess-${sliceId}-${String(seq++).padStart(3, '0')}`,
        timestamp: v2Manifest.updated_at || new Date().toISOString(),
        agent: 'asdd-' + phase.replace('_', '-'),
        human: 'squad',
        slice_id: sliceId,
        event_type: 'phase_completed',
        phase: phase,
        evidence: typeof gate === 'string' ? gate : JSON.stringify(gate),
        concerns: [],
      });
    }
  }

  // Current phase session
  const finalStatus = v2Manifest.status;
  const isTerminal = finalStatus === 'DONE' || finalStatus === 'PARKED' || finalStatus === 'ABANDONED';
  sessions.push({
    schema_version: '1.0',
    session_id: `sess-${sliceId}-${String(seq++).padStart(3, '0')}`,
    timestamp: v2Manifest.updated_at || new Date().toISOString(),
    agent: 'asdd-' + currentPhase.replace('_', '-'),
    human: 'squad',
    slice_id: sliceId,
    event_type: isTerminal ? 'phase_completed' : 'phase_started',
    phase: currentPhase,
    evidence: 'Migrated from v2.0 manifest',
    concerns: v2Manifest.confidence_chain ? [`Legacy confidence_chain: ${JSON.stringify(v2Manifest.confidence_chain)}`] : [],
  });

  // Write session files
  for (let i = 0; i < sessions.length; i++) {
    const fileName = `${String(i + 1).padStart(3, '0')}-migrate.json`;
    const filePath = join(sessionsDir, fileName);
    log('WRITE', filePath);
    if (!dryRun) writeJson(filePath, sessions[i]);
  }

  // Archive old v2 manifest
  const archivePath = join(sliceDir, 'manifest-v2-archive.json');
  log('ARCHIVE', archivePath);
  if (!dryRun) {
    writeJson(archivePath, v2Manifest);
  }

  // Run sync-state to generate v3 manifest
  if (!dryRun) {
    const result = spawnSync(process.execPath, ['.harness/scripts/sync-state.mjs', '--slice', sliceId], {
      cwd: root,
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      console.error(`FAIL  sync-state for ${sliceId}:`, result.stderr);
    } else {
      console.log(`SYNC  ${sliceId} → v3.0 manifest generated`);
    }
  }

  // Remove lock file if present
  const lockPath = join(root, '.harness/state/locks', `${sliceId}.lock`);
  if (existsSync(lockPath)) {
    log('REMOVE', lockPath);
    if (!dryRun) {
      const lockArchive = join(sliceDir, 'lock-v2-archive.json');
      renameSync(lockPath, lockArchive);
    }
  }
}

function main() {
  const globalManifest = readJson(join(root, '.harness/state/manifest.json'));
  const slices = Array.isArray(globalManifest?.active_slices) ? globalManifest.active_slices : [];

  if (slices.length === 0) {
    console.log('No active slices to migrate.');
    return;
  }

  console.log(`${dryRun ? 'DRY-RUN' : 'MIGRATE'} ${slices.length} slice(s) from v2.0 → v3.0`);
  console.log('');

  for (const slice of slices) {
    migrateSlice(slice.slice_id, slice);
    console.log('');
  }

  // Generate registry
  if (!dryRun) {
    const result = spawnSync(process.execPath, ['.harness/scripts/sync-state.mjs'], {
      cwd: root,
      encoding: 'utf8',
    });
    if (result.status === 0) {
      console.log('SYNC  registry.json generated');
    } else {
      console.error('FAIL  sync-state:', result.stderr);
    }
  }

  console.log('');
  console.log(dryRun ? 'Dry-run complete. Re-run with --write to apply.' : 'Migration complete.');
}

main();
