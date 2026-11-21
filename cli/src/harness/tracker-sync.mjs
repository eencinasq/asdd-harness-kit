#!/usr/bin/env node
/**
 * asdd tracker-sync — plan (default) or local-apply bi-directional tracker sync (P4.1).
 * Usage: asdd tracker-sync [--slice <id>] [--json] [--apply]
 */
import { buildTrackerSyncPlan, applyTrackerSyncPlan, formatTrackerSyncPlan } from './tracker-sync-lib.mjs';
import { parseCommand, runMain } from './commands.mjs';

export async function run(argv = process.argv.slice(2)) {
  const root = process.cwd();
  const { values } = parseCommand('tracker-sync', argv);
  const wantJson = values.json;
  const wantApply = values.apply;
  const sliceId = values.slice ?? null;

  const plan = buildTrackerSyncPlan({ root, sliceId });
  let receipt = null;
  if (wantApply) receipt = applyTrackerSyncPlan(root, plan);

  if (wantJson) {
    process.stdout.write(`${JSON.stringify({ plan, receipt }, null, 2)}\n`);
  } else {
    process.stdout.write(formatTrackerSyncPlan(plan));
    if (receipt) console.log(`APPLY  ${receipt.receipt_path}`);
  }
}

await runMain(import.meta.url, run);
