#!/usr/bin/env node
/**
 * escalate-slice.mjs — transition a lite slice to escalated mode.
 *
 * Appends a checkpoint session with mode=escalated and re-syncs state. The
 * harness blocks lite slices from reaching DONE while escalation signals are
 * open; escalating is how evidence (scope spread, domain growth, dissent,
 * implementation blockage) is acknowledged and ownership of the full-path
 * rituals (capability.md, requirements.md) is taken.
 *
 * Usage:
 *   node .harness/scripts/escalate-slice.mjs <slice-id> --reasons "E1-scope-spread,E4-dissent" [--by <owner>] [--note "why"]
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const args = process.argv.slice(2);
const sliceId = args.find((a) => !a.startsWith('-'));

function argValue(flag) {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : null;
}

const reasonsRaw = argValue('--reasons');
const by = argValue('--by') || 'harness';
const note = argValue('--note') || '';

if (!sliceId || !reasonsRaw) {
  console.error('Usage: node .harness/scripts/escalate-slice.mjs <slice-id> --reasons "E1,E4" [--by <owner>] [--note "why"]');
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

const reasons = reasonsRaw
  .split(',')
  .map((r) => r.trim())
  .filter(Boolean);
if (reasons.length === 0) {
  console.error('FAIL  --reasons must list at least one escalation trigger');
  process.exit(1);
}

const manifestPath = join(sliceDir, 'manifest.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
if (manifest.mode === 'full') {
  console.error(`FAIL  slice "${sliceId}" is already full mode — nothing to escalate`);
  process.exit(1);
}
if (manifest.mode === 'escalated') {
  console.error(`FAIL  slice "${sliceId}" is already escalated`);
  process.exit(1);
}

const nextIndex = readdirSync(sessionsDir).filter((n) => /^\d+/.test(n)).length + 1;
const seq = String(nextIndex).padStart(3, '0');

const session = {
  schema_version: '1.0',
  session_id: `sess-${sliceId}-${seq}`,
  timestamp: new Date().toISOString(),
  agent: by,
  human: by,
  slice_id: sliceId,
  event_type: 'checkpoint',
  mode: 'escalated',
  escalation_reasons: reasons,
  evidence: note || `Escalating lite → escalated: ${reasons.join(', ')}`,
  concerns: [],
};

const file = join(sessionsDir, `${seq}-escalated.json`);
writeFileSync(file, `${JSON.stringify(session, null, 2)}\n`);
console.log(`CREATE .harness/state/slices/${sliceId}/sessions/${seq}-escalated.json`);

const { spawnSync } = await import('node:child_process');
const sync = spawnSync(process.execPath, ['.harness/scripts/sync-state.mjs', '--slice', sliceId], {
  cwd: root,
  encoding: 'utf8',
});
if (sync.status !== 0) {
  console.error('WARN  sync-state failed:', sync.stderr);
}

console.log(`Slice "${sliceId}" escalated (lite → escalated).`);
console.log('Next: backfill .harness/specs/' + sliceId + '/capability.md and requirements.md from spec.md, then continue at the Validation phase of full ASDD.');
