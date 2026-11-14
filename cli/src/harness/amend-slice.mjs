#!/usr/bin/env node
/**
 * amend-slice.mjs — reopen a DONE slice for post-DONE evolution (ASDD-ROADMAP P2.2).
 *
 * Appends a checkpoint with status=in_progress (so deriveStatus leaves DONE),
 * writes an amendment note under .harness/specs/<id>/amendments/, and syncs.
 *
 * Usage:
 *   asdd slice amend <slice-id> [--note "…"] [--by <owner>]
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const args = process.argv.slice(2);
const sliceId = args.find((a) => !a.startsWith('-'));

function argValue(flag) {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : null;
}

const by = argValue('--by') || 'harness';
const note = argValue('--note') || 'Post-DONE amendment; maintain capability without a new pitch.';

if (!sliceId || sliceId.startsWith('-')) {
  console.error('Usage: asdd slice amend <slice-id> [--note "…"] [--by <owner>]');
  process.exit(1);
}
if (!/^[a-z0-9_-]+$/.test(sliceId)) {
  console.error('FAIL  slice-id must be lowercase alphanumeric with hyphens/underscores');
  process.exit(1);
}

const sliceDir = join(root, '.harness/state/slices', sliceId);
const sessionsDir = join(sliceDir, 'sessions');
if (!existsSync(sessionsDir)) {
  console.error(`FAIL  slice "${sliceId}" has no sessions directory: ${sessionsDir}`);
  process.exit(1);
}

const manifestPath = join(sliceDir, 'manifest.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
if (manifest.status !== 'DONE') {
  console.error(`FAIL  slice "${sliceId}" status is "${manifest.status || 'unknown'}" — amend requires DONE`);
  process.exit(1);
}

const nowIso = new Date().toISOString();
const nextIndex = readdirSync(sessionsDir).filter((n) => /^\d+/.test(n)).length + 1;
const seq = String(nextIndex).padStart(3, '0');

const amendDir = join(root, '.harness/specs', sliceId, 'amendments');
mkdirSync(amendDir, { recursive: true });
const stamp = nowIso.replace(/[:.]/g, '-');
const amendRel = `.harness/specs/${sliceId}/amendments/${stamp}.md`;
const amendBody = `# Amendment ${stamp}

Slice: \`${sliceId}\`
By: ${by}
At: ${nowIso}

## Note

${note}

## Delta

- [ ] REQ / tasks / features to add or change (fill in)
- [ ] Verification evidence for the new work
`;
writeFileSync(join(root, amendRel), amendBody);
console.log(`CREATE ${amendRel}`);

const session = {
  schema_version: '1.0',
  session_id: `sess-${sliceId}-${seq}`,
  timestamp: nowIso,
  agent: by,
  human: by,
  slice_id: sliceId,
  event_type: 'checkpoint',
  status: 'in_progress',
  amend: true,
  phase: 'implementation',
  evidence: note,
  amendment_path: amendRel,
  concerns: [],
};
writeFileSync(join(sessionsDir, `${seq}-amended.json`), `${JSON.stringify(session, null, 2)}\n`);
console.log(`CREATE .harness/state/slices/${sliceId}/sessions/${seq}-amended.json`);

const syncScript = decodeURIComponent(new URL('./sync-state.mjs', import.meta.url).pathname);
const sync = spawnSync(process.execPath, [syncScript, '--slice', sliceId], { cwd: root, encoding: 'utf8' });
if (sync.status !== 0) {
  console.error('WARN  sync-state failed:', sync.stderr || sync.stdout);
} else {
  console.log(`SYNC   .harness/state/slices/${sliceId}/manifest.json`);
}

console.log(`\nSlice "${sliceId}" amended (DONE → in_progress). Edit ${amendRel}, then add/update features.`);
