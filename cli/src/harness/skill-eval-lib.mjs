/**
 * Deterministic skill evaluation (ASDD-ROADMAP P5.2, gap G16).
 *
 * Fixtures live under cli/eval/skills/<skill>/<case>.json. Each fixture declares an input
 * task, the expected observable outcome, optional `setup` files for a temp workspace, shell
 * `probes`, and deterministic assertions (exit codes, stdout, files, skill-body content).
 * No LLM-as-judge: assertions are files, commands, and exit codes only.
 *
 * `--baseline <ref>` re-scores every fixture against the skill body at that git ref
 * (`git show <ref>:<path>`, never a checkout) and reports improved / regressed / unchanged.
 *
 * Portable (skill-eval-portable): probes use `{asdd}` (the CLI running this evaluation) and `{skill_dir}`
 * (the evaluated skill's folder); the fixtures ship in the npm package; a project adds or overrides cases
 * under `.harness/eval/skills/<skill>/`; a case whose `requires` is unmet is `skipped`, never failed.
 */
import { existsSync, readdirSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
// Two levels under cli/ from both cli/src/harness and cli/dist/harness, and inside the installed package.
export const DEFAULT_FIXTURES_DIR = join(HERE, '../../eval/skills');
export const PROJECT_FIXTURES_REL = '.harness/eval/skills';
const ASDD_BIN = join(HERE, '../../bin/asdd.mjs');

/** POSIX single-quote a value for a shell command line. */
const shQuote = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`;

/** `{asdd}`: the asdd CLI running this evaluation (same version), as `node <package>/cli/bin/asdd.mjs`. */
export function resolveAsdd() {
  return `${shQuote(process.execPath)} ${shQuote(ASDD_BIN)}`;
}

/** Substitute `{asdd}` and `{skill_dir}` in a probe command (the values are shell-quoted). */
export function expandProbe(run, { asdd = resolveAsdd(), skillDir } = {}) {
  let out = String(run ?? '').split('{asdd}').join(asdd);
  if (skillDir !== undefined) out = out.split('{skill_dir}').join(shQuote(skillDir));
  return out;
}

const onPath = (name) => {
  if (!/^[\w.-]+$/.test(name)) return false;
  for (const dir of String(process.env.PATH ?? '').split(':').filter(Boolean)) {
    try {
      if (statSync(join(dir, name)).isFile()) return true;
    } catch {
      // not in this dir
    }
  }
  return false;
};

/** Unmet `requires` entries (`command:<name>` on PATH, `path:<repo-relative>`), as human-readable reasons. */
export function unmetRequirements(requires, root) {
  const unmet = [];
  for (const req of Array.isArray(requires) ? requires : []) {
    const [kind, ...rest] = String(req).split(':');
    const value = rest.join(':');
    if (kind === 'command') {
      if (!onPath(value)) unmet.push(`command "${value}" not on PATH`);
    } else if (kind === 'path') {
      const target = resolve(root, value);
      if (!(target === root || target.startsWith(root + sep)) || !existsSync(target)) unmet.push(`path "${value}" not found`);
    } else {
      unmet.push(`unknown requirement "${req}"`);
    }
  }
  return unmet;
}

const PROBE_TIMEOUT_MS = 30_000;
const SKILL_CANDIDATES = (name) => [`cli/skills/${name}/SKILL.md`, `.agents/skills/${name}/SKILL.md`];

function listDirs(dir) {
  return existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort() : [];
}

/** Skill dirs under fixturesDir that contain at least one *.json case. */
export function discoverSkills(fixturesDir = DEFAULT_FIXTURES_DIR) {
  return listDirs(fixturesDir)
    .map((name) => ({ name, dir: join(fixturesDir, name), cases: loadFixtures(fixturesDir, { skill: name }) }))
    .filter((s) => s.cases.length > 0);
}

/**
 * All fixture cases under fixturesDir (optionally one skill), sorted by skill then file name.
 * Unparseable JSON becomes a synthetic failed case instead of throwing.
 */
export function loadFixtures(fixturesDir = DEFAULT_FIXTURES_DIR, { skill, projectFixturesDir, source = 'kit' } = {}) {
  const byKey = new Map();
  const read = (dirRoot, from) => {
    for (const name of skill ? [skill] : listDirs(dirRoot)) {
      const dir = join(dirRoot, name);
      if (!existsSync(dir)) continue;
      for (const file of readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
        const path = join(dir, file);
        let data;
        try {
          data = JSON.parse(readFileSync(path, 'utf8'));
        } catch (err) {
          data = { __parse_error: String(err?.message || err) };
        }
        // A project case with the same file name replaces the shipped one.
        byKey.set(`${name}/${file}`, { skill: name, file, path, source: from, id: data.id || file.replace(/\.json$/, ''), data });
      }
    }
  };
  read(fixturesDir, source);
  if (projectFixturesDir && existsSync(projectFixturesDir)) read(projectFixturesDir, 'project');
  return [...byKey.values()].sort((a, b) => a.skill.localeCompare(b.skill) || a.file.localeCompare(b.file));
}

/**
 * Resolve a skill's SKILL.md repo-relative path: kit source first, then installed project.
 * @returns {{ ok: true, path: string } | { ok: false, error: string }}
 */
export function skillBodyPath(root, name) {
  for (const rel of SKILL_CANDIDATES(name)) {
    if (existsSync(join(root, rel))) return { ok: true, path: rel };
  }
  return { ok: false, error: `skill "${name}" not found (looked in ${SKILL_CANDIDATES(name).join(', ')})` };
}

/**
 * Read a skill body from the worktree, or from a git ref via `git show <ref>:<path>`.
 * @returns {{ ok: true, path: string, text: string } | { ok: false, error: string }}
 */
export function readSkillBody(root, name, { ref } = {}) {
  const found = skillBodyPath(root, name);
  if (!found.ok) return found;
  if (!ref) {
    try {
      return { ok: true, path: found.path, text: readFileSync(join(root, found.path), 'utf8') };
    } catch (err) {
      return { ok: false, error: `cannot read ${found.path}: ${err.message}` };
    }
  }
  const r = spawnSync('git', ['show', `${ref}:${found.path}`], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (r.status !== 0) {
    return { ok: false, error: `git show ${ref}:${found.path} failed: ${(r.stderr || '').trim() || `exit ${r.status}`}` };
  }
  return { ok: true, path: found.path, text: r.stdout };
}

function seedWorkspace(workDir, setup = {}) {
  for (const [rel, content] of Object.entries(setup)) {
    const target = resolve(workDir, rel);
    if (!target.startsWith(workDir + sep) && target !== workDir) {
      throw new Error(`setup path escapes workspace: ${rel}`);
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`);
  }
}

