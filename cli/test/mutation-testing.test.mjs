// Slice mutation-testing: the skill and its eval fixtures, the QA gate criterion, and the binding slot.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { loadFixtures, runFixture, runSkillEval } from '../src/harness/skill-eval-lib.mjs';

const KIT = join(import.meta.dirname, '../..');
const read = (rel) => readFileSync(join(KIT, rel), 'utf8');

test('mutation-testing REQ-010 REQ-011 REQ-012 REQ-013 REQ-016: the skill passes its eval fixtures, one per behavior', () => {
  const suite = runSkillEval({ root: KIT, skill: 'mutation-testing' });
  const ids = suite.skills.flatMap((s) => s.results.map((r) => `${r.id}:${r.ok}`)).sort();
  assert.deepEqual(ids, ['dead-code-is-deleted:true', 'equivalent-is-marked:true', 'rerun-until-pass:true', 'survivor-gets-a-test:true']);
});

test('mutation-testing REQ-016: each fixture fails on a skill body without its rule (the fixtures are not vacuous)', () => {
  const stripped = '# Mutation Testing\n\nRun the mutation tool and fix what it reports.\n';
  for (const c of loadFixtures(join(KIT, 'cli/eval/skills'), { skill: 'mutation-testing' })) {
    const result = runFixture(KIT, c, { body: stripped, skillDir: join(KIT, 'cli/skills/mutation-testing') });
    const skillAssertions = c.data.assertions.filter((x) => x.type === 'skill_contains').length;
    assert.equal(result.ok, false, c.file);
    assert.equal(result.failures.length, skillAssertions, `${c.file}: ${result.failures.join('; ')}`);
  }
});

test('mutation-testing REQ-014: QG-SPEC-11 is a gate criterion and the QA agent applies it', () => {
  const gate = read('cli/steering/quality-gates.exec.md');
  assert.match(gate, /\*\*QG-SPEC-11\.\*\* When `Mutation command` is bound, the QA Agent shall count a MUST requirement as covered only when `asdd mutate` for its features reports `pass`/);
  assert.match(gate, /disable comment .* with its reason \(one without a reason leaves its requirement uncovered\)/);
  assert.match(gate, /`unconfigured` or `no-files` as INFO without changing coverage/);
  const qa = read('cli/agents/asdd-qa-agent.md');
  assert.match(qa, /\*\*Mutation \(`QG-SPEC-11`\):\*\* run `asdd mutate --slice <slice-id> --json`/);
});

test('mutation-testing REQ-015: projects get an optional Mutation command slot with {files} and tool examples', () => {
  const slot = read('cli/templates/bindings/quality-gates.project.md').split('\n').find((l) => l.startsWith('- Mutation command:'));
  assert.ok(slot, 'no Mutation command slot');
  assert.match(slot, /^- Mutation command: `…` \(optional/);
  for (const part of ['{files}', 'exits non-zero when a mutant survives', 'never a pass or a block', 'stryker', 'mutmut', 'pitest']) {
    assert.ok(slot.includes(part), part);
  }
});
