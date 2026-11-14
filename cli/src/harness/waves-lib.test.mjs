/** REQ-001 — wave parallelism planner */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planWaves } from './waves-lib.mjs';

test('REQ-001 ready vs blocked by depends_on', () => {
  const plan = planWaves([
    { id: 'A', status: 'passing', priority: 1, verification: ['x'], depends_on: [], owner: 'a', scope_paths: ['a'] },
    { id: 'B', status: 'not_started', priority: 2, verification: ['x'], depends_on: ['A'], owner: 'b', scope_paths: ['b'] },
    { id: 'C', status: 'not_started', priority: 3, verification: ['x'], depends_on: ['Z'], owner: 'c', scope_paths: ['c'] },
  ]);
  assert.ok(plan.ready.some((r) => r.id === 'B'));
  assert.ok(plan.blocked.some((b) => b.id === 'C' && b.unmet_deps.includes('Z')));
});

test('REQ-001 parallel when owners distinct and scopes disjoint', () => {
  const plan = planWaves([
    { id: 'A', status: 'not_started', priority: 1, verification: ['x'], depends_on: [], owner: 'alice', scope_paths: ['src/a'] },
    { id: 'B', status: 'not_started', priority: 2, verification: ['x'], depends_on: [], owner: 'bob', scope_paths: ['src/b'] },
  ]);
  assert.equal(plan.parallel_groups.length, 1);
  assert.deepEqual(plan.parallel_groups[0].sort(), ['A', 'B']);
});

test('REQ-001 overlapping scopes force serial', () => {
  const plan = planWaves([
    { id: 'A', status: 'not_started', priority: 1, verification: ['x'], depends_on: [], owner: 'alice', scope_paths: ['src'] },
    { id: 'B', status: 'not_started', priority: 2, verification: ['x'], depends_on: [], owner: 'bob', scope_paths: ['src/b'] },
  ]);
  assert.equal(plan.parallel_groups.length, 0);
  assert.ok(plan.serial.includes('A') || plan.serial.includes('B'));
});

test('REQ-001 wave layers follow topology', () => {
  const plan = planWaves([
    { id: 'A', status: 'not_started', priority: 1, verification: ['x'], depends_on: [] },
    { id: 'B', status: 'not_started', priority: 2, verification: ['x'], depends_on: ['A'] },
    { id: 'C', status: 'not_started', priority: 3, verification: ['x'], depends_on: ['B'] },
  ]);
  assert.deepEqual(plan.waves[0], ['A']);
  assert.deepEqual(plan.waves[1], ['B']);
  assert.deepEqual(plan.waves[2], ['C']);
});
