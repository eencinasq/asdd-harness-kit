#!/usr/bin/env node
/**
 * Jev System One client (required capability).
 * POST {endpoint}/systemone  —  node jev-client.mjs [health|status]
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const JEV_API_ENDPOINT = 'https://api.typesafe.ai/v1';
const SCORE_LEVELS = [
  'far too large / reject',
  'oversized / poor fit',
  'borderline / needs refinement',
  'fits the appetite',
  'easily fits'
];

export function loadConfig() {
  try {
    const projectConfig = JSON.parse(
      readFileSync(resolve(process.cwd(), '.harness/config/project.json'), 'utf8')
    );
    return projectConfig.capabilities?.jev || {};
  } catch {
    return {};
  }
}

export function apiKeyFrom(config = loadConfig()) {
  return config.apiKey || process.env.JEV_API_KEY || '';
}

export function isJevRequired(config = loadConfig()) {
  return config.required !== false;
}

export function isJevEnabled(config = loadConfig()) {
  return config.enabled === true && apiKeyFrom(config).length > 0;
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
    _reason: reason
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
      _unavailable: false
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
      _unavailable: false
    };
  }
  return {
    choice: answer.choice,
    confidence: answer.confidence ?? null,
    reasoning: answer.reasoning || data.model || '',
    _fallback: false,
    _unavailable: false
  };
}

async function callJev(primitive, question, state, fallbackResponse, options) {
  const config = loadConfig();
  if (!isJevEnabled(config)) {
    return unavailable(fallbackResponse, isJevRequired(config)
      ? 'Jev is required: set JEV_API_KEY and capabilities.jev.enabled=true'
      : 'Jev not configured or disabled');
  }

  try {
    const response = await fetch(decideUrl(config.endpoint || JEV_API_ENDPOINT), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKeyFrom(config)}`
      },
      body: JSON.stringify({
        model: 'jev-latest',
        state,
        questions: { decision: buildQuestion(primitive, question, options) }
      })
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
  return callJev('score', question, { context, criteria }, {
    score: fallbackScore,
    confidence: 0.5,
    reasoning: 'Fallback: Jev not available, using default score'
  });
}

export async function jevNoul(question, context, criteria, fallbackProbYes = 0.8) {
  return callJev('noul', question, { context, criteria }, {
    prob_yes: fallbackProbYes,
    confidence: 0.5,
    reasoning: 'Fallback: Jev not available, using default probability'
  });
}

export async function jevChoice(question, context, options, fallbackChoice = null) {
  const fallback = fallbackChoice || options?.[0] || null;
  return callJev('choice', question, { context, options }, {
    choice: fallback,
    confidence: 0.5,
    reasoning: 'Fallback: Jev not available, using default choice'
  }, options);
}

export async function jevHealthCheck() {
  const config = loadConfig();
  if (!isJevEnabled(config)) {
    return {
      status: isJevRequired(config) ? 'unavailable' : 'disabled',
      message: 'Jev not configured: set JEV_API_KEY and capabilities.jev.enabled=true'
    };
  }
  const result = await jevNoul(
    'Is the Jev System One API reachable and able to answer this health check?',
    { probe: 'health' },
    [],
    0
  );
  if (result._unavailable || result._fallback) {
    return { status: 'unhealthy', message: result._reason };
  }
  return { status: 'healthy', message: 'Jev System One is reachable' };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];
  if (command === 'health') {
    jevHealthCheck().then((result) => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.status === 'healthy' ? 0 : 1);
    });
  } else if (command === 'status') {
    const config = loadConfig();
    console.log(JSON.stringify({
      enabled: isJevEnabled(config),
      required: isJevRequired(config),
      config: redactConfig(config)
    }, null, 2));
  } else {
    console.log('Usage: node jev-client.mjs [health|status]');
    process.exit(1);
  }
}
