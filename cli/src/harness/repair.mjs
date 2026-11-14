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
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const jsonOut = args.includes('--json');
const sliceArg = args.indexOf('--slice');
const onlySlice = sliceArg >= 0 ? args[sliceArg + 1] : null;

if (sliceArg >= 0 && (!onlySlice || onlySlice.startsWith('-'))) {
  console.error('Usage: asdd repair [--dry-run] [--slice <id>] [--json]');
  process.exit(2);
}

const SLICE_ID_RE = /^[a-z0-9_-]+$/;
const PHASES = ['discovery', 'spec', 'validation', 'domain', 'design', 'task_planning', 'implementation', 'qa', 'knowledge'];
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

function discoverSliceIds(globalManifest) {
  const ids = new Set();
  for (const entry of globalManifest?.active_slices ?? []) {
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
  const mode = ['lite', 'hotfix', 'full', 'escalated'].includes(fromManifest?.mode) ? fromManifest.mode
    : ['lite', 'hotfix', 'full', 'escalated'].includes(fromGlobal?.mode) ? fromGlobal.mode
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

function ensureGlobalManifest(sliceIds) {
  const rel = '.harness/state/manifest.json';
  let data = readJson(rel);
  if (!data || !Array.isArray(data.active_slices)) {
    note(data ? 'FIX' : 'WRITE', rel, 'global manifest');
    data = {
      schema_version: '3.0',
      domain_model_version: data?.domain_model_version || '0.0.0',
      active_slices: [],
    };
  } else if (data.schema_version !== '2.0' && data.schema_version !== '3.0') {
    note('FIX', rel, `schema_version ${data.schema_version} → 3.0`);
    data = { ...data, schema_version: '3.0' };
  }

  const byId = new Map();
  for (const entry of data.active_slices) {
    const id = typeof entry === 'string' ? entry : entry?.slice_id;
    if (id) byId.set(id, typeof entry === 'string' ? { slice_id: id } : { ...entry });
  }

  const next = [];
  for (const id of sliceIds) {
    const prev = byId.get(id) || {};
    next.push({
      slice_id: id,
      phase: PHASES.includes(prev.phase) ? prev.phase : 'discovery',
      status: ['DONE', 'in_progress', 'PARKED', 'ABANDONED'].includes(prev.status) ? prev.status : 'in_progress',
      mode: ['lite', 'hotfix', 'full', 'escalated'].includes(prev.mode) ? prev.mode : 'lite',
      manifest: `.harness/state/slices/${id}/manifest.json`,
      features: `.harness/features/${id}.features.json`,
    });
  }

  const before = JSON.stringify(data.active_slices);
  data.active_slices = onlySlice
    ? [
        ...data.active_slices
          .map((e) => (typeof e === 'string' ? { slice_id: e } : e))
          .filter((e) => e?.slice_id && e.slice_id !== onlySlice),
        ...next,
      ]
    : next;
  data.schema_version = data.schema_version === '2.0' ? '2.0' : '3.0';
  if (before !== JSON.stringify(data.active_slices) || !existsSync(join(root, rel))) {
    note('WRITE', rel, `${data.active_slices.length} active slice(s)`);
    writeJson(rel, data);
  }
  return { data, byId };
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

const preliminary = readJson('.harness/state/manifest.json');
const sliceIds = discoverSliceIds(preliminary);
const { byId } = ensureGlobalManifest(sliceIds);

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
