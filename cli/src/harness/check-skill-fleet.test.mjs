import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const { lintFleet } = await import('./check-skill-fleet.mjs');

const FM = (name, extra = '') => `---\nname: ${name}\ndescription: Handles the ${name} domain concerns end to end. Use when work involves ${name}. Do NOT use for unrelated domains.${extra}\n---\n\n# ${name}\n\nBoundary: writes only its own ${name} outputs.\n\n### Step 1: Run ${name} [C1×Remember]\n\nRun the ${name} routine.\n\n## Verification\n\n${name} verified.\n\n## Escalation Gate\n\nHalt with context, options, recommendation, decision needed when ${name} input is absent.\n\n## Handoff & Convergence\n\n`;

function withDir(fn) {
  return () => {
    const root = mkdtempSync(join(tmpdir(), 'fleet-'));
    try {
      const write = (rel, content) => {
        const p = join(root, rel);
        mkdirSync(join(p, '..'), { recursive: true });
        writeFileSync(p, content);
      };
      fn(root, write);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };
}

function writeSkill(root, name, handoff, extra = '') {
  const dir = join(root, '.agents/skills', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), FM(name, extra) + handoff + '\n');
}

test('clean fleet: forward edge + terminal pass', withDir((root) => {
  writeSkill(root, 'alpha', 'None (terminal).');
  writeSkill(root, 'beta', '`skill: alpha` — forward.');
  const r = lintFleet(root);
  assert.equal(r.bundles, 2);
  assert.equal(r.errors.length, 0);
}));

test('SL-301: forward cycle is an error', withDir((root) => {
  writeSkill(root, 'alpha', '`skill: beta`.');
  writeSkill(root, 'beta', '`skill: alpha`.');
  const r = lintFleet(root);
  assert.ok(r.errors.some((e) => e.rule === 'SL-301'));
}));

test('SL-301: legal redirect does not cycle', withDir((root) => {
  writeSkill(root, 'alpha', '`skill: beta`.');
  writeSkill(root, 'beta', '`redirect → alpha`.');
  const r = lintFleet(root);
  assert.equal(r.errors.filter((e) => e.rule === 'SL-301').length, 0);
  assert.equal(r.errors.filter((e) => e.rule === 'SL-307').length, 0);
}));

test('SL-307: redirect without reverse forward edge is illegal', withDir((root) => {
  writeSkill(root, 'alpha', 'None (terminal).');
  writeSkill(root, 'beta', '`redirect → alpha`.');
  const r = lintFleet(root);
  assert.ok(r.errors.some((e) => e.rule === 'SL-307'));
}));

test('SL-302: dangling skill reference fails', withDir((root) => {
  writeSkill(root, 'alpha', '`skill: ghost-skill`.');
  writeSkill(root, 'beta', 'None (terminal).');
  const r = lintFleet(root);
  assert.ok(r.errors.some((e) => e.rule === 'SL-302' && e.msg.includes('ghost-skill')));
}));

test('SL-302: `redirect → none` is a legal no-op, not a dangling ref', withDir((root) => {
  writeSkill(root, 'alpha', '`redirect → none` and `skill: beta`.');
  writeSkill(root, 'beta', 'None (terminal).');
  const r = lintFleet(root);
  assert.equal(r.errors.filter((e) => e.rule === 'SL-302').length, 0);
}));

test('SL-101: missing negative boundary fails in fleet mode', withDir((root) => {
  const dir = join(root, '.agents/skills/alpha');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), '---\nname: alpha\ndescription: Does X. Use when Y.\n---\n\n# a\n\nBoundary: writes.\n\n## Handoff & Convergence\n\nNone (terminal).\n');
  writeSkill(root, 'beta', 'None (terminal).');
  const r = lintFleet(root);
  assert.ok(r.errors.some((e) => e.rule === 'SL-101'));
}));

test('SL-105: duplicated >=5-line block across bundles fails', withDir((root) => {
  const block = 'line one same\nline two same\nline three same\nline four same\nline five same';
  writeSkill(root, 'alpha', 'None (terminal).\n\n' + block);
  writeSkill(root, 'beta', 'None (terminal).\n\n' + block);
  const r = lintFleet(root);
  assert.ok(r.errors.some((e) => e.rule === 'SL-105'));
}));
