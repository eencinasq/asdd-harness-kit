#!/usr/bin/env node
/**
 * asdd converge-eval — score EARS/converge fixtures (P3.5).
 * Usage: asdd converge-eval [--json] [--cases <dir>]
 */
import { runEvalSuite, formatEvalReport } from './converge-eval-lib.mjs';

const argv = process.argv.slice(2);
const wantJson = argv.includes('--json');
const casesIdx = argv.indexOf('--cases');
const casesDir = casesIdx >= 0 ? argv[casesIdx + 1] : undefined;

const suite = runEvalSuite({ casesDir });
if (wantJson) process.stdout.write(`${JSON.stringify(suite, null, 2)}\n`);
else process.stdout.write(formatEvalReport(suite));
process.exit(suite.ok ? 0 : 1);
