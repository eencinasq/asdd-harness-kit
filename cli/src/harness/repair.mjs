#!/usr/bin/env node
/**
 * repair.mjs — bring the harness tree back to a consistent v3 layout.
 *
 * Ensures dirs, global manifest, per-slice sessions/specs/features, then regenerates
 * manifests, registry, and PROGRESS.md via sync. Replaces the old `asdd migrate` flows.
 *
 * Usage:
 *   asdd repair [--dry-run] [--slice <id>] [--json]
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PHASES, SLICE_MODES } from './sync-state.mjs';
import { parseCommand, runMain } from './commands.mjs';

export async function run(argv = process.argv.slice(2)) {
  const root = process.cwd();
  const { values } = parseCommand('repair', argv);
  const dryRun = values['dry-run'];
  const jsonOut = values.json;
  const onlySlice = values.slice ?? null;

  if (onlySlice === '') {
    console.error('Usage: asdd repair [--dry-run] [--slice <id>] [--json]');
    process.exit(2);
  }

  const SLICE_ID_RE = /^[a-z0-9_-]+$/;
  const SKELETON = [
    '.harness/state',
    '.harness/state/slices',
    '.harness/state/archive',
    '.harness/state/learning',
    '.harness/state/learning/signals',
    '.harness/features',
    '.harness/specs',
    '.harness/audits',
    '.harness/config',
    '.harness/steering',
  ];

  const actions = [];
  const note = (op, path, detail) => {
    actions.push({ op, path, detail });
    if (!jsonOut) console.log(`${dryRun ? 'DRY' : op.padEnd(6)} ${path}${detail ? `  (${detail})` : ''}`);
  };

  function readJson(rel) {
    const p = join(root, rel);
    if (!existsSync(p)) return null;
    try {
      return JSON.parse(readFileSync(p, 'utf8'));
    } catch {
      return null;
    }
  }

  function writeJson(rel, data) {
    const p = join(root, rel);
    if (dryRun) return;
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, `${JSON.stringify(data, null, 2)}\n`);
  }

  function ensureDir(rel) {
    const p = join(root, rel);
    if (existsSync(p)) return;
    note('MKDIR', rel);
    if (!dryRun) mkdirSync(p, { recursive: true });
  }

  function listDirs(rel) {
    const p = join(root, rel);
    if (!existsSync(p)) return [];
    return readdirSync(p, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name)
      .filter((n) => SLICE_ID_RE.test(n));
  }

  function discoverSliceIds(registry) {
    const ids = new Set();
    // The generated index is one discovery source (global state/manifest.json retired — RV1-AR-1).
    for (const entry of registry?.slices ?? []) {
      const id = typeof entry === 'string' ? entry : entry?.slice_id;
      if (id && SLICE_ID_RE.test(id)) ids.add(id);
    }
    for (const id of listDirs('.harness/state/slices')) ids.add(id);
    for (const id of listDirs('.harness/specs')) ids.add(id);
    const featuresDir = join(root, '.harness/features');
    if (existsSync(featuresDir)) {
      for (const name of readdirSync(featuresDir)) {
        const m = name.match(/^([a-z0-9_-]+)\.features\.json$/);
        if (m) ids.add(m[1]);
      }
    }
    if (onlySlice) {
      if (!SLICE_ID_RE.test(onlySlice)) {
        console.error(`FAIL  invalid slice id: ${onlySlice}`);
        process.exit(2);
      }
      return [onlySlice];
    }
    return [...ids].sort();
  }

  function sessionFiles(sliceId) {
    const dir = join(root, '.harness/state/slices', sliceId, 'sessions');
    if (!existsSync(dir)) return [];
    return readdirSync(dir).filter((n) => n.endsWith('.json')).sort();
  }

  function seedSessions(sliceId, fromManifest, fromGlobal) {
    const sessionsRel = `.harness/state/slices/${sliceId}/sessions`;
    ensureDir(sessionsRel);
    if (sessionFiles(sliceId).length) return false;

    const at = fromManifest?.updated_at || fromManifest?.created_at || fromGlobal?.updated_at || new Date().toISOString();
    const phase = PHASES.includes(fromManifest?.phase) ? fromManifest.phase
      : PHASES.includes(fromGlobal?.phase) ? fromGlobal.phase
        : 'discovery';
    const status = fromManifest?.status || fromGlobal?.status || 'in_progress';
    const mode = SLICE_MODES.includes(fromManifest?.mode) ? fromManifest.mode
      : SLICE_MODES.includes(fromGlobal?.mode) ? fromGlobal.mode
        : 'lite';
    const done = status === 'DONE';

    const base = {
      schema_version: '1.0',
      agent: 'human',
      human: 'squad',
      slice_id: sliceId,
      concerns: [],
      mode,
    };
    const sessions = [
      {
        ...base,
        session_id: `sess-${sliceId}-001`,
        timestamp: fromManifest?.created_at || at,
        event_type: 'phase_started',
        phase: 'discovery',
        evidence: 'Slice repaired (seeded session)',
      },
    ];
    if (done || phase !== 'discovery') {
      sessions.push({
        ...base,
        session_id: `sess-${sliceId}-002`,
        timestamp: at,
        event_type: done ? 'phase_completed' : 'phase_started',
        phase: done ? 'knowledge' : phase,
        evidence: `Repaired from existing state: phase ${phase}, status ${status}`,
      });
    }

    sessions.forEach((s, i) => {
      const rel = `${sessionsRel}/${String(i + 1).padStart(3, '0')}-repair.json`;
      note('WRITE', rel, 'seed session');
      writeJson(rel, s);
    });
    return true;
  }

  function ensureFeatures(sliceId) {
    const rel = `.harness/features/${sliceId}.features.json`;
    const existing = readJson(rel);
    if (!existing) {
      note('WRITE', rel, 'features stub');
      writeJson(rel, {
        schema_version: '1.0',
        slice_id: sliceId,
        source_tasks: `.harness/specs/${sliceId}/tasks.md`,
        features: [],
      });
      return;
    }
    let changed = false;
    const next = { ...existing };
    if (next.slice_id !== sliceId) {
      next.slice_id = sliceId;
      changed = true;
    }
    if (!next.source_tasks) {
      next.source_tasks = `.harness/specs/${sliceId}/tasks.md`;
      changed = true;
    }
    if (!Array.isArray(next.features)) {
      next.features = [];
      changed = true;
    }
    if (!next.schema_version) {
      next.schema_version = '1.0';
      changed = true;
    }
    if (changed) {
      note('FIX', rel, 'normalize features doc');
      writeJson(rel, next);
    }
  }

  function ensureSpecs(sliceId) {
    const dir = `.harness/specs/${sliceId}`;
    ensureDir(dir);
    const tasks = `${dir}/tasks.md`;
    if (!existsSync(join(root, tasks))) {
      note('WRITE', tasks, 'tasks stub');
      if (!dryRun) {
        writeFileSync(join(root, tasks), `# ${sliceId} — Tasks\n\n> Planned during Task Planning phase.\n\n`);
      }
    }
  }

  function repairSlice(sliceId, globalById) {
    const sliceDir = `.harness/state/slices/${sliceId}`;
    ensureDir(sliceDir);
    ensureDir(`${sliceDir}/sessions`);
    const manifest = readJson(`${sliceDir}/manifest.json`);
    seedSessions(sliceId, manifest, globalById.get(sliceId));
    ensureSpecs(sliceId);
    ensureFeatures(sliceId);
  }

  /**
   * Global .harness/state/manifest.json is retired (RV1-AR-1): the generated registry.json is the slice index.
   * Whatever project data it carried (domain_model_version) is preserved into tracked .harness/config/project.json,
   * then the file is removed — by shape, not by managed-list proof (it was always kit-generated).
   */
  function retireGlobalManifest() {
    const rel = '.harness/state/manifest.json';
    const data = readJson(rel);
    if (!existsSync(join(root, rel))) return;
    if (!data || !Array.isArray(data.active_slices)) {
      note('WARN', rel, 'unrecognized content — kept for manual reconciliation');
      return;
    }
    const projectRel = '.harness/config/project.json';
    const project = readJson(projectRel);
    if (project && data.domain_model_version && project.domain_model_version === undefined) {
      project.domain_model_version = data.domain_model_version;
      writeJson(projectRel, project);
      note('MIGRATE', `${rel} → ${projectRel}`, `domain_model_version ${data.domain_model_version}`);
    }
    note('REMOVE', rel, 'superseded by generated registry.json');
    if (!dryRun) rmSync(join(root, rel), { force: true });
  }

  /** Previous phase/status/mode per slice, from the generated index (was global manifest active_slices). */
  function registrySliceIndex(registry) {
    const byId = new Map();
    for (const entry of registry?.slices ?? []) {
      const s = typeof entry === 'string' ? { slice_id: entry } : entry;
      if (s?.slice_id) byId.set(s.slice_id, s);
    }
    return byId;
  }

  function runSync(sliceIds) {
    const script = fileURLToPath(new URL('./sync-state.mjs', import.meta.url));
    if (dryRun) {
      note('SYNC', '.harness/state', onlySlice ? `would sync --slice ${onlySlice}` : 'would sync all');
      return 0;
    }
    const argv = onlySlice ? [script, '--slice', onlySlice] : [script];
    const res = spawnSync(process.execPath, argv, { cwd: root, encoding: 'utf8' });
    if (!jsonOut) {
      if (res.stdout?.trim()) process.stdout.write(res.stdout.endsWith('\n') ? res.stdout : `${res.stdout}\n`);
      if (res.stderr?.trim()) process.stderr.write(res.stderr.endsWith('\n') ? res.stderr : `${res.stderr}\n`);
    } else if (res.stderr?.trim()) {
      process.stderr.write(res.stderr.endsWith('\n') ? res.stderr : `${res.stderr}\n`);
    }
    if (res.status !== 0) {
      note('FAIL', 'asdd sync', `exit ${res.status ?? 1}`);
      return res.status ?? 1;
    }
    note('SYNC', '.harness/state', onlySlice ? `slice ${onlySlice}` : `${sliceIds.length} slice(s)`);
    return 0;
  }

  if (!existsSync(join(root, '.harness'))) {
    console.error('FAIL  no .harness/ here; run from a project root (or: asdd install .)');
    process.exit(1);
  }

  for (const dir of SKELETON) ensureDir(dir);

  const preliminary = readJson('.harness/state/registry.json');
  const sliceIds = discoverSliceIds(preliminary);
  const byId = registrySliceIndex(preliminary);
  retireGlobalManifest();

  for (const id of sliceIds) repairSlice(id, byId);

  const syncCode = runSync(sliceIds);

  if (jsonOut) {
    process.stdout.write(`${JSON.stringify({ ok: syncCode === 0, dryRun, slices: sliceIds, actions }, null, 2)}\n`);
  }

  if (syncCode !== 0) process.exit(syncCode);
  if (!jsonOut) {
    console.log(dryRun
      ? `OK dry-run: ${actions.length} action(s) across ${sliceIds.length} slice(s)`
      : `OK repaired ${sliceIds.length} slice(s); run asdd check`);
  }
  process.exit(0);
}

await runMain(import.meta.url, run);
