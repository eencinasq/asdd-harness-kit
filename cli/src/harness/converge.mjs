#!/usr/bin/env node
/**
 * asdd converge — cheap feature converge sensor (P1.3).
 * Usage: asdd converge [--slice <id>] [--strict] [--json]
 */
import { runConverge, formatConvergeFindings } from './converge-lib.mjs';

const root = process.cwd();
const argv = process.argv.slice(2);
const json = argv.includes('--json');
const strict = argv.includes('--strict');
const sliceFlag = argv.indexOf('--slice');
const sliceId = sliceFlag >= 0 ? argv[sliceFlag + 1] : null;

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

process.exit(result.ok ? 0 : 1);
