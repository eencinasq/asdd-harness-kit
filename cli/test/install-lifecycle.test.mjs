// asdd install ownership, guards, --json, --pr, and asdd uninstall, end to end on temporary projects (no network).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

import { prPreflight } from '../src/install/pr.mjs';
import { VERSION } from '../src/paths.mjs';
import { compareVersions } from '../src/semver.mjs';

const BIN = join(import.meta.dirname, '../bin/asdd.mjs');
let tmp;
before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'asdd-lifecycle-'));
});
after(() => rmSync(tmp, { recursive: true, force: true }));

const asdd = (args, env = {}) =>
  spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', env: { ...process.env, JEV_API_KEY: '', ...env } });
const json = (res) => JSON.parse(res.stdout);
const app = (name) => {
  const dir = join(tmp, name);
  mkdirSync(dir, { recursive: true });
  return dir;
};
const patch = (file, fn) => {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  fn(data);
  writeFileSync(file, JSON.stringify(data, null, 2));
};
const git = (cwd, ...args) => {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(res.status, 0, `git ${args.join(' ')}: ${res.stderr}`);
  return res.stdout.trim();
};

test('semver: release after its pre-release, numeric order', () => {
  assert.ok(compareVersions('3.10.0', '3.9.9') > 0);
  assert.ok(compareVersions('3.9.0-rc.1', '3.9.0') < 0);
  assert.equal(compareVersions('3.9.0', '3.9.0'), 0);
  assert.equal(compareVersions('dev', '3.9.0'), null);
});

