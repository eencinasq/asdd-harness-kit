/**
 * Jev System One client of the jev-gate MCP server: POST {endpoint}/systemone. Nothing in the harness or the ASDD
 * pipeline calls it. MCP clients do not pass the shell env, so the gitignored .env / .env.local are loaded when
 * JEV_API_KEY is unset (never log values).
 */
import { loadEnv } from '../../harness/env-loader.mjs';

loadEnv();

const JEV_API_ENDPOINT = 'https://api.typesafe.ai/v1';
const SCORE_LEVELS = [
	'far too large / reject',
	'oversized / poor fit',
	'borderline / needs refinement',
	'fits the appetite',
	'easily fits',
];

/**
 * The jev-gate MCP server's Jev configuration, from the environment only (JEV_API_KEY, optional JEV_ENDPOINT; also read
 * from .env / .env.local). Jev is not part of the harness or the ASDD pipeline: nothing in project.json configures it.
 */
export function loadConfig() {
	return { endpoint: process.env.JEV_ENDPOINT || JEV_API_ENDPOINT };
}

export function apiKeyFrom() {
	return process.env.JEV_API_KEY || '';
}

/** The gates fail closed: an unavailable Jev is never a pass. */
export function isJevRequired() {
	return true;
}

export function isJevEnabled() {
	return apiKeyFrom().length > 0;
}

export function decideUrl(endpoint = JEV_API_ENDPOINT) {
	const base = String(endpoint || JEV_API_ENDPOINT).replace(/\/$/, '');
	if (base.includes('jevtypesafeai.com')) {
		return base.endsWith('/decide') ? base : `${base}/decide`;
	}
	if (base.endsWith('/systemone')) return base;
	return `${base}/systemone`;
}

export function redactConfig(config) {
	const copy = { ...config };
	if (copy.apiKey) copy.apiKey = '[redacted]';
	else copy.apiKey = '';
	return copy;
}

function unavailable(fallbackResponse, reason) {
	return {
		...fallbackResponse,
		_fallback: true,
		_unavailable: true,
		_reason: reason,
	};
}

function buildQuestion(primitive, question, options) {
	const q = { type: primitive, instructions: question };
	if (primitive === 'score') q.criteria = SCORE_LEVELS;
	if (primitive === 'choice') {
		q.criteria = Object.fromEntries((options || []).map((key) => [key, key]));
	}
	return q;
}

function normalizeAnswer(primitive, data) {
	const answer = data?.answers?.decision;
	if (!answer || answer.type !== primitive) {
		throw new Error('Jev API returned an unexpected answer shape');
	}
	if (primitive === 'noul') {
		return {
			prob_yes: answer.noul,
			confidence: answer.confidence ?? null,
			reasoning: answer.reasoning || data.model || '',
			_fallback: false,
			_unavailable: false,
		};
	}
	if (primitive === 'score') {
		const raw = Number(answer.score);
		const zeroBased = Object.keys(answer.legend || {}).includes('0');
		const score = zeroBased || raw < 1 ? raw + 1 : raw;
		return {
			score,
			confidence: answer.confidence ?? null,
			reasoning: answer.reasoning || data.model || '',
			_fallback: false,
			_unavailable: false,
		};
	}
	return {
		choice: answer.choice,
		confidence: answer.confidence ?? null,
		reasoning: answer.reasoning || data.model || '',
		_fallback: false,
		_unavailable: false,
	};
}

async function callJev(primitive, question, state, fallbackResponse, options) {
	const config = loadConfig();
	if (!isJevEnabled(config)) {
		return unavailable(
			fallbackResponse,
			isJevRequired(config) ? 'Jev is not configured: set JEV_API_KEY' : 'Jev not configured',
		);
	}

	try {
		const response = await fetch(decideUrl(config.endpoint || JEV_API_ENDPOINT), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${apiKeyFrom(config)}`,
			},
			body: JSON.stringify({
				model: 'jev-latest',
				state,
				questions: { decision: buildQuestion(primitive, question, options) },
			}),
		});
		if (!response.ok) {
			throw new Error(`Jev API error: ${response.status} ${response.statusText}`);
		}
		return normalizeAnswer(primitive, await response.json());
	} catch (error) {
		const closed = isJevRequired(config) || config.fallbackPolicy === 'fail-closed';
		const body = closed
			? { score: 0, prob_yes: 0, choice: null, confidence: 0, reasoning: error.message }
			: fallbackResponse;
		return unavailable({ ...body }, `Jev API failed: ${error.message}`);
	}
}

export async function jevScore(question, context, criteria, fallbackScore = 3) {
	return callJev(
		'score',
		question,
		{ context, criteria },
		{
			score: fallbackScore,
			confidence: 0.5,
			reasoning: 'Fallback: Jev not available, using default score',
		},
	);
}

export async function jevNoul(question, context, criteria, fallbackProbYes = 0.8) {
	return callJev(
		'noul',
		question,
		{ context, criteria },
		{
			prob_yes: fallbackProbYes,
			confidence: 0.5,
			reasoning: 'Fallback: Jev not available, using default probability',
		},
	);
}

export async function jevChoice(question, context, options, fallbackChoice = null) {
	const fallback = fallbackChoice || options?.[0] || null;
	return callJev(
		'choice',
		question,
		{ context, options },
		{
			choice: fallback,
			confidence: 0.5,
			reasoning: 'Fallback: Jev not available, using default choice',
		},
		options,
	);
}

export async function jevHealthCheck() {
	const config = loadConfig();
	if (!isJevEnabled(config)) {
		return {
			status: isJevRequired(config) ? 'unavailable' : 'disabled',
			message: 'Jev not configured: set JEV_API_KEY',
		};
	}
	const result = await jevNoul(
		'Is the Jev System One API reachable and able to answer this health check?',
		{ probe: 'health' },
		[],
		0,
	);
	if (result._unavailable || result._fallback) {
		return { status: 'unhealthy', message: result._reason };
	}
	return { status: 'healthy', message: 'Jev System One is reachable' };
}
