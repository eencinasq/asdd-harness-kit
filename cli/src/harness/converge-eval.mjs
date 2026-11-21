#!/usr/bin/env node
/**
 * asdd converge-eval — score EARS/converge fixtures (P3.5).
 * Usage: asdd converge-eval [--json] [--cases <dir>]
 */
import { runEvalSuite, formatEvalReport } from './converge-eval-lib.mjs';
import { parseCommand, runMain } from './commands.mjs';

export async function run(argv = process.argv.slice(2)) {
  const { values } = parseCommand('converge-eval', argv);
  const wantJson = values.json;
  const casesDir = values.cases;

  const suite = runEvalSuite({ casesDir });
  if (wantJson) process.stdout.write(`${JSON.stringify(suite, null, 2)}\n`);
  else process.stdout.write(formatEvalReport(suite));
  return suite.ok ? 0 : 1;
}

await runMain(import.meta.url, run);
