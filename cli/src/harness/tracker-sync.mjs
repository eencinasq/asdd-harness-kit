#!/usr/bin/env node
/**
 * asdd tracker-sync — plan (default) or local-apply bi-directional tracker sync (P4.1).
 * Usage: asdd tracker-sync [--slice <id>] [--json] [--apply]
 */
import { buildTrackerSyncPlan, applyTrackerSyncPlan, formatTrackerSyncPlan } from './tracker-sync-lib.mjs';

const root = process.cwd();
const argv = process.argv.slice(2);
const wantJson = argv.includes('--json');
const wantApply = argv.includes('--apply');
const sliceIdx = argv.indexOf('--slice');
const sliceId = sliceIdx >= 0 ? argv[sliceIdx + 1] : null;

const plan = buildTrackerSyncPlan({ root, sliceId });
let receipt = null;
if (wantApply) receipt = applyTrackerSyncPlan(root, plan);

if (wantJson) {
  process.stdout.write(`${JSON.stringify({ plan, receipt }, null, 2)}\n`);
} else {
  process.stdout.write(formatTrackerSyncPlan(plan));
  if (receipt) console.log(`APPLY  ${receipt.receipt_path}`);
}
