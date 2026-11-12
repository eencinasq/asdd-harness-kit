import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lint, run } from '../src/kit/skills-lint.mjs';

const KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** A skill that meets the grammar; `over` replaces parts of it. */
function skill(name, over = {}) {
  const o = {
    description: `Does ${name} things. Use when ${name} is asked for. Do NOT use for other things.`,
    tier: 'tier: leaf',
    overview: `Runs ${name}.\n\n**Operational boundary:** writes only out/${name}.md.`,
    io: `## Input / Output Contract\n\n- **Inputs:** \`req\` (\`string\`, the request, required)\n- **Outputs:** \`report\` (\`markdown\`, written to out/${name}.md)`,
    protocol: `## Execution Protocol\n\n### Step 1: Write ${name}\n\n- **Action:** write the ${name} report.\n- **Target:** out/${name}.md.\n- **Assertion:** \`test -s out/${name}.md\` exits 0 for ${name}.`,
    gate: `## Verification Gate\n\n1. \`test -s out/${name}.md\` exits 0.\n2. Negative check: \`git status --porcelain\` lists only out/${name}.md.`,
    escalation: `## Escalation Gate\n\nHALT when ${name} has no input. Escalate as Context → Options → Recommendation → Decision Needed.`,
    handoff: '## Handoff & Convergence\n\nNone (terminal)',
    ...over,
  };
  return `---\nname: ${name}\ndescription: >-\n  ${o.description}\nmetadata:\n  ${o.tier}\n---\n\n# ${name}\n\n${o.overview}\n\n${[o.io, o.protocol, o.gate, o.escalation, o.handoff].filter(Boolean).join('\n\n')}\n`;
}

