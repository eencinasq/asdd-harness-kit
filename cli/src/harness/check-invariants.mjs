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
 * - Intent grounding evidence INTENT-EVIDENCE (validators/intent-evidence.mjs; drift.intent_evidence warn|fail)
 * - Telemetry TEL-W1…W3 (WARN only, never a learning signal; validators/telemetry.mjs, ADR-006)
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
import validateSteeringProfile from './validators/steering-profile.mjs';
import validateLiteEscalation from './validators/lite-escalation.mjs';
import validatePhaseChain from './validators/phase-chain.mjs';
import validateSpecDrift from './validators/spec-drift.mjs';
import validateLearning from './validators/learning.mjs';
import validateIntentEvidence from './validators/intent-evidence.mjs';

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

// The global slice index is the generated registry (state/manifest.json retired — RV1-AR-1). Its absence is a
// legitimate state (AR-2: zero-slice project / pre-sync fresh clone), so it is read softly — validators/manifest.mjs
// owns the missing-versus-absent verdict.
const registryPath = join(root, '.harness/state/registry.json');
const registry = existsSync(registryPath) ? readJson('.harness/state/registry.json') : null;

const ctx = { root, fail, warn, readJson, dirExists, registry };

validatePaths(ctx);
validateManifest(ctx);
validateFeatures(ctx);
validateSkills(ctx);
validateSteeringTags(ctx);
validateSteeringProfile(ctx);
validateLiteEscalation(ctx);
validatePhaseChain(ctx);
validateSpecDrift(ctx);
validateLearning(ctx);
validateIntentEvidence(ctx);

// P1.3: converge FAILs for passing features (short path before session close)
try {
  const { runConverge } = await import('./converge-lib.mjs');
  const converge = runConverge({ root });
  for (const f of converge.fails) fail(`${f.code} ${f.message}`);
  for (const f of converge.warns) warn(`${f.code} ${f.message}`);
} catch {
  // converge is best-effort if the module cannot load
}

// P2.3: uphill features still open late in the cycle
try {
  const { lateUphillFindings } = await import('./hill-lib.mjs');
  for (const u of lateUphillFindings(root)) {
    warn(
      `HILL-01 feature ${u.feature_id} on slice "${u.slice_id}" is still uphill in phase ${u.phase} — resolve unknowns or set hill: downhill`,
    );
  }
} catch {
  // hill is best-effort
}

// Telemetry (REQ-019, ADR-006): WARN-only and best-effort. Its ctx maps fail to warn (and omits readJson, which
// fails), its WARNs stay in their own list (printed, never passed to writeSensorSignal), and a load failure or a
// throw adds no output (AMB-010).
const telemetryWarnings = [];
try {
  const { default: validateTelemetry } = await import('./validators/telemetry.mjs');
  const found = [];
  const keep = (msg) => found.push(msg);
  validateTelemetry({ root, fail: keep, warn: keep });
  telemetryWarnings.push(...found);
} catch {
  // telemetry is best-effort
}

if (warnings.length || telemetryWarnings.length) {
  for (const w of [...warnings, ...telemetryWarnings]) console.warn(`WARN  ${w}`);
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