/** Run one probe command; cwd 'work' = temp workspace, 'repo' = project root. */
export function runProbe(probe, { workDir, root, skillDir }) {
  const cwd = probe.cwd === 'repo' ? root : workDir;
  const run = expandProbe(probe.run, { skillDir });
  const r = spawnSync(run, {
    cwd,
    shell: true,
    encoding: 'utf8',
    timeout: PROBE_TIMEOUT_MS,
    env: { ...process.env, SKILL_EVAL_WORKDIR: workDir },
  });
  return {
    id: probe.id,
    run,
    cwd: probe.cwd === 'repo' ? 'repo' : 'work',
    code: r.status,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
    error: r.error ? String(r.error.message || r.error) : null,
  };
}

function assertionResult(type, ok, detail) {
  return { type, ok, detail };
}

/** Evaluate one fixture's assertions against probe results, workspace files, and the skill body. */
export function evalAssertions(fixture, { probes, workDir, skillText }) {
  const byId = new Map((probes || []).map((p) => [p.id, p]));
  const out = [];
  for (const a of fixture.assertions || []) {
    const probe = a.probe ? byId.get(a.probe) : null;
    if (a.probe && !probe) {
      out.push(assertionResult(a.type, false, `unknown probe "${a.probe}"`));
      continue;
    }
    switch (a.type) {
      case 'exit_code': {
        const want = Number(a.code ?? 0);
        out.push(assertionResult(a.type, probe.code === want, `exit ${probe.code} (want ${want})${probe.error ? ` — ${probe.error}` : ''}`));
        break;
      }
      case 'stdout_contains':
        out.push(assertionResult(a.type, probe.stdout.includes(String(a.text ?? '')), probe.stdout.includes(String(a.text ?? '')) ? 'found' : `missing "${a.text}"`));
        break;
      case 'stdout_matches': {
        const re = new RegExp(String(a.pattern ?? ''));
        out.push(assertionResult(a.type, re.test(probe.stdout), re.test(probe.stdout) ? 'matched' : `no match for /${a.pattern}/`));
        break;
      }
      case 'file_exists': {
        const p = resolve(workDir, String(a.path ?? ''));
        const inside = p === workDir || p.startsWith(workDir + sep);
        out.push(assertionResult(a.type, inside && existsSync(p), inside ? String(a.path) : `path escapes workspace: ${a.path}`));
        break;
      }
      case 'file_contains': {
        const p = resolve(workDir, String(a.path ?? ''));
        const inside = p === workDir || p.startsWith(workDir + sep);
        let ok = false;
        let detail = String(a.path);
        if (inside && existsSync(p)) {
          const body = readFileSync(p, 'utf8');
          ok = body.includes(String(a.pattern ?? '')) || new RegExp(String(a.pattern ?? '')).test(body);
          detail = ok ? 'found' : `missing /${a.pattern}/ in ${a.path}`;
        } else if (inside) {
          detail = `missing file ${a.path}`;
        } else {
          detail = `path escapes workspace: ${a.path}`;
        }
        out.push(assertionResult(a.type, ok, detail));
        break;
      }
      case 'skill_contains':
        out.push(assertionResult(a.type, String(skillText ?? '').includes(String(a.pattern ?? '')), `pattern "${a.pattern}"`));
        break;
      case 'skill_lacks':
        out.push(assertionResult(a.type, !String(skillText ?? '').includes(String(a.pattern ?? '')), `pattern "${a.pattern}"`));
        break;
      default:
        out.push(assertionResult(a.type ?? 'unknown', false, `unknown assertion type "${a.type}"`));
    }
  }
  return out;
}

