/**
 * asdd kit skills-lint — sensor for the skill grammar (skill.spec S-*), the fleet rules (skill.linter SL-*), and the
 * size and shape of the always-loaded rules (rule.spec R-004/R-005). Slice skills-spec, REQ-006.
 *
 *   asdd kit skills-lint [--warn] [--only a,b] [dir]
 *
 * dir is the kit repo (default: the current directory) or an installed project.
 *   kit      core skills cli/skills/* (fleet: core) and module skills cli/modules/<m>/skills/* (fleet: core + <m>);
 *            rules cli/AGENTS.md and cli/steering/*.md with `inclusion: always`
 *   project  .agents/skills/* (one fleet); rules AGENTS.md and .harness/steering/*.md with `inclusion: always`
 *
 * Every rule this sensor can decide is an error (skill.spec §6 severity policy: decidable → error), with the fleet
 * promotions S-014 → SL-101, S-015 → SL-303, S-021 → SL-302, S-022 → SL-103. Judgment rules (S-004 first person is a
 * heuristic) print as warnings; --warn makes them fail too. Exit 1 on any error.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parseSteeringFrontmatter } from '../harness/validators/steering-tags.mjs';

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ABSOLUTE_PATH_RE = /(?:^|[\s`'"(=])(\/(?:Users|home|tmp|var|private|root)\/[^\s`'")]*)/gm;
const RULE_CAP = 24000;

/** { name, description, tier } from the YAML frontmatter (the subset skills use: scalars, `>-` blocks, metadata.tier). */
export function parseFrontmatter(text) {
  if (!text.startsWith('---\n')) return null;
  const end = text.indexOf('\n---', 4);
  if (end < 0) return null;
  const lines = text.slice(4, end).split('\n');
  const out = { name: '', description: '', tier: '' };
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(/^(name|description):\s*(.*)$/);
    if (m) {
      let value = m[2].trim();
      if (['>-', '>', '|-', '|'].includes(value)) {
        const parts = [];
        while (i + 1 < lines.length && (lines[i + 1].startsWith('  ') || lines[i + 1].trim() === '')) {
          i += 1;
          if (lines[i].trim()) parts.push(lines[i].trim());
        }
        value = parts.join(' ');
      }
      out[m[1]] = value.replace(/^(['"])(.*)\1$/, '$2');
      continue;
    }
    if (/^metadata:\s*$/.test(lines[i])) {
      while (i + 1 < lines.length && lines[i + 1].startsWith('  ')) {
        i += 1;
        const t = lines[i].match(/^\s+tier:\s*(\S+)/);
        if (t) out.tier = t[1];
      }
    }
  }
  return { ...out, bodyStart: end + 4 };
}

/** The text of the `## <heading>` section (up to the next `## `), or null. */
export function section(body, heading) {
  const re = new RegExp(`^## +(?:${heading})\\s*$`, 'm');
  const m = re.exec(body);
  if (!m) return null;
  const rest = body.slice(m.index + m[0].length);
  const next = rest.search(/^## /m);
  return next < 0 ? rest : rest.slice(0, next);
}

/** Skill names a skill routes to: handoff/redirect lines and the `— use <name>` clauses of its description. */
export function references(skill) {
  const refs = new Map();
  const add = (name, kind) => refs.set(`${kind}:${name}`, { name, kind });
  for (const m of skill.description.matchAll(/\buse\s+`?([a-z0-9]+(?:-[a-z0-9]+)+)`?/g)) add(m[1], 'description');
  for (const m of (skill.handoff ?? '').matchAll(/\*\*(handoff|redirect)\s*→\s*`([^`]+)`/g)) add(m[2], m[1]);
  return [...refs.values()];
}

function listDirs(dir) {
  return existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort() : [];
}

function filesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? filesUnder(join(dir, e.name)) : [join(dir, e.name)]));
}

/** The skills under root, each with the fleet it is linted in. */
export function discover(root) {
  const kit = existsSync(join(root, 'cli/skills'));
  const load = (dir, fleet) => {
    const file = join(dir, 'SKILL.md');
    const text = readFileSync(file, 'utf8');
    const fm = parseFrontmatter(text) ?? { name: '', description: '', tier: '', bodyStart: 0 };
    const body = text.slice(fm.bodyStart);
    return {
      dir, file: relative(root, file), folder: dir.split('/').pop(), fleet, text, body, ...fm,
      frontmatter: Boolean(parseFrontmatter(text)), handoff: section(body, 'Handoff & Convergence'),
      packaged: readdirSync(dir).some((e) => e !== 'SKILL.md'),
    };
  };
  if (!kit) {
    const base = join(root, '.agents/skills');
    return listDirs(base).filter((n) => existsSync(join(base, n, 'SKILL.md'))).map((n) => load(join(base, n), 'project'));
  }
  const core = listDirs(join(root, 'cli/skills')).filter((n) => existsSync(join(root, 'cli/skills', n, 'SKILL.md')))
    .map((n) => load(join(root, 'cli/skills', n), 'core'));
  const modules = listDirs(join(root, 'cli/modules')).flatMap((m) => {
    const base = join(root, 'cli/modules', m, 'skills');
    return listDirs(base).filter((n) => existsSync(join(base, n, 'SKILL.md'))).map((n) => load(join(base, n), m));
  });
  return [...core, ...modules];
}

/** Per-skill rules (skill.spec S-*), with the fleet promotions. */
export function lintSkill(s) {
  const errors = [];
  const warnings = [];
  const e = (id, msg) => errors.push({ id, skill: s.folder, msg });
  if (!s.frontmatter || !s.name || !s.description) e('S-001', 'frontmatter needs name and description');
  if (!NAME_RE.test(s.name) || s.name !== s.folder || s.name.length > 64 || /(^skill-|-skill$)/.test(s.name)) {
    e('S-002', `name "${s.name}" must be kebab-case, at most 64 characters, without skill affixes, and equal the folder`);
  }
  if (!/\bUse when\b/i.test(s.description)) e('S-003', 'description has no "Use when …" trigger');
  if (/\b(I|I'm|I'll|my|we|our)\b/.test(s.description)) warnings.push({ id: 'S-004', skill: s.folder, msg: 'description reads first-person' });
  for (const m of s.body.matchAll(/\]\((\.{1,2}\/[^)#\s]+)/g)) {
    if (!existsSync(resolve(s.dir, m[1]))) e('S-005', `broken relative link ${m[1]}`);
  }
  const gate = section(s.body, 'Verification Gate|Stopping Criteria');
  if (!gate || !/`[^`]+`/.test(gate)) e('S-006', 'no "## Verification Gate" with a command to run');
  const bytes = Buffer.byteLength(s.text);
  const lines = s.text.split('\n').length;
  const cap = s.packaged ? 15000 : 20000;
  if (bytes > cap || lines > 500) e('S-008', `SKILL.md is ${bytes} bytes / ${lines} lines (${s.packaged ? 'packaged' : 'inline'} cap ${cap} bytes, 500 lines): move detail to references/`);
  const escalation = section(s.body, 'Escalation Gate') ?? (/^### +Blocker Triage/m.test(s.body) ? s.body : null);
  if (!escalation || !/\bHALT\b/.test(escalation) || !/Decision Needed/.test(escalation)) {
    e('S-009', 'no "## Escalation Gate" that HALTs and escalates as Context → Options → Recommendation → Decision Needed');
  }
  for (const m of s.text.matchAll(ABSOLUTE_PATH_RE)) e('S-011', `absolute path ${m[1].slice(0, 60)}`);
  if (s.description.length > 1024) e('S-013', `description is ${s.description.length} characters (max 1024)`);
  if (!/\bDo NOT use\b/.test(s.description)) e('SL-101', 'description has no negative boundary ("Do NOT use …") (S-014)');
  const io = section(s.body, 'Input / Output Contract');
  const typed = (label) => io && new RegExp(`\\*\\*${label}:\\*\\*[\\s\\S]*?\`[\\w.-]+\` \\(\``).test(io);
  if (!typed('Inputs') || !typed('Outputs')) e('SL-303', 'no "## Input / Output Contract" with typed **Inputs:** and **Outputs:** (`name` (`type`, …)) (S-015)');
  if (gate && !/Negative check/i.test(gate)) e('S-016', 'Verification Gate has no "Negative check" (nothing changed outside the boundary)');
  const protocol = section(s.body, 'Execution Protocol');
  if (!protocol) e('S-017', 'no "## Execution Protocol"');
  else {
    const steps = protocol.split(/^### +/m).slice(1);
    if (!steps.length) e('S-017', 'Execution Protocol has no "### Step N:" steps');
    for (const step of steps) {
      const title = step.split('\n')[0].trim();
      const missing = ['Action', 'Target', 'Assertion'].filter((k) => !new RegExp(`\\*\\*${k}:\\*\\*`).test(step));
      if (missing.length) e('S-017', `step "${title}" lacks ${missing.join(', ')}`);
    }
  }
  const scripts = join(s.dir, 'scripts');
  if (existsSync(scripts)) {
    for (const f of filesUnder(scripts)) {
      const head = readFileSync(f, 'utf8').split('\n')[0];
      if (!head.startsWith('#!') || !(statSync(f).mode & 0o111)) e('S-018', `${relative(s.dir, f)} needs a shebang and the executable bit`);
    }
  }
  const overview = s.body.slice(0, Math.max(0, s.body.search(/^## /m)));
  if (!/\*\*Operational boundary:\*\*/.test(overview)) e('S-020', 'overview states no "**Operational boundary:**"');
  if (!s.handoff || !(/None \(terminal\)/.test(s.handoff) || /\*\*(handoff|redirect)\s*→\s*`[^`]+`/.test(s.handoff))) {
    e('SL-302', 'no "## Handoff & Convergence" with handoff/redirect edges or "None (terminal)" (S-021)');
  }
  if (!['leaf', 'orchestrator'].includes(s.tier)) e('SL-103', 'metadata.tier must be leaf or orchestrator (S-022)');
  return { errors, warnings };
}

/** Fleet rules (skill.linter SL-103, SL-105, SL-301, SL-302). */
export function lintFleet(skills) {
  const errors = [];
  const byName = new Map(skills.map((s) => [s.name, s]));
  // A core skill sees the core fleet; a module skill sees core plus its own module; a project sees what it installed.
  const visible = (from, to) => to && (to.fleet === from.fleet || to.fleet === 'core');
  for (const s of skills) {
    for (const r of references(s)) {
      if (r.name === s.name) continue;
      if (!visible(s, byName.get(r.name))) {
        const where = byName.has(r.name) ? `ships in module ${byName.get(r.name).fleet}, not in the ${s.fleet} fleet` : 'does not exist';
        errors.push({ id: 'SL-302', skill: s.folder, msg: `${r.kind} names "${r.name}", which ${where}` });
      }
    }
    if (s.tier === 'orchestrator') {
      const deps = section(s.body, 'Dependencies') ?? '';
      const leaves = [...deps.matchAll(/`([a-z0-9-]+)`/g)].map((m) => byName.get(m[1])).filter((d) => d?.tier === 'leaf');
      if (leaves.length < 2) errors.push({ id: 'SL-103', skill: s.folder, msg: 'an orchestrator needs "## Dependencies" naming 2 or more leaf skills' });
    } else if (section(s.body, 'Dependencies')) {
      errors.push({ id: 'SL-103', skill: s.folder, msg: 'a leaf declares "## Dependencies" (only orchestrators sequence skills)' });
    }
  }
  // SL-105: identical blocks of 5 or more non-empty lines in two or more skills (fences and table rulers ignored).
  const seen = new Map();
  for (const s of skills) {
    const lines = s.body.split('\n').map((l) => l.trim()).filter((l) => l && !/^```|^\|[\s|:-]+\|$/.test(l));
    for (let i = 0; i + 5 <= lines.length; i += 1) {
      const key = lines.slice(i, i + 5).join('\n');
      if (!seen.has(key)) seen.set(key, new Set());
      seen.get(key).add(s.folder);
    }
  }
  const dupPairs = new Set();
  for (const [key, owners] of seen) {
    if (owners.size < 2) continue;
    const pair = [...owners].sort().join(' & ');
    if (dupPairs.has(pair)) continue;
    dupPairs.add(pair);
    errors.push({ id: 'SL-105', skill: pair, msg: `identical 5-line block: "${key.split('\n')[0].slice(0, 80)}"` });
  }
  // SL-301: cycles over handoff edges (redirects point backwards by design and are not DAG edges).
  const edges = new Map(skills.map((s) => [s.name, references(s).filter((r) => r.kind === 'handoff' && byName.has(r.name)).map((r) => r.name)]));
  const state = new Map();
  const visit = (n, path) => {
    if (state.get(n) === 'done') return;
    if (state.get(n) === 'open') {
      errors.push({ id: 'SL-301', skill: n, msg: `handoff cycle: ${[...path.slice(path.indexOf(n)), n].join(' → ')}` });
      return;
    }
    state.set(n, 'open');
    for (const m of edges.get(n) ?? []) visit(m, [...path, n]);
    state.set(n, 'done');
  };
  for (const n of edges.keys()) visit(n, []);
  return errors;
}

/** Rule files (rule.spec R-004 size cap, R-005 no frontmatter in the directory-root AGENTS.md). */
export function lintRules(root) {
  const kit = existsSync(join(root, 'cli/steering'));
  const agents = join(root, kit ? 'cli/AGENTS.md' : 'AGENTS.md');
  const steering = join(root, kit ? 'cli/steering' : '.harness/steering');
  const errors = [];
  const files = [];
  if (existsSync(agents)) {
    files.push(agents);
    if (readFileSync(agents, 'utf8').startsWith('---\n')) errors.push({ id: 'R-005', skill: relative(root, agents), msg: 'the directory-root AGENTS.md carries YAML frontmatter' });
  }
  if (existsSync(steering)) {
    for (const n of readdirSync(steering).filter((x) => x.endsWith('.md')).sort()) {
      if (parseSteeringFrontmatter(readFileSync(join(steering, n), 'utf8'))?.inclusion === 'always') files.push(join(steering, n));
    }
  }
  for (const f of files) {
    const size = statSync(f).size;
    if (size > RULE_CAP) errors.push({ id: 'R-004', skill: relative(root, f), msg: `${size} bytes > ${RULE_CAP}` });
  }
  return { errors, files: files.length };
}

export function lint(root) {
  const skills = discover(root);
  const per = skills.map(lintSkill);
  const rules = lintRules(root);
  return {
    skills: skills.length,
    rules: rules.files,
    errors: [...per.flatMap((r) => r.errors), ...lintFleet(skills), ...rules.errors],
    warnings: per.flatMap((r) => r.warnings),
  };
}

/** `asdd kit skills-lint [--warn] [--only a,b] [dir]`: exit status 1 on any error (or warning with --warn). */
export function run(argv) {
  const strict = argv.includes('--warn');
  const onlyIdx = argv.indexOf('--only');
  const only = onlyIdx >= 0 ? new Set(argv[onlyIdx + 1].split(',')) : null;
  const dir = resolve(argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--only') ?? '.');
  const result = lint(dir);
  // --only keeps the findings that name one of the listed skills (fleet findings are computed over the whole fleet).
  const keep = (f) => !only || f.skill.split(' & ').some((n) => only.has(n));
  const errors = result.errors.filter(keep);
  const warnings = result.warnings.filter(keep);
  for (const f of errors) console.error(`FAIL  ${f.id} ${f.skill}: ${f.msg}`);
  for (const f of warnings) console.error(`WARN  ${f.id} ${f.skill}: ${f.msg}`);
  if (errors.length || (strict && warnings.length)) return 1;
  const scope = only ? `${only.size} of ${result.skills} skills` : `${result.skills} skills, ${result.rules} rule files`;
  console.log(`PASS  skills-lint — ${scope}${warnings.length ? `, ${warnings.length} warnings` : ''}`);
  return 0;
}