test('a kit file the project changed is skipped on upgrade, --force takes the kit version', () => {
  const dir = app('owned');
  assert.equal(asdd(['install', dir, '--skip-deps', '--json']).status, 0);
  const versions = join(dir, '.harness/config/installed-versions.json');
  const skill = '.agents/skills/shape-up/SKILL.md';
  assert.match(JSON.parse(readFileSync(versions, 'utf8')).kit_files[skill], /^[0-9a-f]{64}$/);
  appendFileSync(join(dir, skill), '\n# local tweak\n');
  // An older install of both skills, both changed here since the kit wrote them.
  patch(versions, (v) => {
    // versions.json keys are the kit sources (cli/skills/…); kit_files keys are project paths (.agents/skills/…).
    v.artifacts['cli/skills/shape-up/SKILL.md'] = '0.0.1';
    v.artifacts['cli/skills/product-delivery/SKILL.md'] = '0.0.1';
  });
  appendFileSync(join(dir, '.agents/skills/product-delivery/SKILL.md'), '\n# team note\n');
  patch(versions, (v) => {
    v.kit_files['.agents/skills/product-delivery/SKILL.md'] = 'f'.repeat(64);
  });
  const up = json(asdd(['install', dir, '--skip-deps', '--json']));
  assert.equal(up.ok, true);
  assert.deepEqual([...up.skipped].sort(), [skill, '.agents/skills/product-delivery/SKILL.md'].sort());
  assert.match(readFileSync(join(dir, skill), 'utf8'), /# local tweak/);
  assert.deepEqual(JSON.parse(readFileSync(versions, 'utf8')).skipped_files.sort(), up.skipped.sort());
  assert.match(asdd(['doctor', dir]).stdout, /warn {2}changed: 2 kit file/);
  const forced = json(asdd(['install', dir, '--skip-deps', '--force', '--json']));
  assert.deepEqual(forced.skipped, []);
  assert.doesNotMatch(readFileSync(join(dir, skill), 'utf8'), /# local tweak/);
  assert.equal(JSON.parse(readFileSync(versions, 'utf8')).skipped_files, undefined);
});

test('an unedited kit file is updated when its version changes', () => {
  const dir = app('update');
  asdd(['install', dir, '--skip-deps', '--json']);
  const versions = join(dir, '.harness/config/installed-versions.json');
  const kitCopy = readFileSync(join(dir, '.harness/steering/controls.md'), 'utf8');
  writeFileSync(join(dir, '.harness/steering/controls.md'), 'old kit text\n');
  patch(versions, (v) => {
    v.artifacts['cli/steering/controls.md'] = '0.0.1';
    v.kit_files['.harness/steering/controls.md'] = createHash('sha256').update('old kit text\n').digest('hex');
  });
  const res = json(asdd(['install', dir, '--skip-deps', '--json']));
  assert.equal(res.files.updated, 1);
  assert.equal(readFileSync(join(dir, '.harness/steering/controls.md'), 'utf8'), kitCopy);
});

test('a file at a kit path the kit cannot prove it wrote is skipped, never overwritten; --force restores', () => {
  const dir = app('unproven');
  assert.equal(asdd(['install', dir, '--skip-deps', '--json']).status, 0);
  const versions = join(dir, '.harness/config/installed-versions.json');
  const rel = '.harness/steering/controls.md';
  // Simulate an install from before file hashes: the artifact version moved, but no kit_files entry proves the copy.
  patch(versions, (v) => {
    delete v.kit_files[rel];
    v.artifacts['cli/steering/controls.md'] = '0.0.1';
  });
  appendFileSync(join(dir, rel), '\n<!-- local -->\n');
  const res = json(asdd(['install', dir, '--skip-deps', '--json']));
  assert.deepEqual(res.skipped, [rel]);
  assert.match(readFileSync(join(dir, rel), 'utf8'), /<!-- local -->/);
  // Still unproven: the file was not laundered into kit ownership.
  assert.equal(JSON.parse(readFileSync(versions, 'utf8')).kit_files[rel], undefined);
  const forced = json(asdd(['install', dir, '--skip-deps', '--force', '--json']));
  assert.deepEqual(forced.skipped, []);
  assert.doesNotMatch(readFileSync(join(dir, rel), 'utf8'), /<!-- local -->/);
});

test('a rendered runtime agent file with no recorded render is kept unless --force', () => {
  const dir = app('render');
  assert.equal(asdd(['install', dir, '--runtime=cursor', '--skip-deps', '--json']).status, 0);
  const versions = join(dir, '.harness/config/installed-versions.json');
  const rel = '.cursor/agents/asdd-discovery-agent.md';
  patch(versions, (v) => {
    delete v.kit_files[rel];
  });
  writeFileSync(join(dir, rel), '# our agent\n');
  const res = json(asdd(['install', dir, '--runtime=cursor', '--skip-deps', '--json']));
  assert.deepEqual(res.skipped, [rel]);
  assert.equal(readFileSync(join(dir, rel), 'utf8'), '# our agent\n');
  const forced = json(asdd(['install', dir, '--runtime=cursor', '--skip-deps', '--force', '--json']));
  assert.deepEqual(forced.skipped, []);
  assert.notEqual(readFileSync(join(dir, rel), 'utf8'), '# our agent\n');
});

test('a real file where a runtime wants a link is kept unless the kit recorded it', () => {
  const dir = app('linked');
  assert.equal(asdd(['install', dir, '--skip-deps', '--json']).status, 0);
  const rel = '.devin/agents/asdd-spec-agent.md';
  mkdirSync(join(dir, '.devin/agents'), { recursive: true });
  writeFileSync(join(dir, rel), '# our agent\n');
  // devin links its agent files — a real file the kit cannot prove it wrote stays.
  const res = json(asdd(['install', dir, '--runtime=devin', '--skip-deps', '--json']));
  assert.deepEqual(res.skipped, [rel]);
  assert.equal(readFileSync(join(dir, rel), 'utf8'), '# our agent\n');
  const forced = json(asdd(['install', dir, '--runtime=devin', '--skip-deps', '--force', '--json']));
  assert.deepEqual(forced.skipped, []);
  assert.equal(lstatSync(join(dir, rel)).isSymbolicLink(), true);
});

test('retired and legacy paths go only when the manifest proves them kit-installed', () => {
  const dir = app('owned-deletes');
  assert.equal(asdd(['install', dir, '--skip-deps', '--json']).status, 0);
  const versions = join(dir, '.harness/config/installed-versions.json');
  const jev = '.harness/cli/src/harness/jev-gates.mjs';
  const cliNote = '.harness/cli/notes.md';
  const own = ['.agents/modules/loader/enable.md', 'scripts/enable-module.sh', '.harness/scripts/team-report.mjs'];
  for (const rel of [...own, jev, cliNote]) {
    mkdirSync(join(dir, rel, '..'), { recursive: true });
    writeFileSync(join(dir, rel), '# ours\n');
  }
  const res = json(asdd(['install', dir, '--skip-deps', '--json']));
  assert.equal(res.ok, true);
  // None of them is recorded as kit-installed: every one stays (.harness/cli has no bin/asdd.mjs signature).
  for (const rel of [...own, jev, cliNote]) assert.ok(existsSync(join(dir, rel)), `${rel} must be kept`);
  // Prove the retired paths (an old kit recorded them); notes.md stays unmanaged, so .harness/cli survives.
  patch(versions, (v) => {
    v.managed_files.push(...own, jev);
  });
  assert.equal(asdd(['install', dir, '--skip-deps', '--json']).status, 0);
  for (const rel of [jev, '.agents/modules', 'scripts/enable-module.sh']) {
    assert.equal(existsSync(join(dir, rel)), false, `${rel} should be gone once proven`);
  }
  assert.ok(existsSync(join(dir, cliNote)), 'unproven notes.md keeps .harness/cli alive');
  // team-report.mjs is not a kit script name — .harness/scripts keeps it as the project's own.
  assert.ok(existsSync(join(dir, '.harness/scripts/team-report.mjs')));
  // Fully prove .harness/cli (every file managed): the whole dir goes.
  patch(versions, (v) => {
    v.managed_files.push(cliNote);
  });
  assert.equal(asdd(['install', dir, '--skip-deps', '--json']).status, 0);
  assert.equal(existsSync(join(dir, '.harness/cli')), false);
});

test('doctor reports project-edited kit files and unmanaged files inside kit-owned dirs', () => {
  const dir = app('ownership-doctor');
  assert.equal(asdd(['install', dir, '--skip-deps', '--json']).status, 0);
  appendFileSync(join(dir, '.harness/steering/controls.md'), '\n# tweak\n');
  writeFileSync(join(dir, '.agents/skills/notes.md'), '# ours\n');
  const out = asdd(['doctor', dir]).stdout;
  assert.match(out, /warn {2}kit-files: 1 kit file\(s\) carry project edits/);
  assert.match(out, /warn {2}kit-dirs: .*never kit-installed/);
});

test('guards: an interrupted install and a downgrade are refused unless --force', () => {
  const dir = app('guards');
  asdd(['install', dir, '--skip-deps', '--json']);
  writeFileSync(join(dir, '.harness/.installing'), 'x');
  const interrupted = asdd(['install', dir, '--skip-deps', '--json']);
  assert.equal(interrupted.status, 1);
  assert.match(json(interrupted).error, /interrupted/);
  assert.equal(asdd(['doctor', dir]).status, 1);
  assert.equal(asdd(['install', dir, '--skip-deps', '--force', '--json']).status, 0);
  assert.equal(existsSync(join(dir, '.harness/.installing')), false);
  patch(join(dir, '.harness/config/project.json'), (p) => {
    p.kit.version = '99.0.0';
  });
  const down = asdd(['install', dir, '--skip-deps', '--json']);
  assert.equal(down.status, 1);
  assert.match(json(down).error, /newer than this CLI/);
  assert.equal(json(asdd(['install', dir, '--skip-deps', '--force', '--json'])).previous, '99.0.0');
});

test('--json: one object on stdout, for the result and for an error', () => {
  const dir = app('json');
  const ok = asdd(['install', dir, '--runtime=claude', '--skip-deps', '--json']);
  const result = json(ok);
  assert.equal(result.ok, true);
  assert.equal(result.version, VERSION);
  assert.equal(result.previous, null);
  assert.ok(result.files.created > 50); // the CLI is not among them: asdd is a Node package
  const bad = asdd(['install', join(tmp, 'missing'), '--json']);
  assert.equal(bad.status, 1);
  assert.deepEqual(Object.keys(json(bad)), ['ok', 'error']);
});

test('uninstall removes what the kit added and keeps the project changes', () => {
  const dir = app('uninstall');
  writeFileSync(join(dir, '.gitignore'), 'dist/\n');
  mkdirSync(join(dir, '.agents/mcp'), { recursive: true });
  asdd(['install', dir, '--runtime=cursor,claude', '--modules=http-api', '--skip-deps', '--json']);
  patch(join(dir, '.agents/mcp/mcp.json'), (m) => {
    m.mcpServers.mine = { command: 'mine' };
  });
  appendFileSync(join(dir, '.agents/skills/shape-up/SKILL.md'), '\nmine\n');
  writeFileSync(join(dir, '.harness/steering/product.md'), '# Our product\n');
  mkdirSync(join(dir, '.harness/specs/feature-x'), { recursive: true });
  writeFileSync(join(dir, '.harness/specs/feature-x/spec.md'), '# ours\n');

  const dry = json(asdd(['uninstall', dir, '--dry-run', '--json']));
  assert.equal(dry.dryRun, true);
  assert.ok(existsSync(join(dir, 'AGENTS.md')));
  const res = json(asdd(['uninstall', dir, '--json']));
  assert.ok(res.removed.length > 100);
  for (const gone of ['AGENTS.md', '.cursor/skills', '.claude/settings.json', '.harness/scripts', 'tools/knowledge', '.agents/mcp/adapters', '.harness/config/installed-versions.json']) {
    assert.equal(existsSync(join(dir, gone)), false, `${gone} should be gone`);
  }
  for (const kept of ['.agents/skills/shape-up/SKILL.md', '.harness/steering/product.md', '.harness/specs/feature-x/spec.md', '.harness/config/project.json']) {
    assert.ok(existsSync(join(dir, kept)), `${kept} should stay`);
  }
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(dir, '.agents/mcp/mcp.json'), 'utf8')).mcpServers), ['mine']);
  assert.equal(readFileSync(join(dir, '.gitignore'), 'utf8'), 'dist/\n.env.local\n');
  assert.equal(json(asdd(['uninstall', dir, '--json'])).nothing, true);
});

