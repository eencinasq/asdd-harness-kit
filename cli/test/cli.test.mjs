// Unit tests for the asdd CLI: argument parsing, runtime names, dispatch. `cli/test/install.sh` covers the install end to end.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

import { UsageError, parseCommand } from '../src/harness/commands.mjs';
import { installOptions, list } from '../src/install/options.mjs';
import { fingerprint } from '../src/kit/fingerprint.mjs';
import { suggestProjectName } from '../src/install/phases.mjs';
import { runtimeNames } from '../src/install/runtimes.mjs';
import { VERSION } from '../src/paths.mjs';

const BIN = join(import.meta.dirname, '../bin/asdd.mjs');
const asdd = (...args) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', stdin: 'ignore' });

test('install options: flags, = and space values, one target', () => {
  const parseInstallArgs = (argv) => installOptions(parseCommand('install', argv));
  const o = parseInstallArgs(['app', '--dry-run', '--modules=http-api,web-ui', '--runtime', 'cursor', '--kit-dir', '/kit', '--skip-deps']);
  assert.equal(o.target, 'app');
  assert.equal(o.dryRun, true);
  assert.equal(o.skipDeps, true);
  assert.equal(o.modules, 'http-api,web-ui');
  assert.equal(o.runtimes, 'cursor');
  assert.equal(o.kitDir, '/kit');
  assert.throws(() => parseInstallArgs(['--nope']), /unknown option: --nope/);
  assert.throws(() => parseInstallArgs(['a', 'b']), /unexpected argument: b/);
  assert.throws(() => parseInstallArgs(['--modules']), /--modules needs a value/);
  assert.deepEqual(list(' a, ,b '), ['a', 'b']);
});

test('runtime names: aliases, none, unknown', () => {
  assert.deepEqual(runtimeNames('Cursor, claude-code,juni,none'), ['cursor', 'claude', 'junie']);
  assert.deepEqual(runtimeNames(''), []);
  assert.throws(() => runtimeNames('vim'), /unknown runtime: vim/);
});

