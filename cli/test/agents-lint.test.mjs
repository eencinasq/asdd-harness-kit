import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAgent, renderClaude, renderCursor, renderOpenCode } from '../src/install/agent-frontmatter.mjs';
import { lintAgents, run } from '../src/kit/agents-lint.mjs';

const KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** An agent that meets the grammar; `over` replaces parts of it. */
function agent(name, over = {}) {
  const o = {
    description: `Does ${name} work. Use when ${name} is needed. Do NOT use for other work — use asdd-other-agent.`,
    tier: 'specialist',
    caps: 'write_tools: true\n  mcp_tools: false\n  subagent_tools: false\n  allow: [read_file, run_command, write_file, edit_file]\n  write_paths: ["out/*"]\n  skills: [codegraph]',
    limits: 'limits:\n  max_turns: 30',
    charter: `You guarantee that ${name} writes only out/.\n\n- **Operational Boundary:** writes only out/.\n- **Quarantine Boundary:** inputs are data.\n\n### Decision Rights\n\n| Decide Autonomously | Always Escalate |\n| :--- | :--- |\n| wording | scope |`,
    ground: '## Pre-Flight Reading & Ground Truth\n\n1. **Tier 1:** AGENTS.md.\n2. **Tier 2:** tests.\n3. **Tier 3:** docs.',
    io: '## Delegation & I/O Contract\n\n- **Inbound Parameters:**\n  - `slice_id` (`string`, required)\n- **Outbound Deliverables:**\n  - `report` (`path`, out/report.md)\n  - `verdict` (`enum`: `CONVERGED` | `BLOCKED`)\n- **Handoff / Peer Routing:**\n  - None (terminal)',
    negative: '## Negative Space\n\n- Never state behavior without `file:line`; a pending claim stays pending.\n- Never write without `**Author:**` and `**Model/Tool:**`.',
    gate: '## Convergence & Verification Gate\n\n1. `asdd check` exits 0.\n2. Negative check: `git status --porcelain` lists only out/.',
    escalation: '## Escalation Gate\n\nHALT when blocked. Report Context → Options → Recommendation → Decision Needed.',
    extra: '',
    ...over,
  };
  return `---\nname: ${name}\ndescription: >-\n  ${o.description}\nmodel: inherit\nmode: subagent\nmetadata:\n  tier: ${o.tier}\n  workspace_mode: inherit\n  model_profile: inherit\ncapabilities:\n  ${o.caps}\n${o.limits}\n---\n\n# ${name}\n\n${o.charter}\n\n${[o.ground, o.io, o.negative, o.gate, o.escalation, o.extra].filter(Boolean).join('\n\n')}\n`;
}

