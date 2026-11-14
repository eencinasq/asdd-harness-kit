import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lintBundle, bundleDirs } from './check-skill-profile.mjs';

function withDir(fn) {
  return () => {
    const root = mkdtempSync(join(tmpdir(), 'skillprof-'));
    try {
      fn(root, (rel, text, mode) => {
        mkdirSync(join(root, rel, '..'), { recursive: true });
        writeFileSync(join(root, rel), text, mode ? { mode } : undefined);
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };
}

const VALID = `---
name: doc-builder
description: >-
  Builds bundles from a spec. Use when testing the linter. Do NOT use for
  agent profiles or AGENTS.md.
---
# Good Skill

Overview text with the operational boundary: writes only \`.agents/skills/<name>/\`.

### Step 1 [C1·Remember×Factual] — Extract
Action: read the spec. Target: capability_spec. IA: spec is read.

## Verification
node .harness/scripts/check-skills-index.mjs exits 0.

## Escalation Gate
Context: what failed. Options: listed. Recommendation: pick one. Decision Needed: human chooses.

## Handoff & Convergence
None (terminal).
`;

const rules = (findings) => findings.map((f) => f.rule);

test('a conforming bundle produces zero findings', withDir((root, write) => {
  write('.agents/skills/doc-builder/SKILL.md', VALID);
  assert.deepEqual(lintBundle(join(root, '.agents/skills/doc-builder')), []);
}));

test('S-002: non-kebab name, banned affix, and name≠folder are each flagged', withDir((root, write) => {
  write('.agents/skills/badname/SKILL.md', VALID.replace('name: doc-builder', 'name: BadName'));
  assert.ok(rules(lintBundle(join(root, '.agents/skills/badname'))).includes('S-002'));

  write('.agents/skills/skill-thing/SKILL.md', VALID.replace('name: doc-builder', 'name: skill-thing'));
  assert.ok(rules(lintBundle(join(root, '.agents/skills/skill-thing'))).includes('S-002'));
}));

test('S-003/S-014/S-004/S-013: description trigger grammar', withDir((root, write) => {
  const noUse = VALID.replace('Use when testing the linter.', '');
  write('.agents/skills/doc-builder/SKILL.md', noUse);
  assert.ok(rules(lintBundle(join(root, '.agents/skills/doc-builder'))).includes('S-003'));

  const noNot = VALID.replace('Do NOT use for\n  agent profiles or AGENTS.md.', '');
  write('.agents/skills/doc-builder/SKILL.md', noNot);
  assert.ok(rules(lintBundle(join(root, '.agents/skills/doc-builder'))).includes('S-014'));

  const long = VALID.replace('Builds bundles from a spec.', 'x'.repeat(1030));
  write('.agents/skills/doc-builder/SKILL.md', long);
  assert.ok(rules(lintBundle(join(root, '.agents/skills/doc-builder'))).includes('S-004'));
}));

test('P-VER: a version field is rejected', withDir((root, write) => {
  write('.agents/skills/doc-builder/SKILL.md', VALID.replace('description:', 'version: 1\ndescription:'));
  assert.ok(rules(lintBundle(join(root, '.agents/skills/doc-builder'))).includes('P-VER'));
}));

test('S-017: every protocol step needs a [Cn×Type] Bloom tag', withDir((root, write) => {
  write('.agents/skills/doc-builder/SKILL.md', VALID.replace('Step 1 [C1·Remember×Factual] — Extract', 'Step 1 — Extract'));
  const found = lintBundle(join(root, '.agents/skills/doc-builder'));
  assert.ok(rules(found).includes('S-017'));
  assert.match(found.find((f) => f.rule === 'S-017').msg, /Step 1/);
}));

test('S-016/S-009/S-021: required sections and their forms', withDir((root, write) => {
  const noVer = VALID.replace(/## Verification[\s\S]*?## Escalation Gate/, '## Escalation Gate');
  write('.agents/skills/doc-builder/SKILL.md', noVer);
  assert.ok(rules(lintBundle(join(root, '.agents/skills/doc-builder'))).includes('S-016'));

  const noEsc = VALID.replace(/## Escalation Gate[\s\S]*?## Handoff/, '## Handoff');
  write('.agents/skills/doc-builder/SKILL.md', noEsc);
  assert.ok(rules(lintBundle(join(root, '.agents/skills/doc-builder'))).includes('S-009'));

  const badEsc = VALID.replace('Context: what failed. Options: listed. Recommendation: pick one. Decision Needed: human chooses.', 'Something went wrong.');
  write('.agents/skills/doc-builder/SKILL.md', badEsc);
  assert.ok(rules(lintBundle(join(root, '.agents/skills/doc-builder'))).includes('S-009'));

  const noHand = VALID.replace(/## Handoff & Convergence[\s\S]*$/, '');
  write('.agents/skills/doc-builder/SKILL.md', noHand);
  assert.ok(rules(lintBundle(join(root, '.agents/skills/doc-builder'))).includes('S-021'));

  const badHand = VALID.replace('None (terminal).', 'Whatever comes next.');
  write('.agents/skills/doc-builder/SKILL.md', badHand);
  assert.ok(rules(lintBundle(join(root, '.agents/skills/doc-builder'))).includes('S-021'));
}));

test('S-020: the overview must state an operational boundary', withDir((root, write) => {
  write('.agents/skills/doc-builder/SKILL.md', VALID.replace('Overview text with the operational boundary: writes only', 'Overview text:'));
  assert.ok(rules(lintBundle(join(root, '.agents/skills/doc-builder'))).includes('S-020'));
}));

test('S-011: absolute links and file:// are flagged', withDir((root, write) => {
  write('.agents/skills/doc-builder/SKILL.md', VALID + 'See [x](/abs/path.md).\n');
  assert.ok(rules(lintBundle(join(root, '.agents/skills/doc-builder'))).includes('S-011'));
}));

test('S-008: packaged SKILL.md caps at 500 lines / 15KB', withDir((root, write) => {
  mkdirSync(join(root, '.agents/skills/doc-builder/references'), { recursive: true });
  write('.agents/skills/doc-builder/references/r.md', 'ref');
  const padded = VALID + Array(502).fill('line').join('\n');
  write('.agents/skills/doc-builder/SKILL.md', padded);
  assert.ok(rules(lintBundle(join(root, '.agents/skills/doc-builder'))).includes('S-008'));
}));

test('S-018/S-019: script shebang+exec and template placeholders', withDir((root, write) => {
  write('.agents/skills/doc-builder/scripts/helper.sh', 'echo hi');
  write('.agents/skills/doc-builder/SKILL.md', VALID);
  let found = lintBundle(join(root, '.agents/skills/doc-builder'));
  assert.ok(rules(found).includes('S-018'));

  write('.agents/skills/doc-builder/scripts/helper.sh', '#!/bin/sh\necho hi');
  chmodSync(join(root, '.agents/skills/doc-builder/scripts/helper.sh'), 0o755);
  write('.agents/skills/doc-builder/resources/t.md', 'No fields here.');
  found = lintBundle(join(root, '.agents/skills/doc-builder'));
  assert.ok(rules(found).includes('S-019'));

  write('.agents/skills/doc-builder/resources/t.md', 'Field `<name>`: the skill name.');
  assert.deepEqual(lintBundle(join(root, '.agents/skills/doc-builder')), []);
}));

test('S-022: an unknown tier value is flagged; leaf/orchestrator pass', withDir((root, write) => {
  const bad = VALID.replace('description: >-', 'metadata:\n  tier: gold\ndescription: >-');
  write('.agents/skills/doc-builder/SKILL.md', bad);
  assert.ok(rules(lintBundle(join(root, '.agents/skills/doc-builder'))).includes('S-022'));

  const good = VALID.replace('description: >-', 'metadata:\n  tier: leaf\ndescription: >-');
  write('.agents/skills/doc-builder/SKILL.md', good);
  assert.ok(!rules(lintBundle(join(root, '.agents/skills/doc-builder'))).includes('S-022'));
}));

test('bundleDirs enumerates baseline and module skill trees', withDir((root, write) => {
  write('.agents/skills/one/SKILL.md', VALID.replace('name: doc-builder', 'name: one'));
  write('.agents/modules/http-api/skills/two/SKILL.md', VALID.replace('name: doc-builder', 'name: two'));
  const dirs = bundleDirs(root);
  assert.equal(dirs.length, 2);
  assert.ok(dirs.some((d) => d.endsWith('.agents/skills/one')));
  assert.ok(dirs.some((d) => d.endsWith('.agents/modules/http-api/skills/two')));
}));
