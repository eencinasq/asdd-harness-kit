/**
 * asdd kit agents-lint — sensor for the agent grammar (agent.spec A-*) and the fleet rules (AL-*). Slice agents-spec,
 * REQ-006.
 *
 *   asdd kit agents-lint [--only a,b] [dir]
 *
 * dir is the kit repo (default: the current directory) or an installed project.
 *   kit      core agents cli/agents/asdd-*.md (fleet: core) and module agents cli/modules/<m>/asdd-*.md (fleet: core + <m>);
 *            mounted skills resolve against cli/skills and the agent's own module skills
 *   project  .agents/agents/asdd-*.md and .agents/skills (one fleet)
 *
 * Every rule decided here is an error, with the fleet promotions A-014 → AL-101, A-015 → AL-303, A-021 → AL-103.
 * Exit 1 on any error.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { envelope, parseAgent } from '../install/agent-frontmatter.mjs';
import { section } from './skills-lint.mjs';

const TIERS = ['executor', 'researcher', 'specialist', 'auditor', 'orchestrator'];
const VACUOUS = new Set(['agent', 'helper', 'assistant', 'default']);
const ABSOLUTE_PATH_RE = /(?:^|[\s`'"(=])(\/(?:Users|home|tmp|var|private|root)\/[^\s`'")]*)/gm;
const MANIFEST_WRITE_RE = /\(write phase\/gates\)|into manifest updates|\bin manifest if\b|update (the )?manifest\b/i;

const dirs = (dir) => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort() : []);
const agentFilesIn = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => /^asdd-.*\.md$/.test(f)).sort().map((f) => join(dir, f)) : []);
const skillsIn = (dir) => dirs(dir).filter((n) => existsSync(join(dir, n, 'SKILL.md')));

/** The agents under root, each with its fleet and the skills it may mount. */
export function discoverAgents(root) {
  const load = (file, fleet, skills) => {
    const text = readFileSync(file, 'utf8');
    const parsed = parseAgent(text);
    return { file, rel: relative(root, file), stem: file.split('/').pop().replace(/\.md$/, ''), fleet, skills, text, parsed };
  };
  if (!existsSync(join(root, 'cli/agents'))) {
    const skills = new Set(skillsIn(join(root, '.agents/skills')));
    return agentFilesIn(join(root, '.agents/agents')).map((f) => load(f, 'project', skills));
  }
  const core = new Set(skillsIn(join(root, 'cli/skills')));
  const agents = agentFilesIn(join(root, 'cli/agents')).map((f) => load(f, 'core', core));
  for (const m of dirs(join(root, 'cli/modules'))) {
    const skills = new Set([...core, ...skillsIn(join(root, 'cli/modules', m, 'skills'))]);
    agents.push(...agentFilesIn(join(root, 'cli/modules', m)).map((f) => load(f, m, skills)));
  }
  return agents;
}