function withKit(fn) {
  return () => {
    const root = mkdtempSync(join(tmpdir(), 'skills-lint-'));
    const write = (rel, text) => {
      mkdirSync(join(root, rel, '..'), { recursive: true });
      writeFileSync(join(root, rel), text);
    };
    try {
      mkdirSync(join(root, 'cli/skills'), { recursive: true });
      fn(root, write);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };
}

const ids = (root) => lint(root).errors.map((e) => `${e.id} ${e.skill}`);

test('skills-spec REQ-006: the skills and always-loaded rules the kit ships pass skills-lint', () => {
  const result = lint(KIT_ROOT);
  assert.deepEqual(result.errors, []);
  assert.ok(result.skills >= 15, `found ${result.skills} skills`);
  assert.ok(result.rules >= 2, `found ${result.rules} rule files`);
});

test('skills-spec REQ-006: a skill that meets the grammar passes', withKit((root, write) => {
  write('cli/skills/alpha/SKILL.md', skill('alpha'));
  assert.deepEqual(ids(root), []);
}));

test('skills-spec REQ-001: no verification gate, no escalation gate, no trigger, or an absolute path fails', withKit((root, write) => {
  write('cli/skills/no-gate/SKILL.md', skill('no-gate', { gate: '' }));
  write('cli/skills/no-halt/SKILL.md', skill('no-halt', { escalation: '## Escalation Gate\n\nTry your best workaround.' }));
  write('cli/skills/no-trigger/SKILL.md', skill('no-trigger', { description: 'Does things. Do NOT use for other things.' }));
  write('cli/skills/abs-path/SKILL.md', skill('abs-path', { overview: 'Clone into /tmp/sdk first.\n\n**Operational boundary:** out/.' }));
  const found = ids(root);
  for (const want of ['S-006 no-gate', 'S-009 no-halt', 'S-003 no-trigger', 'S-011 abs-path']) assert.ok(found.includes(want), `${want} in ${found}`);
}));

test('skills-spec REQ-002: no negative boundary, no tier, or a reference outside the fleet fails', withKit((root, write) => {
  write('cli/skills/no-neg/SKILL.md', skill('no-neg', { description: 'Does things. Use when asked.' }));
  write('cli/skills/no-tier/SKILL.md', skill('no-tier', { tier: 'owner: me' }));
  write('cli/skills/core-a/SKILL.md', skill('core-a', { description: 'Does a. Use when a. Do NOT use for b — use mod-b.' }));
  write('cli/skills/dangling/SKILL.md', skill('dangling', { handoff: '## Handoff & Convergence\n\n- **handoff → `ghost`:** always.' }));
  write('cli/modules/m/skills/mod-b/SKILL.md', skill('mod-b', { description: 'Does b. Use when b. Do NOT use for a — use core-a.' }));
  const found = ids(root);
  for (const want of ['SL-101 no-neg', 'SL-103 no-tier', 'SL-302 core-a', 'SL-302 dangling']) assert.ok(found.includes(want), `${want} in ${found}`);
  assert.ok(!found.includes('SL-302 mod-b'), 'a module skill may name a core skill');
}));

test('skills-spec REQ-004: a step without an assertion, an untyped contract, no handoff, or no boundary fails', withKit((root, write) => {
  write('cli/skills/no-assert/SKILL.md', skill('no-assert', { protocol: '## Execution Protocol\n\n### Step 1: Go\n\n- **Action:** go.\n- **Target:** there.' }));
  write('cli/skills/untyped/SKILL.md', skill('untyped', { io: '## Input / Output Contract\n\n- **Inputs:** a request\n- **Outputs:** the results' }));
  write('cli/skills/no-handoff/SKILL.md', skill('no-handoff', { handoff: '' }));
  write('cli/skills/no-boundary/SKILL.md', skill('no-boundary', { overview: 'Runs things.' }));
  write('cli/skills/no-negative/SKILL.md', skill('no-negative', { gate: '## Verification Gate\n\n1. `npm test` exits 0.' }));
  const found = ids(root);
  for (const want of ['S-017 no-assert', 'SL-303 untyped', 'SL-302 no-handoff', 'S-020 no-boundary', 'S-016 no-negative']) {
    assert.ok(found.includes(want), `${want} in ${found}`);
  }
}));

test('skills-spec REQ-005: a packaged SKILL.md over 15 KB fails; the same size inline passes', withKit((root, write) => {
  const filler = `\n${'Detail line for the size cap, long enough to reach the byte cap in few lines.\n'.repeat(200)}`;
  write('cli/skills/big-packaged/SKILL.md', skill('big-packaged', { overview: `Big.${filler}\n**Operational boundary:** out/.` }));
  write('cli/skills/big-packaged/references/more.md', '# More\n');
  write('cli/skills/big-inline/SKILL.md', skill('big-inline', { overview: `Big.${filler}\n**Operational boundary:** out/.` }));
  const found = ids(root);
  assert.ok(found.includes('S-008 big-packaged'), found.join(', '));
  assert.ok(!found.includes('S-008 big-inline'), 'inline cap is 20 KB');
}));

test('skills-spec REQ-006: duplicated 5-line blocks and handoff cycles fail', withKit((root, write) => {
  const shared = '## Notes\n\nline one\nline two\nline three\nline four\nline five';
  write('cli/skills/dup-a/SKILL.md', skill('dup-a', { handoff: `${shared}\n\n## Handoff & Convergence\n\nNone (terminal)` }));
  write('cli/skills/dup-b/SKILL.md', skill('dup-b', { handoff: `${shared}\n\n## Handoff & Convergence\n\nNone (terminal)` }));
  write('cli/skills/ping/SKILL.md', skill('ping', { handoff: '## Handoff & Convergence\n\n- **handoff → `pong`:** after ping.' }));
  write('cli/skills/pong/SKILL.md', skill('pong', { handoff: '## Handoff & Convergence\n\n- **handoff → `ping`:** after pong.' }));
  const found = ids(root);
  assert.ok(found.includes('SL-105 dup-a & dup-b'), found.join(', '));
  assert.ok(found.some((f) => f.startsWith('SL-301 ')), found.join(', '));
}));

test('skills-spec REQ-006: a redirect back to a producer is not a cycle', withKit((root, write) => {
  write('cli/skills/maker/SKILL.md', skill('maker', { handoff: '## Handoff & Convergence\n\n- **handoff → `user`:** passes report.' }));
  write('cli/skills/user/SKILL.md', skill('user', { handoff: '## Handoff & Convergence\n\n- **redirect → `maker`:** when report is missing.' }));
  assert.deepEqual(ids(root), []);
}));

test('skills-spec REQ-006: R-005 frontmatter in AGENTS.md and R-004 an always-loaded rule over 24 KB fail', withKit((root, write) => {
  write('cli/AGENTS.md', '---\ntitle: x\n---\n# Agents\n');
  write('cli/steering/huge.md', `---\ninclusion: always\n---\n# Huge\n${'x'.repeat(24100)}\n`);
  write('cli/steering/auto.md', `---\ninclusion: auto\n---\n# Auto\n${'x'.repeat(24100)}\n`);
  const found = ids(root);
  assert.ok(found.includes('R-005 cli/AGENTS.md'), found.join(', '));
  assert.ok(found.includes('R-004 cli/steering/huge.md'), found.join(', '));
  assert.ok(!found.includes('R-004 cli/steering/auto.md'), 'only always-loaded rules count');
}));

test('skills-spec REQ-006: in a project the sensor lints .agents/skills; --only narrows the report', () => {
  const root = mkdtempSync(join(tmpdir(), 'skills-lint-project-'));
  try {
    mkdirSync(join(root, '.agents/skills/good'), { recursive: true });
    mkdirSync(join(root, '.agents/skills/bad'), { recursive: true });
    writeFileSync(join(root, '.agents/skills/good/SKILL.md'), skill('good'));
    writeFileSync(join(root, '.agents/skills/bad/SKILL.md'), skill('bad', { gate: '' }));
    assert.deepEqual(ids(root), ['S-006 bad']);
    const err = console.error;
    const log = console.log;
    console.error = () => {};
    console.log = () => {};
    try {
      assert.equal(run([root]), 1);
      assert.equal(run(['--only', 'good', root]), 0);
    } finally {
      console.error = err;
      console.log = log;
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const read = (rel) => readFileSync(join(KIT_ROOT, rel), 'utf8');

test('skills-spec REQ-002 AC-002: the shipped routes and owners', () => {
  const tdd = read('cli/skills/test-driven-development/SKILL.md');
  const tddDescription = tdd.split('\n---')[0];
  assert.match(tddDescription, /Do NOT use for live-browser checks, UI craft/);
  assert.match(read('cli/modules/web-ui/skills/browser-testing-with-devtools/SKILL.md').split('\n---')[0], /use test-driven-development/);
  const delivery = read('cli/skills/product-delivery/SKILL.md');
  assert.match(delivery, /contracts\/scope-map\.schema\.yaml/);
  assert.doesNotMatch(delivery, /shape-up\/references/);
  assert.match(read('cli/skills/shape-up/SKILL.md'), /`scope_map`\s+only when the pitch leaves this repository/);
  const trackers = read('cli/skills/external-trackers/SKILL.md');
  assert.match(trackers, /only one that\s+reads from or writes to a tracker/);
  assert.match(trackers, /never writes\s+`intent\.md`/);
  assert.match(read('cli/agents/asdd-design-agent.md'), /format of the `documentation-and-adrs` skill/);
});

test('skills-spec REQ-003 AC-003: markers, escalation, and prohibitions live in the always-loaded steering', () => {
  const skills = read('cli/steering/skills.md');
  for (const marker of ['PENDING_DEFINITION', 'ASSUMPTION — CONFIRMATION REQUIRED', 'PROPOSED — VALIDATION REQUIRED', 'DERIVED']) {
    assert.ok(skills.includes(`\`${marker}\``), `skills.md defines ${marker}`);
  }
  assert.match(skills, /HALT[\s\S]*Context → Options → Recommendation → Decision Needed/);
  for (const file of ['README', 'controls', 'security-rules']) {
    assert.match(read(`cli/steering/${file}.md`), /## Prohibitions[\s\S]*HALT/, `${file}.md`);
  }
  assert.match(read('cli/skills/codegraph/SKILL.md'), /rule to call it first is in\s+`AGENTS\.md`/);
});
