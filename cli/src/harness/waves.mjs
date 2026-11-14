#!/usr/bin/env node
/**
 * asdd waves — parallelism hints from feature owners/deps/scopes (P3.1).
 * Usage: asdd waves [--slice <id>] [--json]
 */
import { planWavesForRoot, formatWavesPlan } from './waves-lib.mjs';

const root = process.cwd();
const argv = process.argv.slice(2);
const wantJson = argv.includes('--json');
const sliceIdx = argv.indexOf('--slice');
const sliceId = sliceIdx >= 0 ? argv[sliceIdx + 1] : null;

const results = planWavesForRoot(root, sliceId);
if (wantJson) {
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
} else {
  process.stdout.write(formatWavesPlan(results));
}
