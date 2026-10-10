#!/usr/bin/env node
/**
 * Harness Engineering invariants (cheap, no Nx).
 * Run from repo root: node .harness/scripts/check-invariants.mjs [--live]
 *
 * --live (or HARNESS_JEV_LIVE=1): Jev must be usable — a missing JEV_API_KEY
 * is a FAIL, not a WARN. Session-loop gates (verify-on-stop) always run live;
 * CI and ad-hoc structural checks run non-live by default.
 *
 * Supports:
 * - Global manifest schema v2.0 (active_slices array)
 * - Per-slice manifests v2.0 (state/slices/<id>/manifest.json)
 * - Per-slice sessions v3.0 (state/slices/<id>/sessions/*.json)
 * - Feature tracker invariants (dependencies, concurrent ownership/scope, evidence)
 * - Orphan slice detection
 * - Registry consistency
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import validatePaths from './validators/paths.mjs';
import validateManifest from './validators/manifest.mjs';
import validateFeatures from './validators/features.mjs';
import validateSkills from './validators/skills.mjs';
import validateLiteEscalation from './validators/lite-escalation.mjs';
import { validateJevGoldPlating } from './validators/jev-gold-plating.mjs';
import { assertJevConfigured } from './jev-gates.mjs';

const root = process.cwd();
const errors = [];
const warnings = [];

function fail(msg) {
  errors.push(msg);
}

function warn(msg) {
  warnings.push(msg);
}

function readJson(rel) {
  const p = join(root, rel);
  if (!existsSync(p)) {
    fail(`missing JSON: ${rel}`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    fail(`invalid JSON ${rel}: ${e.message}`);
    return null;
  }
}

function dirExists(rel) {
  return existsSync(join(root, rel));
}

const manifest = readJson('.harness/state/manifest.json');

const ctx = { root, fail, warn, readJson, dirExists, manifest };

validatePaths(ctx);
validateManifest(ctx);
validateFeatures(ctx);
validateSkills(ctx);
validateLiteEscalation(ctx);

const jevLive = process.argv.includes('--live') || process.env.HARNESS_JEV_LIVE === '1';
const jevReady = assertJevConfigured({ live: jevLive });
if (!jevReady.ok) {
  fail(jevReady.error);
} else if (jevReady.skipped) {
  warn(jevReady.skipped);
}

try {
  await validateJevGoldPlating(ctx);
} catch (error) {
  fail(`Jev gold-plating: ${error.message}`);
}

if (warnings.length) {
  for (const w of warnings) console.warn(`WARN  ${w}`);
}
if (errors.length) {
  for (const e of errors) console.error(`FAIL  ${e}`);
  process.exit(1);
}
console.log('PASS  harness invariants');
