/**
 * asdd kit guidance — kit-only sensor for the guidance the kit ships (kit-hygiene slice).
 *
 *   asdd kit guidance [--only stale,cutoffs,budget,asserts] [dir]
 *
 * dir is the kit repo (default) or an installed project (cli/test/install.sh runs it there).
 *   stale    REQ-001/002  shipped guidance names a removed mechanism
 *   cutoffs  REQ-006/007  an agent prompt or a skill compares a score or percentage against a number (skills-bloom REQ-008)
 *   budget   REQ-010      always-loaded steering + AGENTS.md exceeds the kit binding
 *   asserts  TASK-001     a kit test script uses a bare `!` assertion (ignored by `set -e`)
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBinding } from '../harness/drift-lib.mjs';
import { parseSteeringFrontmatter } from '../harness/validators/steering-tags.mjs';

const KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const BUDGET_LABEL = 'Always-loaded steering budget';

const STALE = [
  [/slice lock|holds? the lock|lock file|state\/locks/i, 'lock protocol (removed in v3: concurrency comes from owners and disjoint scope_paths)'],
  [/\.harness\/progress\/|progress record|progress file/i, '.harness/progress/ records (removed; sessions are the record)'],
  [/PROGRESS\.md[^\n]*\brow\b|update[^\n.]{0,40}PROGRESS\.md/i, 'hand-edited PROGRESS.md row (sync-state.mjs generates PROGRESS.md)'],
  [/dependency-graph\.json/i, 'dependency-graph.json (nothing produces it; use knowledge-query.mjs trace)'],
  [/spike-results/i, 'spike-results/ (the knowledge base uses spikes/)'],
  [/heartbeat/i, 'heartbeats (removed in v3)'],
  [/codegraph_(explore|context|trace|node)|codegraph-mcp\.cjs|codegraph\.md|codegraph-agents\.md/, 'the codegraph MCP (codegraph is a skill on the codegraph CLI: codegraph explore …)'],
];

// Paths that never ship, in the kit repo or an installed project.
const SKIP_DIRS = new Set(['node_modules', '.git', '.github', 'tools', 'dist', 'coverage']);
const SKIP_PREFIXES = [
  '.harness/specs/', '.harness/state/', '.harness/features/', '.harness/audits/', '.harness/knowledge/',
  'docs/knowledge-base/steering-proposals/', 'docs/architecture/', '.harness/progress/',
];
const SKIP_FILES = new Set([
  'README.md', '.harness/PROGRESS.md',
  ...['product', 'structure', 'tech', 'domain-layer.project', 'quality-gates.project', 'design-system'].map((b) => `.harness/steering/${b}.md`),
]);

function walk(root, dir = root, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const abs = join(dir, e.name);
    const rel = relative(root, abs);
    if (e.isDirectory()) {
      if (!SKIP_PREFIXES.some((p) => `${rel}/`.startsWith(p))) walk(root, abs, out);
    } else if (/\.(md|mdc)$/.test(e.name) && !SKIP_FILES.has(rel) && !/^docs\/[^/]+-log\.md$/.test(rel)) {
      out.push(rel);
    }
  }
  return out;
}

function scanLines(root, files, rules) {
  const findings = [];
  for (const rel of files.sort()) {
    const lines = readFileSync(join(root, rel), 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const [re, why] of rules) if (re.test(line)) findings.push(`${rel}:${i + 1} ${why}: ${line.trim().slice(0, 120)}`);
    });
  }
  return findings;
}

export function checkStale(root) {
  return scanLines(root, walk(root), STALE).map((f) => `stale ${f}`);
}

const CUTOFFS = [
  [/(?:<=|>=|≤|≥|<|>)\s*\**`?\s*(?:0?\.\d+|1\.0+|\d+(?:\.\d+)?\s*%)/, 'agent-defined cutoff (cite the QG-* rule instead)'],
  [/raised? to \**\s*0?\.\d/i, 'agent-defined dynamic target (cite the QG-* rule instead)'],
  [/reduces? [\w ]{0,24}by 0?\.\d/i, 'agent-defined score arithmetic (cite the QG-* rule instead)'],
];

/** Markdown files under `rel` (recursively), relative to root; none when it is missing. */
function markdownUnder(root, rel) {
  if (!existsSync(join(root, rel))) return [];
  return readdirSync(join(root, rel), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? markdownUnder(root, `${rel}/${e.name}`) : e.name.endsWith('.md') ? [`${rel}/${e.name}`] : [],
  );
}

