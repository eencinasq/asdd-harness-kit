#!/usr/bin/env node
/**
 * init-slice.mjs — scaffold a new slice with all required files.
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
const sliceManifestPath = join(sliceDir, 'manifest.json');
const specDir = join(root, '.harness/specs', sliceId);
const progressPath = join(root, '.harness/progress', `${sliceId}.md`);
const featuresPath = join(root, '.harness/features', `${sliceId}.features.json`);
const progressIndexPath = join(root, '.harness/PROGRESS.md');

// 1. Slice manifest from stub
const stubPath = join(root, '.harness/steering/templates/slice-manifest.stub.json');
let sliceManifest;
if (existsSync(stubPath)) {
  sliceManifest = JSON.parse(readFileSync(stubPath, 'utf8'));
} else {
  sliceManifest = {
    schema_version: '2.0',
    slice_id: sliceId,
    phase: 'discovery',
    status: 'in_progress',
    mode: 'full',
    created_at: nowIso,
    updated_at: nowIso,
    agent_heartbeats: {},
    gates: {},
    confidence_chain: {},
    ccs: 0,
    paths: {
      specs: `.harness/specs/${sliceId}`,
      features: `.harness/features/${sliceId}.features.json`,
      progress: `.harness/progress/${sliceId}.md`,
    },
  };
}
sliceManifest.slice_id = sliceId;
sliceManifest.created_at = sliceManifest.created_at || nowIso;
sliceManifest.updated_at = nowIso;

mkdirSync(sliceDir, { recursive: true });
writeFileSync(sliceManifestPath, `${JSON.stringify(sliceManifest, null, 2)}\n`);
console.log(`CREATE ${sliceManifestPath.replace(root + '/', '')}`);

// 2. Spec directory
mkdirSync(specDir, { recursive: true });
console.log(`DIR    .harness/specs/${sliceId}`);

// 3. Progress file
const progressBody = `# ${sliceId}\n\n**Phase:** discovery\n**Status:** in_progress\n**Created:** ${nowIso}\n\n## Session Log\n\n`;
writeFileSync(progressPath, progressBody);
console.log(`CREATE ${progressPath.replace(root + '/', '')}`);

// 4. Stub tasks.md (source_tasks target must exist for invariants)
const tasksStub = `# ${sliceId} — Tasks\n\n> Planned during Task Planning phase.\n\n`;
writeFileSync(join(specDir, 'tasks.md'), tasksStub);
console.log(`CREATE .harness/specs/${sliceId}/tasks.md`);

// 5. Features file
const featuresDoc = {
  schema_version: '1.0',
  slice_id: sliceId,
  source_tasks: `.harness/specs/${sliceId}/tasks.md`,
  features: [],
};
writeFileSync(featuresPath, `${JSON.stringify(featuresDoc, null, 2)}\n`);
console.log(`CREATE ${featuresPath.replace(root + '/', '')}`);

// 6. Update global manifest
active.push({
  slice_id: sliceId,
  phase: sliceManifest.phase,
  status: sliceManifest.status,
  manifest: `.harness/state/slices/${sliceId}/manifest.json`,
  progress: `.harness/progress/${sliceId}.md`,
  features: `.harness/features/${sliceId}.features.json`,
});
globalManifest.active_slices = active;
writeFileSync(globalManifestPath, `${JSON.stringify(globalManifest, null, 2)}\n`);
console.log(`UPDATE .harness/state/manifest.json`);

// 7. Update PROGRESS.md index
let progressIndex = '';
if (existsSync(progressIndexPath)) {
  progressIndex = readFileSync(progressIndexPath, 'utf8');
}
const row = `| ${sliceId} | ${sliceManifest.status} | ${sliceManifest.phase} | — | — |`;
if (progressIndex.includes('| Slice |')) {
  // Append after header separator
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
