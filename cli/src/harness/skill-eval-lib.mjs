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
 */
import { existsSync, readdirSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_FIXTURES_DIR = join(HERE, '../../eval/skills');

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
export function loadFixtures(fixturesDir = DEFAULT_FIXTURES_DIR, { skill } = {}) {
  const skills = skill ? [skill] : listDirs(fixturesDir);
  const out = [];
  for (const name of skills) {
    const dir = join(fixturesDir, name);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
      const path = join(dir, file);
      let data;
      try {
        data = JSON.parse(readFileSync(path, 'utf8'));
      } catch (err) {
        data = { __parse_error: String(err?.message || err) };
      }
      out.push({ skill: name, file, path, id: data.id || file.replace(/\.json$/, ''), data });
    }
  }
  return out;
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
export function runProbe(probe, { workDir, root }) {
  const cwd = probe.cwd === 'repo' ? root : workDir;
  const r = spawnSync(probe.run, {
    cwd,
    shell: true,
    encoding: 'utf8',
    timeout: PROBE_TIMEOUT_MS,
    env: { ...process.env, SKILL_EVAL_WORKDIR: workDir },
  });
  return {
    id: probe.id,
    run: probe.run,
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
export function runFixture(root, fixtureCase, { body, fixturesDir } = {}) {
  const { skill, data } = fixtureCase;
  const id = data.id || fixtureCase.file.replace(/\.json$/, '');
  const base = { id, skill, task: data.task ?? '', expect: data.expect ?? '', probes: [], assertions: [], failures: [] };
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
      base.probes.push(runProbe(probe, { workDir, root }));
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
export function runSkillEval({ root = process.cwd(), fixturesDir = DEFAULT_FIXTURES_DIR, skill, baseline } = {}) {
  const cases = loadFixtures(fixturesDir, { skill });
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
  for (const [name, skillCases] of [...bySkill.entries()].sort()) {
    const results = [];
    for (const c of skillCases) {
      const body = bodyFor(name);
      const result = body.ok
        ? runFixture(root, c, { body: body.text })
        : { id: c.data.id || c.file.replace(/\.json$/, ''), skill: name, task: c.data.task ?? '', expect: c.data.expect ?? '', probes: [], assertions: [], failures: [body.error], ok: false };
      if (baseline) {
        const bbody = baselineBodyFor(name);
        const baselineResult = bbody.ok
          ? runFixture(root, c, { body: bbody.text })
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
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  }

  const ok = baseline ? regressed.length === 0 && total > 0 : failed === 0 && total > 0;
  return { skills, total, passed, failed, regressed, baseline: baseline ?? null, ok };
}

export function formatSkillEvalReport(suite) {
  const lines = ['== skill-eval =='];
  if (!suite.skills.length) {
    lines.push('  no fixtures found');
  }
  for (const s of suite.skills) {
    lines.push(`  ${s.name.padEnd(24)} ${s.passed}/${s.total} pass`);
    for (const r of s.results) {
      if (r.ok) {
        lines.push(`    OK   ${r.id}${r.delta ? ` (${r.delta})` : ''}`);
      } else {
        lines.push(`    FAIL ${r.id}${r.delta ? ` (${r.delta})` : ''}  ${r.failures.join('; ')}`);
      }
    }
  }
  lines.push(`  total ${suite.passed}/${suite.total} pass`);
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
