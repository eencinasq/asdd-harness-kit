#!/usr/bin/env node
/**
 * asdd portfolio — read-only multi-repo harness summary (P3.2).
 * Usage: asdd portfolio [--json]
 */
import { buildPortfolio, formatPortfolio } from './portfolio-lib.mjs';

const root = process.cwd();
const wantJson = process.argv.includes('--json');
const report = buildPortfolio(root);
if (wantJson) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
else process.stdout.write(formatPortfolio(report));