/**
 * Run one fixture once. `body` is the resolved skill text under test (worktree or git ref).
 * Returns { id, ok, failures, probes, assertions }.
 */
export function runFixture(root, fixtureCase, { body, skillDir } = {}) {
  const { skill, data } = fixtureCase;
  const id = data.id || fixtureCase.file.replace(/\.json$/, '');
  const base = { id, skill, source: fixtureCase.source ?? 'kit', task: data.task ?? '', expect: data.expect ?? '', probes: [], assertions: [], failures: [] };
  if (data.__parse_error) {
    base.failures.push(`fixture JSON parse error: ${data.__parse_error}`);
    return { ...base, ok: false };
  }
  const workDir = mkdtempSync(join(tmpdir(), 'skill-eval-'));
  try {
    try {
      seedWorkspace(workDir, data.setup);
    } catch (err) {
      base.failures.push(String(err.message || err));
      return { ...base, ok: false };
    }
    for (const probe of Array.isArray(data.probes) ? data.probes : []) {
      base.probes.push(runProbe(probe, { workDir, root, skillDir }));
    }
    base.assertions = evalAssertions(data, { probes: base.probes, workDir, skillText: body });
    for (const a of base.assertions) {
      if (!a.ok) base.failures.push(`${a.type}: ${a.detail}`);
    }
    return { ...base, ok: base.failures.length === 0 };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

function deltaFor(currentOk, baselineOk) {
  if (baselineOk === null || baselineOk === undefined) return 'new';
  if (!baselineOk && currentOk) return 'improved';
  if (baselineOk && !currentOk) return 'regressed';
  return 'unchanged';
}

/**
 * Score every fixture (optionally one skill, optionally against a baseline git ref).
 * Returns { skills: [{name,total,passed,failed,results}], total, passed, failed,
 *           regressed: ["skill/case", …], ok }.
 */
export function runSkillEval({ root = process.cwd(), fixturesDir = DEFAULT_FIXTURES_DIR, projectFixturesDir, skill, baseline } = {}) {
  const cases = loadFixtures(fixturesDir, { skill, projectFixturesDir });
  const bodies = new Map();
  const bodyFor = (name) => {
    if (!bodies.has(name)) bodies.set(name, readSkillBody(root, name));
    return bodies.get(name);
  };
  const baselineBodies = new Map();
  const baselineBodyFor = (name) => {
    const key = `${name}@${baseline}`;
    if (!baselineBodies.has(key)) baselineBodies.set(key, readSkillBody(root, name, { ref: baseline }));
    return baselineBodies.get(key);
  };

  const bySkill = new Map();
  for (const c of cases) {
    if (!bySkill.has(c.skill)) bySkill.set(c.skill, []);
    bySkill.get(c.skill).push(c);
  }

  const skills = [];
  const regressed = [];
  let total = 0;
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  for (const [name, skillCases] of [...bySkill.entries()].sort()) {
    const results = [];
    for (const c of skillCases) {
      const body = bodyFor(name);
      const caseId = c.data.id || c.file.replace(/\.json$/, '');
      const unmet = c.data.__parse_error ? [] : unmetRequirements(c.data.requires, root);
      if (unmet.length) {
        // A property of the machine, not of the skill text: reported, never failed or regressed.
        results.push({ id: caseId, skill: name, source: c.source, task: c.data.task ?? '', expect: c.data.expect ?? '', probes: [], assertions: [], failures: [], ok: false, skipped: true, reason: unmet.join('; ') });
        total += 1;
        skipped += 1;
        continue;
      }
      const skillDir = body.ok ? dirname(body.path) : undefined;
      const result = body.ok
        ? runFixture(root, c, { body: body.text, skillDir })
        : { id: caseId, skill: name, source: c.source, task: c.data.task ?? '', expect: c.data.expect ?? '', probes: [], assertions: [], failures: [body.error], ok: false };
      if (baseline) {
        const bbody = baselineBodyFor(name);
        const baselineResult = bbody.ok
          ? runFixture(root, c, { body: bbody.text, skillDir })
          : { ok: false };
        result.delta = deltaFor(result.ok, bbody.ok ? baselineResult.ok : null);
        if (result.delta === 'regressed') regressed.push(`${name}/${result.id}`);
      }
      results.push(result);
      total += 1;
      if (result.ok) passed += 1;
      else failed += 1;
    }
    skills.push({
      name,
      total: results.length,
      passed: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok && !r.skipped).length,
      skipped: results.filter((r) => r.skipped).length,
      results,
    });
  }

  // At least one case must have run: a run where everything was skipped proves nothing.
  const executed = total - skipped;
  const ok = baseline ? regressed.length === 0 && executed > 0 : failed === 0 && executed > 0;
  return { skills, total, passed, failed, skipped, regressed, baseline: baseline ?? null, ok };
}

export function formatSkillEvalReport(suite) {
  const lines = ['== skill-eval =='];
  if (!suite.skills.length) {
    lines.push('  no fixtures found');
  }
  for (const s of suite.skills) {
    lines.push(`  ${s.name.padEnd(24)} ${s.passed}/${s.total - (s.skipped ?? 0)} pass${s.skipped ? ` (${s.skipped} skipped)` : ''}`);
    for (const r of s.results) {
      if (r.skipped) {
        lines.push(`    SKIP ${r.id}  ${r.reason}`);
      } else if (r.ok) {
        lines.push(`    OK   ${r.id}${r.delta ? ` (${r.delta})` : ''}`);
      } else {
        lines.push(`    FAIL ${r.id}${r.delta ? ` (${r.delta})` : ''}  ${r.failures.join('; ')}`);
      }
    }
  }
  lines.push(`  total ${suite.passed}/${suite.total - (suite.skipped ?? 0)} pass${suite.skipped ? ` · ${suite.skipped} skipped` : ''}`);
  if (suite.baseline) {
    lines.push(`  baseline ${suite.baseline}`);
    for (const s of suite.skills) {
      for (const r of s.results) {
        if (r.delta === 'improved') lines.push(`  improved  ${s.name}/${r.id}`);
        if (r.delta === 'regressed') lines.push(`  REGRESSED ${s.name}/${r.id}`);
      }
    }
    if (suite.regressed.length) lines.push(`  regressed fixtures: ${suite.regressed.join(', ')}`);
  }
  return `${lines.join('\n')}\n`;
}
