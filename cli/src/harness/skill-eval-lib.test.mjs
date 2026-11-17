import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  discoverSkills,
  loadFixtures,
  readSkillBody,
  runSkillEval,
  formatSkillEvalReport,
  expandProbe,
  resolveAsdd,
} from './skill-eval-lib.mjs';

function tmp(prefix = 'skill-eval-test-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

function writeJson(path, data) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

/** A fake project root with one skill and one fixture directory. */
function makeProject({ skillBody = '# fake\n\nRun `fake-cmd --json`.\n', fixtures = [] } = {}) {
  const root = tmp();
  mkdirSync(join(root, '.agents/skills/fake-skill'), { recursive: true });
  writeFileSync(join(root, '.agents/skills/fake-skill/SKILL.md'), skillBody);
  const fixturesDir = join(root, 'eval/skills');
  for (const [name, data] of Object.entries(fixtures)) {
    writeJson(join(fixturesDir, 'fake-skill', name), data);
  }
  return { root, fixturesDir };
}

const PASS_FIXTURE = {
  id: 'echo-pass',
  task: 'echo a greeting',
  expect: 'probe exits 0 and prints hello',
  probes: [{ id: 'p1', run: 'echo hello', cwd: 'work' }],
  assertions: [
    { type: 'exit_code', probe: 'p1', code: 0 },
    { type: 'stdout_contains', probe: 'p1', text: 'hello' },
    { type: 'skill_contains', pattern: 'fake-cmd' },
  ],
};

test('discoverSkills lists skill dirs that contain fixtures', () => {
  const { fixturesDir } = makeProject({ fixtures: { 'a.json': PASS_FIXTURE } });
  const skills = discoverSkills(fixturesDir);
  assert.equal(skills.length, 1);
  assert.equal(skills[0].name, 'fake-skill');
  assert.equal(skills[0].cases.length, 1);
  assert.equal(skills[0].cases[0].id, 'echo-pass');
});

test('loadFixtures returns [] for a missing dir and filters by skill', () => {
  assert.deepEqual(loadFixtures(join(tmpdir(), 'no-such-dir-xyz')), []);
  const { fixturesDir } = makeProject({
    fixtures: { 'a.json': PASS_FIXTURE, 'b.json': { ...PASS_FIXTURE, id: 'echo-pass-2' } },
  });
  const all = loadFixtures(fixturesDir);
  assert.equal(all.length, 2);
  mkdirSync(join(fixturesDir, 'other-skill'), { recursive: true });
  writeJson(join(fixturesDir, 'other-skill', 'c.json'), { ...PASS_FIXTURE, id: 'c' });
  assert.equal(loadFixtures(fixturesDir, { skill: 'other-skill' }).length, 1);
});

test('readSkillBody resolves .agents/skills and reports missing skills', () => {
  const { root } = makeProject();
  const hit = readSkillBody(root, 'fake-skill');
  assert.equal(hit.ok, true);
  assert.match(hit.text, /fake-cmd/);
  const miss = readSkillBody(root, 'no-such-skill');
  assert.equal(miss.ok, false);
});

test('runSkillEval passes a fixture whose assertions hold', () => {
  const { root, fixturesDir } = makeProject({ fixtures: { 'pass.json': PASS_FIXTURE } });
  const suite = runSkillEval({ root, fixturesDir });
  assert.equal(suite.ok, true);
  assert.equal(suite.total, 1);
  assert.equal(suite.passed, 1);
  assert.equal(suite.skills[0].name, 'fake-skill');
  assert.equal(suite.skills[0].results[0].id, 'echo-pass');
});

test('runSkillEval fails on a wrong exit code and names the assertion', () => {
  const bad = {
    ...PASS_FIXTURE,
    id: 'exit-fail',
    probes: [{ id: 'p1', run: 'exit 3', cwd: 'work' }],
    assertions: [{ type: 'exit_code', probe: 'p1', code: 0 }],
  };
  const { root, fixturesDir } = makeProject({ fixtures: { 'bad.json': bad } });
  const suite = runSkillEval({ root, fixturesDir });
  assert.equal(suite.ok, false);
  assert.equal(suite.failed, 1);
  const r = suite.skills[0].results[0];
  assert.equal(r.ok, false);
  assert.ok(r.failures.some((f) => f.includes('exit_code')));
});

test('setup seeds the work dir; file assertions observe it', () => {
  const fx = {
    id: 'files',
    task: 'create a file',
    expect: 'out.txt exists with content',
    setup: { 'sub/out.txt': 'needle' },
    probes: [{ id: 'p1', run: 'cat sub/out.txt', cwd: 'work' }],
    assertions: [
      { type: 'file_exists', path: 'sub/out.txt' },
      { type: 'file_contains', path: 'sub/out.txt', pattern: 'needle' },
      { type: 'stdout_contains', probe: 'p1', text: 'needle' },
    ],
  };
  const { root, fixturesDir } = makeProject({ fixtures: { 'files.json': fx } });
  const suite = runSkillEval({ root, fixturesDir });
  assert.equal(suite.ok, true, JSON.stringify(suite.skills[0].results[0].failures));
});

test('skill_lacks fails when the body still contains the pattern', () => {
  const fx = {
    ...PASS_FIXTURE,
    id: 'lacks',
    assertions: [{ type: 'skill_lacks', pattern: 'fake-cmd' }],
  };
  const { root, fixturesDir } = makeProject({ fixtures: { 'lacks.json': fx } });
  const suite = runSkillEval({ root, fixturesDir });
  assert.equal(suite.ok, false);
});

test('probes with cwd repo run in the project root', () => {
  const fx = {
    id: 'repo-cwd',
    task: 'check repo file',
    expect: 'marker file found',
    probes: [{ id: 'p1', run: 'cat marker.txt', cwd: 'repo' }],
    assertions: [{ type: 'stdout_contains', probe: 'p1', text: 'repo-marker' }],
  };
  const { root, fixturesDir } = makeProject({ fixtures: { 'repo.json': fx } });
  writeFileSync(join(root, 'marker.txt'), 'repo-marker');
  const suite = runSkillEval({ root, fixturesDir });
  assert.equal(suite.ok, true, JSON.stringify(suite.skills[0].results[0].failures));
});

function git(root, args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

test('baseline compares worktree body vs git ref and reports deltas', () => {
  const root = tmp();
  mkdirSync(join(root, '.agents/skills/fake-skill'), { recursive: true });
  const skillPath = join(root, '.agents/skills/fake-skill/SKILL.md');
  writeFileSync(skillPath, '# v1\n\ncontains OLD-TOKEN only.\n');
  git(root, ['init', '-q']);
  git(root, ['config', 'user.email', 't@t']);
  git(root, ['config', 'user.name', 't']);
  git(root, ['add', '-A']);
  git(root, ['commit', '-qm', 'v1']);
  const base = git(root, ['rev-parse', 'HEAD']);
  writeFileSync(skillPath, '# v2\n\ncontains NEW-TOKEN only.\n');

  const fixturesDir = join(root, 'eval/skills');
  // improved: fails at baseline (no NEW-TOKEN), passes now
  writeJson(join(fixturesDir, 'fake-skill', 'improved.json'), {
    ...PASS_FIXTURE,
    id: 'improved',
    probes: [],
    assertions: [{ type: 'skill_contains', pattern: 'NEW-TOKEN' }],
  });
  // regressed: passes at baseline (OLD-TOKEN present), fails now
  writeJson(join(fixturesDir, 'fake-skill', 'regressed.json'), {
    ...PASS_FIXTURE,
    id: 'regressed',
    probes: [],
    assertions: [{ type: 'skill_contains', pattern: 'OLD-TOKEN' }],
  });

  const suite = runSkillEval({ root, fixturesDir, baseline: base });
  const byId = Object.fromEntries(suite.skills[0].results.map((r) => [r.id, r]));
  assert.equal(byId.improved.delta, 'improved');
  assert.equal(byId.regressed.delta, 'regressed');
  assert.equal(suite.ok, false, 'a regression must fail the suite (REQ-004)');
  assert.deepEqual(suite.regressed, ['fake-skill/regressed']);
});

test('baseline with no regressions passes and reports unchanged', () => {
  const root = tmp();
  mkdirSync(join(root, '.agents/skills/fake-skill'), { recursive: true });
  writeFileSync(join(root, '.agents/skills/fake-skill/SKILL.md'), '# v\n\nstable body\n');
  git(root, ['init', '-q']);
  git(root, ['config', 'user.email', 't@t']);
  git(root, ['config', 'user.name', 't']);
  git(root, ['add', '-A']);
  git(root, ['commit', '-qm', 'v1']);
  const base = git(root, ['rev-parse', 'HEAD']);

  const fixturesDir = join(root, 'eval/skills');
  writeJson(join(fixturesDir, 'fake-skill', 'same.json'), {
    ...PASS_FIXTURE,
    id: 'same',
    probes: [],
    assertions: [{ type: 'skill_contains', pattern: 'stable body' }],
  });
  const suite = runSkillEval({ root, fixturesDir, baseline: base });
  assert.equal(suite.ok, true);
  assert.equal(suite.skills[0].results[0].delta, 'unchanged');
});

test('formatSkillEvalReport prints per-skill pass rates and deltas', () => {
  const { root, fixturesDir } = makeProject({ fixtures: { 'pass.json': PASS_FIXTURE } });
  const suite = runSkillEval({ root, fixturesDir });
  const text = formatSkillEvalReport(suite);
  assert.match(text, /fake-skill/);
  assert.match(text, /1\/1/);
});

test('invalid JSON fixture is reported as a failed case, not a crash', () => {
  const { root, fixturesDir } = makeProject();
  mkdirSync(join(fixturesDir, 'fake-skill'), { recursive: true });
  writeFileSync(join(fixturesDir, 'fake-skill', 'broken.json'), '{not json');
  const suite = runSkillEval({ root, fixturesDir });
  assert.equal(suite.ok, false);
  assert.equal(suite.failed, 1);
});

test('skill-eval-portable REQ-001 REQ-006 {asdd} is the running CLI and {skill_dir} the found skill folder, shell-quoted', () => {
  const asdd = resolveAsdd();
  assert.match(asdd, /^'.+' '.+cli\/bin\/asdd\.mjs'$/);
  assert.equal(expandProbe('{asdd} status --json', { asdd: "'node' 'x/cli/bin/asdd.mjs'", skillDir: '.agents/skills/a' }), "'node' 'x/cli/bin/asdd.mjs' status --json");
  assert.equal(expandProbe("grep -c x {skill_dir}/references/r.md", { asdd: 'a', skillDir: ".agents/skills/it's" }), "grep -c x '.agents/skills/it'\\''s'/references/r.md");
  const { root, fixturesDir } = makeProject({
    fixtures: { 'cli.json': { id: 'cli', probes: [{ id: 'p', run: '{asdd} --version', cwd: 'work' }, { id: 'd', run: 'test -f {skill_dir}/SKILL.md', cwd: 'repo' }], assertions: [{ type: 'exit_code', probe: 'p', code: 0 }, { type: 'exit_code', probe: 'd', code: 0 }] } },
  });
  const suite = runSkillEval({ root, fixturesDir });
  assert.equal(suite.ok, true, JSON.stringify(suite.skills[0]?.results[0]?.failures));
});

test('skill-eval-portable REQ-003 project fixtures in .harness/eval/skills merge with shipped ones; same file name overrides', () => {
  const { root, fixturesDir } = makeProject({ fixtures: { 'a.json': PASS_FIXTURE, 'b.json': { ...PASS_FIXTURE, id: 'shipped-b' } } });
  writeJson(join(root, '.harness/eval/skills/fake-skill/b.json'), { ...PASS_FIXTURE, id: 'project-b' });
  writeJson(join(root, '.harness/eval/skills/fake-skill/c.json'), { ...PASS_FIXTURE, id: 'project-c' });
  const suite = runSkillEval({ root, fixturesDir, projectFixturesDir: join(root, '.harness/eval/skills') });
  const ids = suite.skills[0].results.map((r) => [r.id, r.source]);
  assert.deepEqual(ids, [['echo-pass', 'kit'], ['project-b', 'project'], ['project-c', 'project']]);
  assert.equal(suite.ok, true);
});

test('skill-eval-portable REQ-005 unmet requires are skipped with a reason, never failed or regressed', () => {
  const { root, fixturesDir } = makeProject({
    fixtures: {
      'a.json': PASS_FIXTURE,
      'needs.json': { ...PASS_FIXTURE, id: 'needs-tool', requires: ['command:definitely-not-a-real-tool-xyz', 'path:nope/missing'] },
      'has.json': { ...PASS_FIXTURE, id: 'has-tool', requires: ['command:node', 'path:.agents'] },
    },
  });
  const suite = runSkillEval({ root, fixturesDir });
  const byId = Object.fromEntries(suite.skills[0].results.map((r) => [r.id, r]));
  assert.equal(byId['needs-tool'].skipped, true);
  assert.match(byId['needs-tool'].reason, /definitely-not-a-real-tool-xyz/);
  assert.equal(byId['has-tool'].ok, true);
  assert.deepEqual([suite.passed, suite.failed, suite.skipped], [2, 0, 1]);
  assert.equal(suite.ok, true);
  assert.match(formatSkillEvalReport(suite), /SKIP needs-tool/);
  const onlySkipped = makeProject({ fixtures: { 'n.json': { ...PASS_FIXTURE, requires: ['command:definitely-not-a-real-tool-xyz'] } } });
  assert.equal(runSkillEval(onlySkipped).ok, false, 'a run where nothing executed is not a pass');
});