test('project id: folder name in kebab case', () => {
  const root = mkdtempSync(join(tmpdir(), 'asdd-cli-'));
  try {
    const dir = join(root, 'My Shop_App');
    mkdirSync(dir);
    assert.equal(suggestProjectName(dir), 'my-shop-app');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('dispatch: version, help, unknown command, kit usage', () => {
  assert.equal(asdd('--version').stdout.trim(), VERSION);
  assert.match(asdd('help').stdout, /asdd install <dir>/);
  assert.match(asdd('help').stdout, /asdd repair/);
  const unknown = asdd('frobnicate');
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /unknown command: frobnicate/);
  assert.equal(asdd('kit', 'nope').status, 2);
  assert.equal(asdd('migrate', 'nope').status, 2);
});

test('parseCommand: registry flags through node:util parseArgs', async () => {
  const drift = parseCommand('drift', ['--json', '--base=main', '--slice', 'a', '--slice', 'b']);
  assert.equal(drift.values.json, true);
  assert.equal(drift.values.base, 'main');
  assert.deepEqual(drift.values.slice, ['a', 'b']);
  // A flag the script defaults stays undefined: the registry default only documents it.
  assert.equal(parseCommand('audit', []).values.since, undefined);
  const init = parseCommand('slice init', ['alpha', '--full']);
  assert.equal(init.args['slice-id'], 'alpha');
  assert.deepEqual(parseCommand('knowledge search', ['auth', 'flow', '--k', '3']).args.query, ['auth', 'flow']);
  assert.throws(() => parseCommand('drift', ['--nope']), (e) => e instanceof UsageError && /unknown option: --nope/.test(e.message));
  assert.throws(() => parseCommand('drift', ['--base']), /--base needs a value/);
  assert.throws(() => parseCommand('drift', ['--json=yes']), /--json takes no value/);
  assert.throws(() => parseCommand('slice init', []), /missing <slice-id>/);
  assert.throws(() => parseCommand('waves', ['extra']), /unexpected argument: extra/);
  // A string flag with a short alias: Node names it '-i, --interactive'; the message names the long flag.
  assert.throws(() => parseCommand('install', ['--kit-dir']), /Error: --kit-dir needs a value\n/);
});

test('review #13: help parity, hook command lines, and the installer layer', () => {
  // install: --help wins over a bad option, like every other command (main.mjs intercepts it).
  const help = asdd('install', '--bogus', '--help');
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Runtimes: .*claude/);
  // A direct run of the shared knowledge script prints its subcommand's help.
  const direct = spawnSync(process.execPath, [join(import.meta.dirname, '../src/harness/knowledge-query.mjs'), 'search', '--help'], { encoding: 'utf8' });
  assert.equal(direct.status, 0, direct.stderr);
  assert.match(direct.stdout, /asdd knowledge search <query>…/);
  // Parser-free hooks: the dispatcher validates their command line (REQ-002).
  for (const hook of ['gate', 'verify', 'span']) {
    const r = spawnSync(process.execPath, [BIN, hook, '--bogus'], { encoding: 'utf8', input: '{}' });
    assert.equal(r.status, 2, `${hook}: ${r.stderr}`);
    assert.match(r.stderr, /unknown option: --bogus/);
  }
  // observe is fail-open and silent (profiling design §12.3): a bad command line exits 0 with no stderr.
  const observe = spawnSync(process.execPath, [BIN, 'observe', 'claude', '--bogus'], { encoding: 'utf8', input: '{}' });
  assert.equal(observe.status, 0);
  assert.equal(observe.stderr, '');
  // Installer depends on Shared only (domain-layer.project.md): no Harness import under cli/src/install.
  for (const file of readdirSync(join(import.meta.dirname, '../src/install'))) {
    assert.doesNotMatch(readFileSync(join(import.meta.dirname, '../src/install', file), 'utf8'), /from '\.\.\/harness\//, file);
  }
});

test('help: generated per command, and asdd help <command>', () => {
  const drift = asdd('drift', '--help');
  assert.equal(drift.status, 0);
  assert.match(drift.stdout, /Usage:\n {2}asdd drift \[options\]/);
  assert.match(drift.stdout, /--slice <id> +check this slice \(repeatable\)/);
  assert.equal(asdd('help', 'slice', 'init').stdout, asdd('slice', 'init', '-h').stdout);
  assert.match(asdd('kit', 'build', '--help').stdout, /--obfuscate/);
  assert.match(asdd('doctor', '--help').stdout, /asdd doctor \[<dir>\] \[options\]/);
  assert.match(asdd('install', '--help').stdout, /Modules: .*http-api/);
  const bad = asdd('waves', '--nope');
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /unknown option: --nope\nusage: asdd waves \[options\]/);
  assert.equal(asdd('help', 'frobnicate').status, 2);
});

test('completion: bash, zsh, and fish scripts from the registry', () => {
  const bash = asdd('completion', 'bash');
  assert.equal(bash.status, 0);
  assert.match(bash.stdout, /complete -o default -F _asdd_complete asdd/);
  assert.match(bash.stdout, /drift\) words="--json --base --target --slice --requirements --pr-branch --pr-body --help -h"/);
  assert.match(bash.stdout, /init\) words="--full --hotfix --source-json --help -h"/);
  const syntax = spawnSync('bash', ['-n'], { input: bash.stdout, encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr);
  assert.match(asdd('completion', 'zsh').stdout, /bashcompinit/);
  assert.match(asdd('completion', 'fish').stdout, /complete -c asdd -n '__fish_seen_subcommand_from kit; and __fish_seen_subcommand_from build' -l obfuscate/);
  assert.equal(asdd('completion', 'tcsh').status, 2);
});