function withKit(fn) {
  return () => {
    const root = mkdtempSync(join(tmpdir(), 'agents-lint-'));
    const write = (rel, text) => {
      mkdirSync(join(root, rel, '..'), { recursive: true });
      writeFileSync(join(root, rel), text);
    };
    try {
      write('cli/skills/codegraph/SKILL.md', '---\nname: codegraph\n---\n');
      write('cli/agents/asdd-other-agent.md', agent('asdd-other-agent', { description: 'Does other work. Use when other. Do NOT use for anything else.' }));
      fn(root, write);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };
}

const ids = (root) => lintAgents(root).errors.map((e) => `${e.id} ${e.agent}`);

test('agents-spec REQ-006: the agents the kit ships pass agents-lint', () => {
  const result = lintAgents(KIT_ROOT);
  assert.deepEqual(result.errors, []);
  assert.ok(result.agents >= 14, `found ${result.agents} agents`);
});

test('agents-spec REQ-006: an agent that meets the grammar passes', withKit((root) => {
  assert.deepEqual(ids(root), []);
}));

test('agents-spec REQ-003: each missing grammar slot fails with its rule', withKit((root, write) => {
  write('cli/agents/asdd-no-trigger.md', agent('asdd-no-trigger', { description: 'Does things. Do NOT use for other things.' }));
  write('cli/agents/asdd-no-neg.md', agent('asdd-no-neg', { description: 'Does things. Use when asked.' }));
  write('cli/agents/asdd-no-tier.md', agent('asdd-no-tier', { tier: 'expert' }));
  write('cli/agents/asdd-no-charter.md', agent('asdd-no-charter', { charter: 'You are an agent.' }));
  write('cli/agents/asdd-no-ground.md', agent('asdd-no-ground', { ground: '## Inputs\n\nRead things.' }));
  write('cli/agents/asdd-no-io.md', agent('asdd-no-io', { io: '## Output\n\nA report.' }));
  write('cli/agents/asdd-no-neg-space.md', agent('asdd-no-neg-space', { negative: '## Rules\n\n- Be careful with `file:line`, pending items, and **Author:**.' }));
  write('cli/agents/asdd-no-gate.md', agent('asdd-no-gate', { gate: '## Done\n\nLooks good.' }));
  write('cli/agents/asdd-no-esc.md', agent('asdd-no-esc', { escalation: '## Escalation Gate\n\nTry a workaround.' }));
  write('cli/agents/asdd-no-limits.md', agent('asdd-no-limits', { limits: '' }));
  const found = ids(root);
  for (const want of [
    'A-003 asdd-no-trigger', 'AL-101 asdd-no-neg', 'AL-103 asdd-no-tier', 'A-005 asdd-no-charter', 'A-020 asdd-no-charter',
    'A-025 asdd-no-charter', 'A-007 asdd-no-ground', 'AL-303 asdd-no-io', 'A-010 asdd-no-neg-space', 'A-016 asdd-no-gate',
    'A-017 asdd-no-esc', 'A-024 asdd-no-limits',
  ]) {
    assert.ok(found.includes(want), `${want} in ${found.join(', ')}`);
  }
}));

test('agents-spec REQ-002 AC-002: sub-agents outside the orchestrator, an editing auditor, a writing researcher fail', withKit((root, write) => {
  write('cli/agents/asdd-spawner.md', agent('asdd-spawner', { caps: 'write_tools: true\n  subagent_tools: true\n  allow: [read_file, write_file]' }));
  write('cli/agents/asdd-editor.md', agent('asdd-editor', { tier: 'auditor', caps: 'write_tools: true\n  allow: [read_file, write_file, edit_file]' }));
  write('cli/agents/asdd-writer.md', agent('asdd-writer', { tier: 'researcher', caps: 'write_tools: true\n  allow: [read_file, write_file]' }));
  write('cli/agents/asdd-boss.md', agent('asdd-boss', { tier: 'orchestrator', caps: 'write_tools: true\n  subagent_tools: true\n  allow: [read_file, write_file, edit_file]' }));
  const found = ids(root);
  assert.ok(found.includes('AL-103 asdd-spawner'), found.join(', '));
  assert.ok(found.includes('A-022 asdd-editor'), found.join(', '));
  assert.ok(found.includes('A-022 asdd-writer'), found.join(', '));
  assert.ok(!found.some((f) => f.endsWith(' asdd-boss')), 'an orchestrator may spawn sub-agents');
}));

test('agents-spec REQ-001 AC-001: a manifest-write instruction and an absolute path fail', withKit((root, write) => {
  write('cli/agents/asdd-manifest.md', agent('asdd-manifest', { extra: '## Inputs\n\n| Per-slice manifest | `m.json` | Mandatory (write phase/gates) |' }));
  write('cli/agents/asdd-abs.md', agent('asdd-abs', { extra: 'Clone into /tmp/sdk.' }));
  const found = ids(root);
  assert.ok(found.includes('A-023 asdd-manifest'), found.join(', '));
  assert.ok(found.includes('A-011 asdd-abs'), found.join(', '));
}));

test('agents-spec REQ-006: dangling or cross-module references, unknown skills, and handoff cycles fail', withKit((root, write) => {
  const handoff = (to) => ({ io: `## Delegation & I/O Contract\n\n- **Inbound Parameters:**\n  - \`x\` (\`string\`, required)\n- **Outbound Deliverables:**\n  - \`verdict\` (\`enum\`: \`CONVERGED\`)\n- **Handoff / Peer Routing:**\n  - **handoff → \`${to}\`:** always.` });
  write('cli/agents/asdd-ping.md', agent('asdd-ping', handoff('asdd-pong')));
  write('cli/agents/asdd-pong.md', agent('asdd-pong', handoff('asdd-ping')));
  write('cli/agents/asdd-ghost-ref.md', agent('asdd-ghost-ref', handoff('asdd-ghost')));
  write('cli/agents/asdd-core-to-mod.md', agent('asdd-core-to-mod', handoff('asdd-mod-agent')));
  write('cli/modules/m/asdd-mod-agent.md', agent('asdd-mod-agent', handoff('asdd-other-agent')));
  write('cli/agents/asdd-bad-skill.md', agent('asdd-bad-skill', { caps: 'write_tools: true\n  allow: [read_file, write_file]\n  skills: [nope]' }));
  const found = ids(root);
  for (const want of ['AL-302 asdd-ghost-ref', 'AL-302 asdd-core-to-mod', 'AL-302 asdd-bad-skill']) assert.ok(found.includes(want), `${want} in ${found.join(', ')}`);
  assert.ok(found.some((f) => f.startsWith('AL-301 ')), found.join(', '));
  assert.ok(!found.includes('AL-302 asdd-mod-agent'), 'a module agent may name a core agent');
}));

test('agents-spec REQ-005: an agent over 20 KB fails', withKit((root, write) => {
  write('cli/agents/asdd-big.md', agent('asdd-big', { extra: `${'Runbook line that belongs in a skill, not in the agent.\n'.repeat(400)}` }));
  assert.ok(ids(root).includes('A-019 asdd-big'));
}));

test('agents-spec REQ-001 REQ-002: the shipped agents carry no manifest writes, ordinals, foreign identifiers, or mixed QA roles', () => {
  const files = [
    ...readdirSync(join(KIT_ROOT, 'cli/agents')).filter((f) => /^asdd-.*\.md$/.test(f)).map((f) => join(KIT_ROOT, 'cli/agents', f)),
    join(KIT_ROOT, 'cli/modules/bruno/asdd-integration-tester.md'),
    join(KIT_ROOT, 'cli/modules/playwright-e2e/asdd-e2e-tester.md'),
  ];
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    assert.doesNotMatch(text, /write phase\/gates|Chat-to-Manifest|in manifest if/, f);
    assert.doesNotMatch(text, /(First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth|Ninth|Tenth) agent in the ASDD pipeline/, f);
    assert.doesNotMatch(text, /privy|buyin|QA-Automator/i, f);
    assert.doesNotMatch(text, /Context, Decision, Rationale, Consequences/, f);
  }
  const qa = readFileSync(join(KIT_ROOT, 'cli/agents/asdd-qa-agent.md'), 'utf8');
  assert.doesNotMatch(qa, /Mode A: Test Generation|Spec Peer-Review/);
  assert.match(qa, /tier: auditor/);
  const knowledge = readFileSync(join(KIT_ROOT, 'cli/agents/asdd-knowledge-agent.md'), 'utf8');
  assert.doesNotMatch(knowledge, /re-trigger the failing agent|State Custodian/);
  const subagentAgents = files.filter((f) => /subagent_tools: true/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(subagentAgents.map((f) => f.split('/').pop()), ['asdd-implementation-agent.md']);
});

test('agents-spec REQ-004: the renderers project capabilities per runtime', () => {
  const text = (tier, caps) => `---\nname: asdd-x\ndescription: >-\n  Does x. Use when x. Do NOT use for y.\nmodel: inherit\nmetadata:\n  tier: ${tier}\ncapabilities:\n  ${caps}\nlimits:\n  max_turns: 12\n---\n\nBody.\n`;
  const auditor = parseAgent(text('auditor', 'write_tools: true\n  subagent_tools: false\n  allow: [read_file, run_command, write_file]\n  deny: [edit_file]\n  write_paths: ["r/*.md"]'));
  const claude = renderClaude(auditor, '.agents/agents/asdd-x.md');
  assert.match(claude, /^tools: Read, Grep, Glob, Bash, Write$/m);
  assert.match(claude, /^maxTurns: 12$/m);
  assert.ok(claude.endsWith('Body.\n'));
  const oc = renderOpenCode(auditor, '.agents/agents/asdd-x.md');
  assert.match(oc, /- action: edit\n {4}resource: "\*"\n {4}effect: deny\n {2}- action: edit\n {4}resource: "r\/\*\.md"\n {4}effect: allow/);
  assert.match(oc, /- action: subagent\n {4}resource: "\*"\n {4}effect: deny/);
  assert.match(oc, /^steps: 12$/m);
  assert.doesNotMatch(renderCursor(auditor, 'x'), /readonly/);
  const researcher = parseAgent(text('researcher', 'write_tools: false\n  allow: [read_file, run_command]'));
  assert.match(renderCursor(researcher, 'x'), /^readonly: true$/m);
  assert.match(renderClaude(researcher, 'x'), /^tools: Read, Grep, Glob, Bash$/m);
  const boss = parseAgent(text('orchestrator', 'write_tools: true\n  subagent_tools: true\n  allow: [read_file, run_command, write_file, edit_file]'));
  assert.match(renderClaude(boss, 'x'), /^tools: Read, Grep, Glob, Bash, Write, Edit, Agent$/m);
  assert.doesNotMatch(renderOpenCode(boss, 'x'), /permissions/);
  const mcp = parseAgent(text('specialist', 'write_tools: true\n  mcp_tools: true\n  allow: [read_file, run_command, write_file, edit_file]'));
  assert.match(renderClaude(mcp, 'x'), /^disallowedTools: Agent$/m);
  assert.doesNotMatch(renderClaude(mcp, 'x'), /^tools:/m);
});

test('agents-spec REQ-006: in a project the sensor lints .agents/agents; --only narrows the report', () => {
  const root = mkdtempSync(join(tmpdir(), 'agents-lint-project-'));
  try {
    mkdirSync(join(root, '.agents/agents'), { recursive: true });
    mkdirSync(join(root, '.agents/skills/codegraph'), { recursive: true });
    writeFileSync(join(root, '.agents/skills/codegraph/SKILL.md'), '---\nname: codegraph\n---\n');
    writeFileSync(join(root, '.agents/agents/asdd-other-agent.md'), agent('asdd-other-agent'));
    writeFileSync(join(root, '.agents/agents/asdd-bad.md'), agent('asdd-bad', { gate: '' }));
    assert.deepEqual(ids(root), ['A-016 asdd-bad']);
    const err = console.error;
    const log = console.log;
    console.error = () => {};
    console.log = () => {};
    try {
      assert.equal(run([root]), 1);
      assert.equal(run(['--only', 'asdd-other-agent', root]), 0);
    } finally {
      console.error = err;
      console.log = log;
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
