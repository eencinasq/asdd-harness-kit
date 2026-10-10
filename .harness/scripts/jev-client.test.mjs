import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { jevNoul, jevScore, jevChoice, jevHealthCheck } from './jev-client.mjs';

if (!process.env.JEV_API_KEY) process.env.JEV_API_KEY = 'test-key';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

test('jevNoul POSTs System One with a noul question and maps noul to prob_yes', async (t) => {
  const fetchMock = mock.method(globalThis, 'fetch', async (url, opts) => {
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
    assert.equal(opts.method, 'POST');
    const body = JSON.parse(opts.body);
    assert.equal(body.questions.decision.type, 'noul');
    assert.equal(body.questions.decision.instructions, 'Is the boundary clear?');
    assert.equal(body.state.context.pitch, 'demo');
    return jsonResponse({
      model: 'jev-1.13.0',
      answers: { decision: { type: 'noul', noul: 0.91, confidence: 0.8 } }
    });
  });
  t.after(() => fetchMock.mock.restore());

  const result = await jevNoul('Is the boundary clear?', { pitch: 'demo' }, ['interfaces are clear'], 0.1);
  assert.equal(result._fallback, false);
  assert.equal(result.prob_yes, 0.91);
  assert.equal(result.confidence, 0.8);
});

test('jevScore POSTs System One and maps 0-based score onto a 1-5 scale', async (t) => {
  const fetchMock = mock.method(globalThis, 'fetch', async (url, opts) => {
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
    const body = JSON.parse(opts.body);
    assert.equal(body.questions.decision.type, 'score');
    assert.ok(Array.isArray(body.questions.decision.criteria));
    assert.equal(body.questions.decision.criteria.length, 5);
    return jsonResponse({
      answers: {
        decision: {
          type: 'score',
          score: 3.13,
          confidence: 0.27,
          legend: { 0: 'far too large', 3: 'fits' }
        }
      }
    });
  });
  t.after(() => fetchMock.mock.restore());

  const result = await jevScore('Does this pitch fit?', { appetite: '1 day' }, ['fits within timebox'], 1);
  assert.equal(result._fallback, false);
  assert.ok(result.score >= 4 && result.score < 4.2);
});

test('jevChoice POSTs System One with a criteria map and returns the choice', async (t) => {
  const fetchMock = mock.method(globalThis, 'fetch', async (_url, opts) => {
    const body = JSON.parse(opts.body);
    assert.equal(body.questions.decision.type, 'choice');
    assert.deepEqual(Object.keys(body.questions.decision.criteria).sort(), ['backlog', 'mvp', 'v1', 'v2']);
    return jsonResponse({
      answers: { decision: { type: 'choice', choice: 'mvp', confidence: 0.37 } }
    });
  });
  t.after(() => fetchMock.mock.restore());

  const result = await jevChoice(
    'Which slice?',
    { story: 'login' },
    ['mvp', 'v1', 'v2', 'backlog'],
    'backlog'
  );
  assert.equal(result._fallback, false);
  assert.equal(result.choice, 'mvp');
});

test('API failure is unavailable when Jev is required', async (t) => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => jsonResponse({ detail: 'nope' }, 500));
  t.after(() => fetchMock.mock.restore());

  const result = await jevNoul('safe?', { command: 'git status' }, ['not destructive'], 0.8);
  assert.equal(result._unavailable, true);
  assert.equal(result.prob_yes, 0);
  assert.match(result._reason, /500/);
});

test('health check uses System One instead of GET /health', async (t) => {
  const fetchMock = mock.method(globalThis, 'fetch', async (url, opts) => {
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
    assert.equal(opts.method, 'POST');
    return jsonResponse({
      answers: { decision: { type: 'noul', noul: 0.99 } }
    });
  });
  t.after(() => fetchMock.mock.restore());

  const health = await jevHealthCheck();
  assert.equal(health.status, 'healthy');
});