/**
 * Agent-defined cutoffs in what agents follow: the agent prompts and the skills a project receives (SKILL.md and its
 * references). In the kit, the module skills too (they ship from cli/modules/; .agents/skills has the core ones).
 */
export function checkCutoffs(root) {
  const modules = existsSync(join(root, 'cli/modules'))
    ? readdirSync(join(root, 'cli/modules'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => `cli/modules/${e.name}/skills`)
    : [];
  const files = ['.agents/agents', '.agents/skills', ...modules].flatMap((rel) => markdownUnder(root, rel));
  return scanLines(root, files, CUTOFFS).map((f) => `cutoffs ${f}`);
}

/** Bytes of AGENTS.md plus every `inclusion: always` steering file. */
export function alwaysLoadedBytes(root) {
  let total = existsSync(join(root, 'AGENTS.md')) ? statSync(join(root, 'AGENTS.md')).size : 0;
  const dir = join(root, '.harness/steering');
  if (!existsSync(dir)) return total;
  for (const n of readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    const text = readFileSync(join(dir, n), 'utf8');
    if (parseSteeringFrontmatter(text)?.inclusion === 'always') total += Buffer.byteLength(text);
  }
  return total;
}

export function checkBudget(root, kitRoot = KIT_ROOT) {
  const size = alwaysLoadedBytes(root);
  const budget = Number.parseInt(readBinding(kitRoot, '.harness/steering/quality-gates.project.md', BUDGET_LABEL)[0] ?? '', 10);
  if (!Number.isFinite(budget)) return [`budget unconfigured: set "${BUDGET_LABEL}" in the kit's .harness/steering/quality-gates.project.md (measured ${size} bytes)`];
  return size > budget ? [`budget always-loaded steering is ${size} bytes > budget ${budget} bytes`] : [];
}

export function checkAsserts(root) {
  const dir = join(root, 'cli/test');
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((n) => /\.sh$/.test(n)).map((n) => `cli/test/${n}`);
  // A syntax error stops bash mid-script and can still exit 0, so a broken test passes: parse each script first.
  const syntax = files.flatMap((f) => {
    const res = spawnSync('bash', ['-n', join(root, f)], { encoding: 'utf8' });
    return res.status === 0 ? [] : [`asserts ${f}: bash syntax error: ${(res.stderr || '').trim().split('\n')[0]}`];
  });
  return [
    ...syntax,
    ...scanLines(root, files, [[/^\s*!\s/, 'bare `!` assertion is ignored by `set -e`; use `if …; then exit 1; fi`']]).map((f) => `asserts ${f}`),
  ];
}

const CHECKS = { stale: checkStale, cutoffs: checkCutoffs, budget: checkBudget, asserts: checkAsserts };

/** `asdd kit guidance [--only a,b] [dir]`: exit status 1 on any finding. */
export function run(argv) {
  const onlyIdx = argv.indexOf('--only');
  const only = onlyIdx >= 0 ? argv[onlyIdx + 1].split(',') : Object.keys(CHECKS);
  const dir = resolve(argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--only') ?? '.');
  const findings = only.flatMap((name) => {
    if (!CHECKS[name]) throw new Error(`unknown check "${name}" (stale, cutoffs, budget, asserts)`);
    return CHECKS[name](dir);
  });
  for (const f of findings) console.error(`FAIL  ${f}`);
  if (findings.length) return 1;
  console.log(`PASS  guidance (${only.join(', ')}) — always-loaded ${alwaysLoadedBytes(dir)} bytes`);
  return 0;
}
