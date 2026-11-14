#!/usr/bin/env node
/**
 * asdd spec-source — experimental opt-in REQ inventory (P4.4).
 * Usage: asdd spec-source [--slice <id>] [--json]
 */
import { buildSpecSourceInventory, formatSpecSourceInventory } from './spec-source-lib.mjs';

const root = process.cwd();
const argv = process.argv.slice(2);
const wantJson = argv.includes('--json');
const sliceIdx = argv.indexOf('--slice');
const sliceId = sliceIdx >= 0 ? argv[sliceIdx + 1] : null;

const inv = buildSpecSourceInventory(root, { sliceId });
if (wantJson) process.stdout.write(`${JSON.stringify(inv, null, 2)}\n`);
else process.stdout.write(formatSpecSourceInventory(inv));
process.exit(inv.enabled ? 0 : 1);
