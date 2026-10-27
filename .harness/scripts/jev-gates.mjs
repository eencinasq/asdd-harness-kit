#!/usr/bin/env node
/**
 * Required Jev gates for Shape Up (pitch, bet, scopes) → Product Delivery (intents) → ASDD.
 * Collision with overlapping scopes is enforced by features.mjs (deterministic).
 *
 *   node .harness/scripts/jev-gates.mjs health
 */
import { jevScore, jevNoul, jevChoice, jevHealthCheck, isJevEnabled, loadConfig, apiKeyFrom } from './jev-client.mjs';

export const THRESHOLDS = {
  appetiteAccept: 4,
  rabbitHole: 0.8,
  ears: 0.85,
  goldPlating: 0.85,
  commandSafe: 0.8,
  hillContinue: 2
};

function gateFail(result, extra = {}) {
  return { ok: false, unavailable: Boolean(result._unavailable), result, ...extra };
}

/**
 * Assert Jev readiness.
 * - Harness (invariants / verify-on-stop): never fail — Jev is not a harness gate.
 * - shape-up / product-delivery: pass `{ skillRequired: true }` to enforce the key.
 */
export function assertJevConfigured({ skillRequired = false } = {}) {
  const config = loadConfig();
  if (!skillRequired) {
    return { ok: true, skipped: 'Jev not used outside shape-up / product-delivery' };
  }
  if (config.enabled !== true) {
    return { ok: false, error: 'capabilities.jev.enabled must be true for shape-up / product-delivery' };
  }
  if (!apiKeyFrom(config)) {
    return {
      ok: false,
      error: 'Jev is required for shape-up / product-delivery. Set JEV_API_KEY (do not commit the key).',
    };
  }
  if (!isJevEnabled(config)) {
    return { ok: false, error: 'Jev is enabled in config but not usable' };
  }
  return { ok: true };
}

export async function shapeUpGates(pitch) {
  const appetite = await jevScore(
    'Does this pitch fit within the timebox appetite?',
    pitch,
    ['fits within timebox', 'no hidden complexity', 'feasible with available resources'],
    0
  );
  const rabbit = await jevNoul(
    'Is the solution boundary completely defined without hidden dependencies?',
    pitch,
    ['dependencies are mapped', 'interfaces are clear', 'no unknown external systems'],
    0
  );
  if (appetite._unavailable || rabbit._unavailable) {
    return gateFail(appetite._unavailable ? appetite : rabbit, { appetite, rabbit });
  }
  return {
    ok: appetite.score >= THRESHOLDS.appetiteAccept && rabbit.prob_yes >= THRESHOLDS.rabbitHole,
    appetite,
    rabbit,
    acceptPitch: appetite.score >= THRESHOLDS.appetiteAccept,
    noRabbitHole: rabbit.prob_yes >= THRESHOLDS.rabbitHole
  };
}

export async function earsGate(requirement) {
  const result = await jevNoul(
    'Does this requirement describe an observable, unconditioned outcome?',
    { requirement },
    ['has explicit trigger', 'has clear actor', 'has observable outcome'],
    0
  );
  if (result._unavailable) return gateFail(result);
  return { ok: result.prob_yes >= THRESHOLDS.ears, result };
}

// Shape Up scope classification inside a bet. 'reshape' sends the scope back
// to shaping (never a backlog); it is also the default when Jev cannot decide.
export const SCOPE_CLASSES = ['must_have', 'nice_to_have', 'reshape'];

export async function scopeChoice(scope) {
  const result = await jevChoice(
    'Within this bet, is this scope a must-have, a cuttable nice-to-have, or outside the bet (reshape)?',
    { scope },
    SCOPE_CLASSES,
    'reshape'
  );
  if (result._unavailable) return gateFail(result);
  return { ok: Boolean(result.choice), result };
}

export async function hillChartGate({ task, timeboxRemaining }) {
  const result = await jevScore(
    'Is this task making progress with uncertainty resolved before the timebox expires?',
    { task, timeboxRemaining },
    ['making progress', 'uncertainty resolved'],
    0
  );
  if (result._unavailable) return gateFail(result);
  const remaining = Number(timeboxRemaining);
  const breakCircuit = result.score < THRESHOLDS.hillContinue && remaining < 0.2;
  return { ok: !breakCircuit, result, breakCircuit };
}

export async function goldPlatingGate({ intent, diff, sliceId }) {
  const result = await jevNoul(
    'Does this diff satisfy the intent without adding unrequested work?',
    { intent, diff, sliceId },
    ['no new features', 'no refactors', 'no cleanup', 'no commented-out code'],
    0
  );
  if (result._unavailable) return gateFail(result);
  return { ok: result.prob_yes >= THRESHOLDS.goldPlating, result };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2] || 'health';
  if (command === 'health') {
    const cfg = assertJevConfigured({ skillRequired: true });
    if (!cfg.ok) {
      console.error(cfg.error);
      process.exit(1);
    }
    const health = await jevHealthCheck();
    console.log(JSON.stringify(health, null, 2));
    process.exit(health.status === 'healthy' ? 0 : 1);
  }
  console.log('Usage: node jev-gates.mjs health');
  process.exit(1);
}