/** Per-agent rules (agent.spec A-*), with the fleet promotions. */
export function lintAgent(a) {
  const errors = [];
  const e = (id, msg) => errors.push({ id, agent: a.stem, msg });
  if (!a.parsed || !a.parsed.data.name || !a.parsed.data.description) {
    e('A-001', 'frontmatter needs name and description');
    return errors;
  }
  const { data, body } = a.parsed;
  const desc = String(data.description);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(data.name) || data.name !== a.stem || data.name.length > 64 || VACUOUS.has(data.name)) {
    e('A-002', `name "${data.name}" must be kebab-case, at most 64 characters, not vacuous, and equal the file stem`);
  }
  if (!/\b(Use|Invoke) when\b/.test(desc)) e('A-003', 'description has no "Use when …" trigger');
  if (desc.length > 1024) e('A-013', `description is ${desc.length} characters (max 1024)`);
  if (!/\bDo NOT use\b/.test(desc)) e('AL-101', 'description has no negative boundary ("Do NOT use …") (A-014)');
  const tier = data.metadata?.tier;
  if (!TIERS.includes(tier)) e('AL-103', `metadata.tier must be one of ${TIERS.join(', ')} (A-021)`);
  if (!data.capabilities) e('A-024', 'no capabilities block (write_tools, mcp_tools, subagent_tools, allow)');
  if (!Number.isInteger(data.limits?.max_turns)) e('A-024', 'limits.max_turns missing');
  if (!/\bYou guarantee\b/.test(body)) e('A-005', 'role charter has no guarantees sentence ("You guarantee …")');
  if (!/^### +Decision Rights/m.test(body)) e('A-005', 'role charter has no "### Decision Rights"');
  if (!/\*\*Operational Boundary:\*\*/.test(body)) e('A-020', 'role charter states no "**Operational Boundary:**"');
  if (!/\*\*Quarantine Boundary:\*\*/.test(body)) e('A-025', 'role charter states no "**Quarantine Boundary:**"');
  const ground = section(body, 'Pre-Flight Reading & Ground Truth');
  if (!ground || !/Tier 1/.test(ground) || !/Tier 2/.test(ground) || !/Tier 3/.test(ground)) {
    e('A-007', 'no "## Pre-Flight Reading & Ground Truth" with Tier 1, 2, and 3');
  }
  const io = section(body, 'Delegation & I/O Contract');
  const typed = (label) => io && new RegExp(`\\*\\*${label}:\\*\\*[\\s\\S]*?\`[\\w.-]+\` \\(\``).test(io);
  if (!typed('Inbound Parameters') || !typed('Outbound Deliverables') || !/`verdict`/.test(io ?? '')) {
    e('AL-303', 'no "## Delegation & I/O Contract" with typed inbound parameters, outbound deliverables, and a verdict (A-015)');
  }
  if (!/^#+ +Negative Space/m.test(body)) e('A-010', 'no "Negative Space" section');
  if (!/`file:line`/.test(body)) e('A-009', 'no execution-point verification rule (`file:line`)');
  if (!/pending/i.test(section(body, 'Negative Space') ?? '')) e('A-018', 'Negative Space has no anti-hedging rule (a pending claim stays pending)');
  if (/\bgit (log|blame)\b/.test(body) && !/Historical \(/.test(body)) e('A-008', 'cites git history as evidence of current state');
  const gate = section(body, 'Convergence & Verification Gate');
  if (!gate || !/`[^`]+`/.test(gate) || !/Negative check/i.test(gate)) {
    e('A-016', 'no "## Convergence & Verification Gate" with a command and a "Negative check"');
  }
  const esc = section(body, 'Escalation Gate');
  if (!esc || !/\bHALT\b/.test(esc) || !/Decision Needed/.test(esc)) e('A-017', 'no "## Escalation Gate" that HALTs with Context → Options → Recommendation → Decision Needed');
  for (const m of a.text.matchAll(ABSOLUTE_PATH_RE)) e('A-011', `absolute path ${m[1].slice(0, 60)}`);
  const bytes = statSync(a.file).size;
  const lines = a.text.split('\n').length;
  if (bytes > 20000 || lines > 500) e('A-019', `${bytes} bytes / ${lines} lines (inline cap 20000 bytes, 500 lines): move the runbook into a skill`);
  if (MANIFEST_WRITE_RE.test(a.text)) e('A-023', 'instructs writing the generated manifest (AGENTS.md: manifests are generated by asdd sync)');
  if (data.capabilities) {
    const env = envelope(data);
    if (env.subagents && tier !== 'orchestrator') e('AL-103', 'subagent_tools: true outside the orchestrator tier (A-024)');
    if (tier === 'orchestrator' && !env.subagents) e('AL-103', 'an orchestrator without subagent_tools');
    if (tier === 'researcher' && env.write) e('A-022', 'a researcher with write_tools: true');
    if (tier === 'auditor' && env.allow.has('edit_file')) e('A-022', 'an auditor allowed to edit_file (it may only write its report)');
    if (tier !== 'researcher' && !/\*\*Author:\*\*/.test(body)) e('A-022', 'no `**Author:**` / `**Model/Tool:**` provenance rule');
    for (const s of data.capabilities.skills ?? []) {
      if (!a.skills.has(s)) e('AL-302', `capabilities.skills names "${s}", which is not a skill of the ${a.fleet} fleet`);
    }
  }
  return errors;
}

/** Names an agent routes to: handoff/redirect edges and `— use <name>` in the description. */
export function agentRefs(a) {
  if (!a.parsed) return [];
  const refs = [];
  for (const m of String(a.parsed.data.description ?? '').matchAll(/\buse\s+(?:the\s+)?`?([a-z0-9]+(?:-[a-z0-9]+)+)`?/g)) refs.push({ name: m[1], kind: 'description' });
  const io = section(a.parsed.body, 'Delegation & I/O Contract') ?? '';
  for (const m of io.matchAll(/\*\*(handoff|redirect)\s*→\s*`([^`]+)`/g)) refs.push({ name: m[2], kind: m[1] });
  return refs;
}

/** Fleet rules: dangling or cross-module references (AL-302) and handoff cycles (AL-301). */
export function lintAgentFleet(agents) {
  const errors = [];
  const byName = new Map(agents.map((a) => [a.stem, a]));
  const visible = (from, to) => to && (to.fleet === from.fleet || to.fleet === 'core');
  for (const a of agents) {
    for (const r of agentRefs(a)) {
      if (r.name === a.stem) continue;
      const agent = byName.get(r.name);
      if (agent ? visible(a, agent) : a.skills.has(r.name)) continue;
      const why = agent ? `ships in module ${agent.fleet}, not in the ${a.fleet} fleet` : 'is neither an agent nor a skill of its fleet';
      errors.push({ id: 'AL-302', agent: a.stem, msg: `${r.kind} names "${r.name}", which ${why}` });
    }
  }
  const edges = new Map(agents.map((a) => [a.stem, agentRefs(a).filter((r) => r.kind === 'handoff' && byName.has(r.name)).map((r) => r.name)]));
  const state = new Map();
  const visit = (n, path) => {
    if (state.get(n) === 'done') return;
    if (state.get(n) === 'open') {
      errors.push({ id: 'AL-301', agent: n, msg: `handoff cycle: ${[...path.slice(path.indexOf(n)), n].join(' → ')}` });
      return;
    }
    state.set(n, 'open');
    for (const m of edges.get(n) ?? []) visit(m, [...path, n]);
    state.set(n, 'done');
  };
  for (const n of edges.keys()) visit(n, []);
  return errors;
}

export function lintAgents(root) {
  const agents = discoverAgents(root);
  return { agents: agents.length, errors: [...agents.flatMap(lintAgent), ...lintAgentFleet(agents)] };
}

/** `asdd kit agents-lint [--only a,b] [dir]`: exit status 1 on any error. */
export function run(argv) {
  const onlyIdx = argv.indexOf('--only');
  const only = onlyIdx >= 0 ? new Set(argv[onlyIdx + 1].split(',')) : null;
  const dir = resolve(argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--only') ?? '.');
  const result = lintAgents(dir);
  const errors = result.errors.filter((f) => !only || only.has(f.agent));
  for (const f of errors) console.error(`FAIL  ${f.id} ${f.agent}: ${f.msg}`);
  if (errors.length) return 1;
  console.log(`PASS  agents-lint — ${only ? `${only.size} of ${result.agents}` : result.agents} agents`);
  return 0;
}
