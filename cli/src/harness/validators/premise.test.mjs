import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import validatePremise from './premise.mjs';
import validateManifest from './manifest.mjs';

// attack-the-premise TASK-002: PREMISE-01 sensor (REQ-002, REQ-003, REQ-004) and the session fields it reads (REQ-005).

const SLICE = 'demo';
let seq = 0;
const at = () => new Date(Date.UTC(2026, 10, 1, 0, seq++)).toISOString();

function session(event_type, extra = {}) {
  return { schema_version: '1.0', timestamp: at(), agent: 'claude', slice_id: SLICE, event_type, phase: 'implementation', ...extra };
}
const start = () => session('phase_started', { phase: 'discovery', mode: 'lite' });
const fail = (signature = 'tests:flaky-clock', feature_id = 'TASK-001') => session('checkpoint', { feature_id, failure_signature: signature, evidence: 'verification failed' });
const premise = (feature_id = 'TASK-001') => session('checkpoint', { feature_id, premise: 'Every fix assumes the clock is mocked before import.', removes: 'module-level Date.now() call' });
const closed = () => session('phase_completed', { phase: 'knowledge' });

function repo(sessions) {
  const root = mkdtempSync(join(tmpdir(), 'premise-'));
  const dir = join(root, '.harness/state/slices', SLICE, 'sessions');
  mkdirSync(dir, { recursive: true });
  sessions.forEach((s, i) => writeFileSync(join(dir, `${String(i + 1).padStart(3, '0')}.json`), JSON.stringify(s)));
  return root;
}

function run(sessions) {
  const warns = [];
  const fails = [];
  validatePremise({ root: repo(sessions), warn: (m) => warns.push(m), fail: (m) => fails.push(m) });
  return { warns, fails };
}

test('REQ-002: two same-signature failures on one feature without a premise checkpoint WARN (never FAIL)', () => {
  const { warns, fails } = run([start(), fail(), fail()]);
  assert.equal(fails.length, 0);
  assert.equal(warns.length, 1);
  assert.match(warns[0], /^PREMISE-01 slice "demo": feature TASK-001 failed 2× on tests:flaky-clock/);
});

test('REQ-002: a third attempt without a premise between the second and third failure still WARNs', () => {
  const { warns } = run([start(), fail(), fail(), premise('TASK-009'), fail()]);
  assert.equal(warns.length, 1);
  assert.match(warns[0], /failed 3×/);
});

test('REQ-003: a premise checkpoint for the feature after the second failure silences the sensor', () => {
  assert.deepEqual(run([start(), fail(), fail(), premise()]).warns, []);
  assert.deepEqual(run([start(), fail(), fail(), premise(), fail()]).warns, []);
});

test('REQ-003: a premise written before the second failure does not count', () => {
  assert.equal(run([start(), fail(), premise(), fail()]).warns.length, 1);
});

test('REQ-004: closed slices are historical evidence and stay silent', () => {
  assert.deepEqual(run([start(), fail(), fail(), closed()]).warns, []);
});

test('REQ-004: different signatures or different features stay silent', () => {
  assert.deepEqual(run([start(), fail('tests:a'), fail('tests:b')]).warns, []);
  assert.deepEqual(run([start(), fail('tests:a', 'TASK-001'), fail('tests:a', 'TASK-002')]).warns, []);
});

test('REQ-005: session schema accepts failure_signature/premise/removes as non-empty strings and rejects empty ones', () => {
  const check = (extra) => {
    const fails = [];
    const root = repo([start(), session('checkpoint', { feature_id: 'TASK-001', ...extra })]);
    const readJson = (rel) => (existsSync(join(root, rel)) ? JSON.parse(readFileSync(join(root, rel), 'utf8')) : null);
    const dirExists = (rel) => existsSync(join(root, rel));
    validateManifest({ root, fail: (m) => fails.push(m), warn: () => {}, readJson, dirExists, registry: { schema_version: '3.0', slices: [{ slice_id: SLICE }] } });
    return fails.filter((m) => /failure_signature|premise|removes/.test(m));
  };
  assert.deepEqual(check({ failure_signature: 'tests:x', premise: 'One premise.', removes: 'the mock' }), []);
  assert.equal(check({ premise: '  ' }).length, 1);
  assert.equal(check({ failure_signature: 3 }).length, 1);
});

test('REQ-001: the implementation agent, the lite agent, and session-loop steering carry the attack-the-premise rule', () => {
  const kit = join(import.meta.dirname, '../../..');
  for (const rel of ['agents/asdd-implementation-agent.md', 'agents/asdd-lite-agent.md']) {
    const text = readFileSync(join(kit, rel), 'utf8');
    assert.match(text, /[Aa]ttack the premise/, rel);
    assert.match(text, /`failure_signature`/, rel);
    assert.match(text, /`checkpoint`[^.]*`premise`[^.]*`removes`/, rel);
  }
  // Always-loaded steering keeps a byte budget: one clause, the agents hold the procedure.
  assert.match(readFileSync(join(kit, 'steering/session-loop.md'), 'utf8'), /2nd same-signature verify fail → `premise` checkpoint; 3rd → `blocked`/);
});