test('pr preflight names every problem', () => {
  assert.deepEqual(prPreflight({ isGitRepo: false }).map((p) => p.code), ['not-git']);
  const codes = prPreflight({ isGitRepo: true, isTopLevel: false, clean: false, remoteUrl: null, ghAuthed: false, branchTaken: true, branch: 'b' }).map((p) => p.code);
  assert.deepEqual(codes, ['not-root', 'dirty', 'no-remote', 'gh-auth', 'branch-exists']);
});

test('--pr: branch from origin, commit, push, pull request; a failed install leaves the repository as it was', () => {
  const origin = join(tmp, 'origin.git');
  git(tmp, 'init', '-q', '--bare', '-b', 'main', origin);
  const dir = join(tmp, 'pr-app');
  git(tmp, 'clone', '-q', origin, dir);
  git(dir, 'config', 'user.email', 't@t');
  git(dir, 'config', 'user.name', 't');
  writeFileSync(join(dir, 'README.md'), '# app\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-qm', 'init');
  git(dir, 'push', '-q', 'origin', 'main');
  git(dir, 'remote', 'set-head', 'origin', 'main');
  const gh = join(tmp, 'gh');
  writeFileSync(gh, '#!/bin/sh\ncase "$1 $2" in\n  "auth status") exit 0 ;;\n  "pr create") echo "https://github.com/acme/app/pull/7" ;;\n  *) exit 1 ;;\nesac\n');
  chmodSync(gh, 0o755);
  const env = { ASDD_GH: gh };

  const failed = asdd(['install', dir, '--pr', '--modules=nope', '--json'], env);
  assert.equal(failed.status, 1);
  assert.match(json(failed).error, /unknown module: nope/);
  assert.equal(git(dir, 'rev-parse', '--abbrev-ref', 'HEAD'), 'main');
  assert.equal(git(dir, 'status', '--porcelain'), '');
  assert.equal(git(dir, 'branch', '--list', 'chore/*'), '');

  const res = json(asdd(['install', dir, '--pr', '--runtime=claude', '--json'], env));
  assert.equal(res.ok, true);
  assert.equal(res.pr, 'https://github.com/acme/app/pull/7');
  assert.equal(res.branch, `chore/asdd-harness-kit-${VERSION}`);
  assert.equal(git(dir, 'rev-parse', '--abbrev-ref', 'HEAD'), 'main');
  assert.equal(git(dir, 'status', '--porcelain'), '');
  assert.equal(git(origin, 'log', '-1', '--format=%s', res.branch), `chore: install asdd-harness-kit ${VERSION}`);
  assert.match(git(origin, 'show', '--name-only', '--format=', res.branch), /^AGENTS\.md$/m);
  assert.equal(existsSync(join(dir, 'AGENTS.md')), false, 'main is untouched');

  const again = asdd(['install', dir, '--pr', '--json'], env);
  assert.deepEqual(json(again).problems.map((p) => p.code), ['branch-exists']);
});
