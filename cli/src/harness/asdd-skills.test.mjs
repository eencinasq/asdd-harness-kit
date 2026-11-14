/**
 * REQ-001 — slash skills asdd-status/next/implement/converge ship under cli/skills.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const ROOT = join(import.meta.dirname, '../../..');

test('REQ-001 asdd slash skills ship under cli/skills with asdd CLI gates', () => {
  for (const name of ['asdd-status', 'asdd-next', 'asdd-implement', 'asdd-converge']) {
    const skill = join(ROOT, 'cli/skills', name, 'SKILL.md');
    assert.ok(existsSync(skill), skill);
    const body = readFileSync(skill, 'utf8');
    assert.match(body, /asdd /, `${name} must instruct the asdd CLI`);
  }
  const index = readFileSync(join(ROOT, 'cli/steering/skills.md'), 'utf8');
  assert.match(index, /asdd-status/);
  assert.match(index, /asdd-converge/);
});
