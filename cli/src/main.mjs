// The `asdd` command line: the harness commands agents, skills, and hooks run in a project, plus install, doctor,
// and the kit's own maintenance commands (those need the full CLI: the kit or its npm package).
import { spawn } from 'node:child_process';
import { constants } from 'node:os';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { HARNESS_COMMANDS, resolveHarnessCommand } from './harness/commands.mjs';
import { CLI_ROOT, CliError, HARNESS_DIR, IS_FULL, isKit, VERSION } from './paths.mjs';
import { localAsdd, projectKitVersion, versionFit } from './pin.mjs';
import { err } from './ui.mjs';

const harnessHelp = () =>
  Object.entries(HARNESS_COMMANDS)
    .flatMap(([name, e]) => (e.sub ? Object.entries(e.sub).map(([s, x]) => [`${name} ${s}`, x.help]) : [[name, e.help]]))
    .map(([name, help]) => `  asdd ${name.padEnd(18)} ${help}`)
    .join('\n');

export const HELP = () => `asdd ${VERSION}: ASDD + Harness Engineering kit

Harness (in a project; agents, skills, and hooks run these):
${harnessHelp()}

Install and check:
  asdd install <dir> [options]        install or upgrade the kit (asdd install --help for every option)
  asdd install --interactive          the same, as a wizard
  asdd install <dir> --pr             the same on a new branch, as a pull request (git + gh)
  asdd uninstall [dir] [--dry-run] [--json]   remove what install added and the project did not change
  asdd doctor [dir] [--json]          check Node, git, npm, codegraph, semgrep, gh, and the project's install

Kit development (in the kit repo):
  asdd kit versions [bump <version>]  regenerate cli/versions.json (what install ships, by version)
  asdd kit build [--obfuscate] [--check]  compile cli/src → cli/dist (projects and npm ship dist only)
  asdd kit vendor [--check]           copy cli/src/harness libs into tools/*/src/harness
  asdd kit guidance [--only a,b] [dir]  stale guidance, cutoffs, steering budget, test asserts
  asdd kit skills-lint [--only a,b] [dir]  skill grammar (S-*), fleet routing (SL-*), rule size (R-004/005)
  asdd kit agents-lint [--only a,b] [dir]  agent grammar (A-*), tier/capability envelope and handoffs (AL-*)
  asdd kit self [--check]             copy what cli/ ships into the kit's own .harness/ (--check: fail while stale)

Other:
  asdd --version | help

In a project: npm i -D asdd-harness-kit (pinned by the lockfile; a global asdd hands commands to it) or npm i -g asdd-harness-kit.
Install and upgrade with npx: npx asdd-harness-kit install <dir>  (or npx github:eencinasq/asdd-harness-kit install <dir>)
`;

const KIT_COMMANDS = {
  versions: './kit/versions.mjs',
  build: './kit/build.mjs',
  vendor: './kit/vendor.mjs',
  guidance: './kit/guidance.mjs',
  'skills-lint': './kit/skills-lint.mjs',
  'agents-lint': './kit/agents-lint.mjs',
  self: './kit/self.mjs',
};
const FULL_ONLY = ['install', 'uninstall', 'kit'];

/** The project the command runs on: the nearest folder up from `cwd` that has .harness/, else `cwd`. */
export function projectRoot(cwd = process.cwd()) {
  for (let dir = resolve(cwd); ; dir = dirname(dir)) {
    if (existsSync(join(dir, '.harness'))) return dir;
    if (dirname(dir) === dir) return resolve(cwd);
  }
}

const real = (p) => {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
};

/** Signals passed on to a delegated asdd, so a hook timeout or Ctrl-C that reaches this one also stops it. */
const FORWARDED = ['SIGINT', 'SIGTERM', 'SIGHUP'];

/** Runs `bin` with this terminal (hooks read their payload from stdin); resolves its exit status (128+signal if killed). */
function delegate(bin, args, cwd) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [bin, ...args], { cwd, stdio: 'inherit', env: { ...process.env, ASDD_DELEGATED: '1' } });
    const forward = (signal) => child.kill(signal);
    for (const s of FORWARDED) process.on(s, forward);
    const finish = (code) => {
      for (const s of FORWARDED) process.off(s, forward);
      done(code);
    };
    child.on('error', () => finish(1));
    child.on('exit', (code, signal) => finish(code ?? 128 + (constants.signals[signal] ?? 0)));
  });
}

