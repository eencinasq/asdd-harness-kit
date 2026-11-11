#!/usr/bin/env node
/**
 * Harness Engineering invariants (cheap, no Nx).
 * Run from repo root: asdd check [--live] [--record]
 *
 * --live (or HARNESS_JEV_LIVE=1, kept for older hook configs): structural live path for verify-on-stop.
 *
 * --live or --record: the run's FAIL lines (QG-LEARN-01) and WARN lines (QG-LEARN-08)
 * are recorded as learning signals under .harness/state/learning/signals/. HARNESS_RUNTIME names the runtime
 * (cursor, claude, ci, …; default cli).
 *
 * Supports:
 * - Global manifest schema v2.0 (active_slices array)
 * - Per-slice manifests v2.0 (state/slices/<id>/manifest.json)
 * - Per-slice sessions v3.0 (state/slices/<id>/sessions/*.json)
 * - Feature tracker invariants (dependencies, concurrent ownership/scope, evidence)
 * - Spec drift DRIFT-01 … DRIFT-07 (drift-lib.mjs)
 * - Phase chain QG-DEC-09 (WARN; validators/phase-chain.mjs)
 * - Learning loop QG-LEARN-* (validators/learning.mjs)
 * - Orphan slice detection
 * - Registry consistency
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import validatePaths from './validators/paths.mjs';
import validateManifest from './validators/manifest.mjs';
import validateFeatures from './validators/features.mjs';
import validateSkills from './validators/skills.mjs';
import validateSteeringTags from './validators/steering-tags.mjs';
import validateLiteEscalation from './validators/lite-escalation.mjs';
import validatePhaseChain from './validators/phase-chain.mjs';
import validateSpecDrift from './validators/spec-drift.mjs';
import validateLearning from './validators/learning.mjs';

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
validateSteeringTags(ctx);
validateLiteEscalation(ctx);
validatePhaseChain(ctx);
validateSpecDrift(ctx);
validateLearning(ctx);

if (warnings.length) {
  for (const w of warnings) console.warn(`WARN  ${w}`);
}
const argv = process.argv.slice(2);
if (argv.includes('--live') || argv.includes('--record') || process.env.HARNESS_JEV_LIVE === '1') {
  // Imported lazily so a missing or broken learning lib never changes the gate result.
  try {
    const { writeSensorSignal } = await import('./learning-lib.mjs');
    writeSensorSignal(root, errors, { warns: warnings, runtime: process.env.HARNESS_RUNTIME || 'cli' });
  } catch {
    // learning is best-effort
  }
}
if (errors.length) {
  for (const e of errors) console.error(`FAIL  ${e}`);
  process.exit(1);
}
console.log('PASS  harness invariants');