test('repair restores missing slice sessions, specs, and features', () => {
  const dir = mkdtempSync(join(tmpdir(), 'asdd-repair-'));
  try {
    mkdirSync(join(dir, '.harness/state/slices/broken'), { recursive: true });
    writeFileSync(
      join(dir, '.harness/state/registry.json'),
      `${JSON.stringify({ schema_version: '3.0', domain_model_version: '0.0.0', slices: [{ slice_id: 'broken', phase: 'implementation', status: 'in_progress', mode: 'lite' }] }, null, 2)}\n`,
    );
    const res = spawnSync(process.execPath, [BIN, 'repair', '--json'], { cwd: dir, encoding: 'utf8' });
    assert.equal(res.status, 0, res.stderr || res.stdout);
    const out = JSON.parse(res.stdout);
    assert.equal(out.ok, true);
    assert.ok(existsSync(join(dir, '.harness/state/slices/broken/sessions')));
    assert.ok(readdirSync(join(dir, '.harness/state/slices/broken/sessions')).some((n) => n.endsWith('.json')));
    assert.ok(existsSync(join(dir, '.harness/specs/broken/tasks.md')));
    assert.ok(existsSync(join(dir, '.harness/features/broken.features.json')));
    assert.ok(existsSync(join(dir, '.harness/state/registry.json')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('bin (REQ-014): in the kit, a dist/ older than src/ never runs (src/ does)', () => {
  const cli = join(import.meta.dirname, '..');
  const copy = mkdtempSync(join(tmpdir(), 'asdd-stale-'));
  try {
    for (const dir of ['bin', 'src']) cpSync(join(cli, dir), join(copy, dir), { recursive: true });
    writeFileSync(join(copy, 'package.json'), JSON.stringify({ version: VERSION }));
    // A dist/ stamped from other sources: its help says STALE.
    mkdirSync(join(copy, 'dist'));
    writeFileSync(join(copy, 'dist/main.mjs'), "export async function main() { console.log('STALE'); return 0; }\n");
    writeFileSync(join(copy, 'dist/build.json'), JSON.stringify({ sourceFingerprint: 'not-the-sources' }));
    const run = () => spawnSync(process.execPath, [join(copy, 'bin/asdd.mjs'), '--version'], { encoding: 'utf8' }).stdout.trim();
    assert.equal(run(), VERSION, 'a stale dist/ ran');
    // The same dist/ stamped with the current sources runs.
    writeFileSync(join(copy, 'dist/build.json'), JSON.stringify({ sourceFingerprint: fingerprint(join(copy, 'src')) }));
    assert.equal(run(), 'STALE', 'a current dist/ did not run');
    // The npm package (no src/) runs its dist/ without checking.
    rmSync(join(copy, 'src'), { recursive: true });
    writeFileSync(join(copy, 'dist/build.json'), JSON.stringify({ sourceFingerprint: 'other' }));
    assert.equal(run(), 'STALE');
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
});

test('pre-CLI form: a path or an option as first argument installs', () => {
  const missing = asdd('./does-not-exist', '--no-interactive', '--dry-run');
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /target not found: \.\/does-not-exist/);
  const noTarget = asdd('--no-interactive');
  assert.equal(noTarget.status, 1);
  assert.match(noTarget.stderr, /target directory required/);
});

test('doctor --json reports a directory without the kit', () => {
  const dir = mkdtempSync(join(tmpdir(), 'asdd-doctor-'));
  try {
    const res = asdd('doctor', dir, '--json');
    const out = JSON.parse(res.stdout);
    assert.equal(out.version, VERSION);
    assert.ok(out.checks.some((c) => c.id === 'project' && c.level === 'warn'));
    // Codegraph / Semgrep / gh: ok, warn, or fail when the project requires them.
    assert.ok(out.checks.some((c) => c.id === 'codegraph'));
    assert.ok(out.checks.some((c) => c.id === 'semgrep'));
    assert.ok(out.checks.some((c) => c.id === 'gh'));
    writeFileSync(join(dir, 'x'), '');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a global asdd hands harness commands to the project devDependency (node_modules/asdd-harness-kit)', () => {
  const root = mkdtempSync(join(tmpdir(), 'asdd-delegate-'));
  try {
    const app = join(root, 'app');
    mkdirSync(app);
    assert.equal(asdd('install', app, '--skip-deps', '--json').status, 0);
    assert.equal(existsSync(join(app, '.harness/cli')), false, 'install copied the CLI into the project');
    // A devDependency asdd that reports where and how it ran; this (global) CLI runs from a subfolder.
    const pkg = join(app, 'node_modules/asdd-harness-kit');
    mkdirSync(join(pkg, 'cli/bin'), { recursive: true });
    writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: 'asdd-harness-kit', version: VERSION }));
    writeFileSync(join(pkg, 'cli/bin/asdd.mjs'), "console.log('local asdd ran ' + process.argv.slice(2).join(' ') + ' in ' + process.cwd());\n");
    mkdirSync(join(app, 'src/deep'), { recursive: true });
    const res = spawnSync(process.execPath, [BIN, 'status'], { cwd: join(app, 'src/deep'), encoding: 'utf8' });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /local asdd ran status in .*app$/m);
    const doctor = JSON.parse(spawnSync(process.execPath, [BIN, 'doctor', app, '--json'], { encoding: 'utf8' }).stdout);
    assert.equal(doctor.checks.find((c) => c.id === 'cli').level, 'ok');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('without a devDependency, asdd must fit the kit the project installed', () => {
  const root = mkdtempSync(join(tmpdir(), 'asdd-fit-'));
  try {
    const app = join(root, 'app');
    mkdirSync(app);
    assert.equal(asdd('install', app, '--skip-deps', '--json').status, 0);
    const config = join(app, '.harness/config/project.json');
    const setKit = (version) => {
      const data = JSON.parse(readFileSync(config, 'utf8'));
      data.kit.version = version;
      writeFileSync(config, JSON.stringify(data, null, 2));
    };
    const run = (...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: app, encoding: 'utf8', input: '{"command":"ls"}' });
    const [major, minor] = VERSION.split('.').map(Number);
    // Another minor: runs, with a warning on stderr (stdout stays clean for --json); gate stays quiet.
    setKit(`${major}.${minor + 1}.0`);
    const status = run('status');
    assert.equal(status.status, 0, status.stderr);
    assert.match(status.stderr, /differs from the kit/);
    assert.doesNotMatch(status.stdout, /differs from the kit/);
    assert.equal(run('gate').stderr, '');
    // Another major: refuses, and says how to fix it.
    setKit(`${major + 1}.0.0`);
    const refused = run('check');
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /cannot run this project.*npm i -D asdd-harness-kit@/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('doctor: a project that requires codegraph fails without the binary', () => {
  const root = mkdtempSync(join(tmpdir(), 'asdd-cg-'));
  try {
    mkdirSync(join(root, '.harness/config'), { recursive: true });
    writeFileSync(join(root, '.harness/config/project.json'), JSON.stringify({ kit: {}, capabilities: { codegraph: { required: true } } }));
    const res = spawnSync(process.execPath, [BIN, 'doctor', root, '--json'], { encoding: 'utf8', env: { ...process.env, PATH: dirname(process.execPath) } });
    const out = JSON.parse(res.stdout);
    assert.equal(res.status, 1);
    assert.deepEqual(out.checks.find((c) => c.id === 'codegraph').level, 'fail');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('doctor: a project that requires semgrep fails without the binary', () => {
  const root = mkdtempSync(join(tmpdir(), 'asdd-sg-'));
  try {
    mkdirSync(join(root, '.harness/config'), { recursive: true });
    writeFileSync(join(root, '.harness/config/project.json'), JSON.stringify({ kit: {}, capabilities: { semgrep: { required: true } } }));
    const res = spawnSync(process.execPath, [BIN, 'doctor', root, '--json'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: dirname(process.execPath), HARNESS_SEMGREP: 'semgrep-not-installed' },
    });
    const out = JSON.parse(res.stdout);
    assert.equal(res.status, 1);
    assert.equal(out.checks.find((c) => c.id === 'semgrep').level, 'fail');
    assert.match(out.checks.find((c) => c.id === 'semgrep').detail, /capabilities\.semgrep\.required/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('doctor: a project that requires gh fails without the binary', () => {
  const root = mkdtempSync(join(tmpdir(), 'asdd-gh-'));
  try {
    mkdirSync(join(root, '.harness/config'), { recursive: true });
    writeFileSync(join(root, '.harness/config/project.json'), JSON.stringify({ kit: {}, capabilities: { gh: { required: true } } }));
    const res = spawnSync(process.execPath, [BIN, 'doctor', root, '--json'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: dirname(process.execPath), ASDD_GH: 'gh-not-installed' },
    });
    const out = JSON.parse(res.stdout);
    assert.equal(res.status, 1);
    assert.equal(out.checks.find((c) => c.id === 'gh').level, 'fail');
    assert.match(out.checks.find((c) => c.id === 'gh').detail, /capabilities\.gh\.required/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
