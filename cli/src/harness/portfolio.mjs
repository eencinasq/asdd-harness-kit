#!/usr/bin/env node
/**
 * asdd portfolio — read-only multi-repo harness summary (P3.2).
 * Usage: asdd portfolio [--json]
 */
import { buildPortfolio, formatPortfolio } from './portfolio-lib.mjs';
import { parseCommand, runMain } from './commands.mjs';

export async function run(argv = process.argv.slice(2)) {
  const root = process.cwd();
  const wantJson = parseCommand('portfolio', argv).values.json;
  const report = buildPortfolio(root);
  if (wantJson) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write(formatPortfolio(report));
}

await runMain(import.meta.url, run);
