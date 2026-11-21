#!/usr/bin/env node
/**
 * asdd spec-source — experimental opt-in REQ inventory (P4.4).
 * Usage: asdd spec-source [--slice <id>] [--json]
 */
import { buildSpecSourceInventory, formatSpecSourceInventory } from './spec-source-lib.mjs';
import { parseCommand, runMain } from './commands.mjs';

export async function run(argv = process.argv.slice(2)) {
  const root = process.cwd();
  const { values } = parseCommand('spec-source', argv);
  const wantJson = values.json;
  const sliceId = values.slice ?? null;

  const inv = buildSpecSourceInventory(root, { sliceId });
  if (wantJson) process.stdout.write(`${JSON.stringify(inv, null, 2)}\n`);
  else process.stdout.write(formatSpecSourceInventory(inv));
  return inv.enabled ? 0 : 1;
}

await runMain(import.meta.url, run);
