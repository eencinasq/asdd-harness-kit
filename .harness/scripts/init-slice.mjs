#!/usr/bin/env node
/**
 * init-slice.mjs — scaffold a new slice with v3.0 append-only session structure.
 * Usage: node .harness/scripts/init-slice.mjs <slice-id>
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const sliceId = process.argv[2];

if (!sliceId || sliceId.startsWith('-')) {
  console.error('Usage: node .harness/scripts/init-slice.mjs <slice-id>');
  process.exit(1);
}

if (!/^[a-z0-9_-]+$/.test(sliceId)) {
  console.error('FAIL  slice-id must be lowercase alphanumeric with hyphens/underscores');
  process.exit(1);
}

const globalManifestPath = join(root, '.harness/state/manifest.json');
if (!existsSync(globalManifestPath)) {
  console.error('FAIL  global manifest not found: .harness/state/manifest.json');
  process.exit(1);
}

const globalManifest = JSON.parse(readFileSync(globalManifestPath, 'utf8'));
const active = Array.isArray(globalManifest.active_slices) ? globalManifest.active_slices : [];
if (active.some((s) => s.slice_id === sliceId)) {
  console.error(`FAIL  slice "${sliceId}" already exists in global manifest`);
  process.exit(1);
}

const nowIso = new Date().toISOString();

// Paths
const sliceDir = join(root, '.harness/state/slices', sliceId);
const sessionsDir = join(sliceDir, 'sessions');
const specDir = join(root, '.harness/specs', sliceId);
const featuresPath = join(root, '.harness/features', `${sliceId}.features.json`);
const progressIndexPath = join(root, '.harness/PROGRESS.md');

// 1. Create session directory and initial session
mkdirSync(sessionsDir, { recursive: true });
const initialSession = {
  schema_version: '1.0',
  session_id: `sess-${sliceId}-001`,
  timestamp: nowIso,
  agent: 'human',
  human: 'squad',
  slice_id: sliceId,
  event_type: 'phase_started',
  phase: 'discovery',
  evidence: 'Slice initialized',
  concerns: [],
};
writeFileSync(join(sessionsDir, '001-initial.json'), `${JSON.stringify(initialSession, null, 2)}\n`);
console.log(`CREATE .harness/state/slices/${sliceId}/sessions/001-initial.json`);

// 2. Spec directory
mkdirSync(specDir, { recursive: true });
console.log(`DIR    .harness/specs/${sliceId}`);

// 3. Stub tasks.md (source_tasks target must exist for invariants)
const tasksStub = `# ${sliceId} — Tasks\n\n> Planned during Task Planning phase.\n\n`;
writeFileSync(join(specDir, 'tasks.md'), tasksStub);
console.log(`CREATE .harness/specs/${sliceId}/tasks.md`);

// 4. Features file
const featuresDoc = {
  schema_version: '1.0',
  slice_id: sliceId,
  source_tasks: `.harness/specs/${sliceId}/tasks.md`,
  features: [],
};
writeFileSync(featuresPath, `${JSON.stringify(featuresDoc, null, 2)}\n`);
console.log(`CREATE ${featuresPath.replace(root + '/', '')}`);

// 5. Generate v3.0 manifest from sessions
const { spawnSync } = await import('node:child_process');
const syncResult = spawnSync(process.execPath, ['.harness/scripts/sync-state.mjs', '--slice', sliceId], {
  cwd: root,
  encoding: 'utf8',
});
if (syncResult.status !== 0) {
  console.error('WARN  sync-state failed:', syncResult.stderr);
} else {
  console.log(`SYNC   .harness/state/slices/${sliceId}/manifest.json`);
}

// 6. Update global manifest (v2 compat)
active.push({
  slice_id: sliceId,
  phase: 'discovery',
  status: 'in_progress',
  manifest: `.harness/state/slices/${sliceId}/manifest.json`,
  features: `.harness/features/${sliceId}.features.json`,
});
globalManifest.active_slices = active;
writeFileSync(globalManifestPath, `${JSON.stringify(globalManifest, null, 2)}\n`);
console.log(`UPDATE .harness/state/manifest.json`);

// 7. Update PROGRESS.md index (v2 compat)
let progressIndex = '';
if (existsSync(progressIndexPath)) {
  progressIndex = readFileSync(progressIndexPath, 'utf8');
}
const row = `| ${sliceId} | in_progress | discovery | — | — |`;
if (progressIndex.includes('| Slice |')) {
  const lines = progressIndex.split('\n');
  const sepIdx = lines.findIndex((l) => l.trim().startsWith('|---'));
  if (sepIdx >= 0) {
    lines.splice(sepIdx + 1, 0, row);
    progressIndex = lines.join('\n');
  } else {
    progressIndex += `\n${row}`;
  }
} else {
  progressIndex += `\n# Progress\n\n| Slice | Status | Phase | Lock | Progress |\n|-------|--------|-------|------|----------|\n${row}\n`;
}
writeFileSync(progressIndexPath, progressIndex.endsWith('\n') ? progressIndex : progressIndex + '\n');
console.log(`UPDATE .harness/PROGRESS.md`);

console.log(`\nSlice "${sliceId}" initialized. Next: write .harness/specs/${sliceId}/intent.md`);
