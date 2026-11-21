#!/usr/bin/env node
/**
 * asdd waves — parallelism hints from feature owners/deps/scopes (P3.1).
 * Usage: asdd waves [--slice <id>] [--json]
 */
import { planWavesForRoot, formatWavesPlan } from './waves-lib.mjs';
import { parseCommand, runMain } from './commands.mjs';

export async function run(argv = process.argv.slice(2)) {
  const root = process.cwd();
  const { values } = parseCommand('waves', argv);
  const wantJson = values.json;
  const sliceId = values.slice ?? null;

  const results = planWavesForRoot(root, sliceId);
  if (wantJson) {
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  } else {
    process.stdout.write(formatWavesPlan(results));
  }
}

await runMain(import.meta.url, run);