/**
 * A harness command runs on the project root. Projects get no copy of the CLI: when the project installed asdd as a
 * devDependency and this is another asdd (a global one), the project's runs it, so every developer and hook gets the
 * version its lockfile pinned. Otherwise this asdd must fit the kit the project installed (another major refuses).
 * The script then runs in this process (no second node start: hooks run on every shell command).
 * @returns {Promise<number | undefined>} an exit status, or undefined when the script set its own
 */
async function runHarness(args) {
  const command = resolveHarnessCommand(args);
  if (command.error) throw new CliError(command.error, 2);
  const root = projectRoot();
  if (!process.env.ASDD_DELEGATED && !isKit(root)) {
    const local = localAsdd(root);
    if (local && real(local.bin) !== real(join(CLI_ROOT, 'bin/asdd.mjs'))) return delegate(local.bin, args, root);
    const fit = versionFit(VERSION, projectKitVersion(root));
    if (fit.level === 'fail') throw new CliError(fit.message);
    // The hooks' stderr is what the runtime shows: keep gate and verify quiet.
    // stderr: stdout may be JSON (asdd drift --json).
    if (fit.level === 'warn' && !['gate', 'verify'].includes(args[0])) process.stderr.write(`⚠ ${fit.message}\n`);
  }
  const script = join(HARNESS_DIR, command.script);
  if (!existsSync(script)) {
    throw new CliError(
      command.module
        ? `the ${command.module} module is not installed in this project: asdd install . --modules=${command.module}`
        : `this asdd copy has no ${command.script}; reinstall it: npx asdd-harness-kit install .`,
    );
  }
  process.chdir(root);
  // The scripts read process.argv like a direct `node <script> …` run, and run their CLI on import.
  process.argv = [process.argv[0], script, ...command.argv];
  await import(pathToFileURL(script).href);
  return undefined;
}

async function kit([name, ...args]) {
  if (!KIT_COMMANDS[name]) throw new CliError(`usage: asdd kit versions|build|vendor|guidance|skills-lint|agents-lint|self [options] (got ${name ?? 'nothing'})`, 2);
  const { run } = await import(KIT_COMMANDS[name]);
  return run(args);
}

/** @returns {Promise<number | undefined>} exit status (undefined: a harness script set its own) */
export async function main(argv) {
  let [command, ...args] = argv;
  try {
    if (!command || command === 'help' || command === '--help' || command === '-h') {
      process.stdout.write(HELP());
      return 0;
    }
    if (command === '--version' || command === '-v' || command === 'version') {
      process.stdout.write(`${VERSION}\n`);
      return 0;
    }
    if (Number(process.versions.node.split('.')[0]) < 22) throw new CliError(`asdd needs Node.js 22 or newer (found ${process.versions.node})`);
    if (HARNESS_COMMANDS[command]) return await runHarness([command, ...args]);
    const known = ['install', 'uninstall', 'doctor', 'kit'];
    // `npx asdd-harness-kit <dir> [options]` and `--interactive` (the pre-CLI form) still install.
    if (!known.includes(command) && (command.startsWith('-') || !/^[a-z-]+$/.test(command))) {
      args = [command, ...args];
      command = 'install';
    }
    if (FULL_ONLY.includes(command) && !IS_FULL) {
      throw new CliError(`asdd ${command} comes with the full asdd-harness-kit package: npx asdd-harness-kit ${command} …`, 2);
    }
    switch (command) {
      case 'install': {
        const { install } = await import('./install/index.mjs');
        return await install(args);
      }
      case 'uninstall': {
        const { uninstall } = await import('./uninstall.mjs');
        return uninstall(args);
      }
      case 'doctor': {
        const { doctor } = await import('./doctor.mjs');
        return doctor(args);
      }
      case 'kit':
        return await kit(args);
      default:
        throw new CliError(`unknown command: ${command} (run: asdd help)`, 2);
    }
  } catch (error) {
    if (!(error instanceof CliError)) throw error;
    err(error.message);
    return error.code;
  }
}

export const BIN = fileURLToPath(new URL('../bin/asdd.mjs', import.meta.url));
