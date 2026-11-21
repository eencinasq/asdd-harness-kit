#!/usr/bin/env node
/**
 * asdd converge — cheap feature converge sensor (P1.3).
 * Usage: asdd converge [--slice <id>] [--strict] [--json]
 */
import { runConverge, formatConvergeFindings } from './converge-lib.mjs';
import { parseCommand, runMain } from './commands.mjs';

export async function run(argv = process.argv.slice(2)) {
  const root = process.cwd();
  const { values } = parseCommand('converge', argv);
  const { json, strict } = values;
  const sliceId = values.slice ?? null;

  const result = runConverge({ root, sliceId: sliceId || undefined, strict });

  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    const lines = formatConvergeFindings(result);
    if (lines.length === 0) console.log('OK  converge — no findings');
    else for (const line of lines) console.log(line);
    if (!result.ok) console.log(`FAIL  converge — ${result.fails.length} fail(s), ${result.warns.length} warn(s)`);
    else if (result.warns.length) console.log(`WARN  converge — ${result.warns.length} warn(s)`);
  }

  return result.ok ? 0 : 1;
}

await runMain(import.meta.url, run);
