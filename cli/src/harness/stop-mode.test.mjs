/** REQ-002 — advisory vs fail_closed Stop mode */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { resolveStopMode, isAdvisoryStop } from './stop-mode.mjs';

test('REQ-002 default is fail_closed', () => {
  const root = mkdtempSync(join(tmpdir(), 'asdd-stop-'));
  try {
    assert.equal(resolveStopMode(root, { env: {}, config: null }), 'fail_closed');
    assert.equal(isAdvisoryStop(root, { env: {}, config: null }), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('REQ-002 HARNESS_STOP_MODE=advisory wins', () => {
  assert.equal(resolveStopMode('/tmp', { env: { HARNESS_STOP_MODE: 'advisory' }, config: { stop: { mode: 'fail_closed' } } }), 'advisory');
});

test('REQ-002 project.json stop.mode=advisory', () => {
  const root = mkdtempSync(join(tmpdir(), 'asdd-stop-'));
  try {
    mkdirSync(join(root, '.harness/config'), { recursive: true });
    writeFileSync(
      join(root, '.harness/config/project.json'),
      JSON.stringify({ stop: { mode: 'advisory' } }),
    );
    assert.equal(resolveStopMode(root, { env: {} }), 'advisory');
    assert.equal(isAdvisoryStop(root, { env: {} }), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
