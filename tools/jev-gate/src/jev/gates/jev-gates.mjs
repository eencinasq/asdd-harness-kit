/**
 * Jev System One gates for Shape Up (pitch, bet, scopes) and Product Delivery (EARS outcomes), served only by the
 * jev-gate MCP server to people in chat. They are not part of the harness or the ASDD pipeline (no asdd command, no
 * skill, no hook calls them). Every verdict is `{ payload, failed }`: an unavailable Jev is never a pass.
 */

import { loadEnv } from '../../harness/env-loader.mjs';
import { apiKeyFrom, jevChoice, jevHealthCheck, jevNoul, jevScore } from './jev-client.mjs';

export const THRESHOLDS = {
	appetiteAccept: 4,
	rabbitHole: 0.8,
	ears: 0.85,
	goldPlating: 0.85,
	commandSafe: 0.8,
	hillContinue: 2,
};

function gateFail(result, extra = {}) {
	return { ok: false, unavailable: Boolean(result._unavailable), result, ...extra };
}

/** Jev needs only its key (JEV_API_KEY, in the environment or .env / .env.local). */
export function assertJevConfigured() {
	if (!apiKeyFrom()) return { ok: false, error: 'Jev is not configured: set JEV_API_KEY (do not commit the key).' };
	return { ok: true };
}

export async function shapeUpGates(pitch) {
	const appetite = await jevScore(
		'Does this pitch fit within the timebox appetite?',
		pitch,
		['fits within timebox', 'no hidden complexity', 'feasible with available resources'],
		0,
	);
	const rabbit = await jevNoul(
		'Is the solution boundary completely defined without hidden dependencies?',
		pitch,
		['dependencies are mapped', 'interfaces are clear', 'no unknown external systems'],
		0,
	);
	if (appetite._unavailable || rabbit._unavailable) {
		return gateFail(appetite._unavailable ? appetite : rabbit, { appetite, rabbit });
	}
	return {
		ok: appetite.score >= THRESHOLDS.appetiteAccept && rabbit.prob_yes >= THRESHOLDS.rabbitHole,
		appetite,
		rabbit,
		acceptPitch: appetite.score >= THRESHOLDS.appetiteAccept,
		noRabbitHole: rabbit.prob_yes >= THRESHOLDS.rabbitHole,
	};
}

export async function earsGate(requirement) {
	const result = await jevNoul(
		'Does this requirement describe an observable, unconditioned outcome?',
		{ requirement },
		['has explicit trigger', 'has clear actor', 'has observable outcome'],
		0,
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
		'reshape',
	);
	if (result._unavailable) return gateFail(result);
	return { ok: Boolean(result.choice), result };
}

export async function hillChartGate({ task, timeboxRemaining }) {
	const result = await jevScore(
		'Is this task making progress with uncertainty resolved before the timebox expires?',
		{ task, timeboxRemaining },
		['making progress', 'uncertainty resolved'],
		0,
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
		0,
	);
	if (result._unavailable) return gateFail(result);
	return { ok: result.prob_yes >= THRESHOLDS.goldPlating, result };
}

/**
 * Gate verdicts as the MCP tools report them: `{ payload, failed }`. The project's .env / .env.local are re-read
 * first (MCP clients do not pass the shell env); a missing key fails closed.
 */
function blocked(root) {
	loadEnv(root);
	const cfg = assertJevConfigured();
	if (cfg.ok) return null;
	return { payload: { error: cfg.error, unavailable: true, thresholds: THRESHOLDS }, failed: true };
}

async function verdict(root, run) {
	const stop = blocked(root);
	if (stop) return stop;
	const result = await run();
	return { payload: { ...result, thresholds: THRESHOLDS }, failed: Boolean(result.unavailable || !result.ok) };
}

export async function statusVerdict(root = process.cwd(), { health = false } = {}) {
	const stop = blocked(root);
	if (stop) return stop;
	const payload = { ok: true, thresholds: THRESHOLDS };
	if (health) payload.health = await jevHealthCheck();
	return { payload, failed: false };
}

export function shapeUpVerdict(root, pitch, appetite) {
	const merged =
		typeof pitch === 'string' ? { text: pitch, appetite } : { ...pitch, ...(appetite ? { appetite } : {}) };
	return verdict(root, () => shapeUpGates(merged));
}

export const earsVerdict = (root, requirement) => verdict(root, () => earsGate(requirement));

export const scopeVerdict = (root, scope) => verdict(root, () => scopeChoice(scope));
