// `asdd install`: install or upgrade the kit in a project. The phases run in the order the kit has always used.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { CliError, isKit, KIT_REF, KIT_REMOTE, KIT_ROOT } from '../paths.mjs';
import { compareVersions } from '../semver.mjs';
import { c, info, isTty, log, ok, prompter, section, setQuiet, warn } from '../ui.mjs';
import { fileHash, InstallContext } from './context.mjs';
import { describe, ignoreReport } from './ignored.mjs';
import { enableModules, retireJev } from './modules.mjs';
import { INSTALL_HELP, list, MODULES, parseInstallArgs, RUNTIMES } from './options.mjs';
import { guardRuleCollisions } from './rule-collisions.mjs';
import { guardSkillCollisions } from './skill-collisions.mjs';
import { guardSteeringCollisions } from './steering-collisions.mjs';
import {
  installAgentsCore,
  installBindings,
  installDocsRoot,
  installHarnessScaffold,
  installPortableSteering,
  copyShipped,
  retireProjectCli,
  installProjectAdapter,
  kitVersion,
  installerBin,
  refreshSkillsIndex,
  removeModuleSources,
  removeRetiredKitFiles,
  removeRuntimeDocs,
} from './phases.mjs';
import { runtimeNames, wireRuntimes } from './runtimes.mjs';

/** The kit to install from: --from-git clones it, --kit-dir points at one, else the kit this CLI ships with. */
function resolveKit(o, cleanup) {
  if (o.fromGit) {
    info(`Cloning ${KIT_REMOTE} (${KIT_REF})`);
    if (o.dryRun && isKit(KIT_ROOT)) {
      info(`DRY-RUN from-git: using local kit ${KIT_ROOT}`);
      return KIT_ROOT;
    }
    const tmp = mkdtempSync(join(tmpdir(), 'asdd-kit.'));
    cleanup.push(() => rmSync(tmp, { recursive: true, force: true }));
    const res = spawnSync('git', ['clone', '--depth', '1', '--branch', KIT_REF, KIT_REMOTE, tmp], { stdio: ['ignore', 'ignore', 'inherit'] });
    if (res.status !== 0) throw new CliError(`git clone ${KIT_REMOTE} failed`);
    return tmp;
  }
  const kit = resolve(o.kitDir || KIT_ROOT);
  if (!isKit(kit)) throw new CliError(`not a kit checkout: ${kit}`);
  return kit;
}

const RUNTIME_DIRS = { cursor: '.cursor', claude: '.claude', opencode: '.opencode', kimi: '.kimi-code', junie: '.junie', devin: '.devin', kiro: '.kiro' };

const isDir = (p) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};

async function runInteractive(o, ask) {
  section('ASDD + Harness Kit Installer');
  log(c.dim('This wizard will guide you through installing the kit.'));
  const reply = await ask.ask('Target directory', process.cwd());
  if (!isDir(resolve(reply))) throw new CliError(`target not found: ${reply}`);
  o.target = resolve(reply);

  const existing = RUNTIMES.filter((r) => isDir(join(o.target, RUNTIME_DIRS[r]))).join(',');
  log('');
  if (existing) {
    info(`Detected existing runtime directories: ${existing}`);
    if (await ask.yes('Wire these runtimes?', 'y')) o.runtimes = existing;
  }
  if (!o.runtimes) o.runtimes = await ask.many('Select IDE runtimes to wire:', RUNTIMES);
  if (!o.runtimes) info('No runtimes selected — you can wire them later.');

  const mods = await ask.many('Select optional modules to enable:', MODULES);
  if (mods) o.modules = mods;
  else info('No modules selected — enable later with asdd install <target> --modules=<name>');

  if (!o.force && (await ask.yes('Force-refresh existing portable files (steering, agents, skills)?', 'n'))) o.force = true;
  log('');
  if (await ask.yes('Preview changes (dry-run) first?', 'n')) o.dryRun = true;
}

async function preflightChecks(o, ask) {
  section('Pre-flight checks');
  if (spawnSync('git', ['--version']).status !== 0) throw new CliError('Pre-flight checks failed: git is not installed');
  ok('git found');
  ok(`Node.js ${process.versions.node}`);
  if (existsSync(join(o.target, '.harness'))) {
    warn('Existing .harness/ detected in target');
    if (!o.force && (await ask.yes('Refresh existing portable files?', 'n'))) o.force = true;
  }
}

/**
 * The harness needs no npm packages in the project: node:sqlite is built into Node and semantic search is exact cosine.
 * Older kits installed sqlite-vec into .harness/ (package.json, package-lock.json, node_modules); those go, but only
 * while .harness/package.json is still the kit's (name asdd-harness-deps). The .gitignore lines the kit needs stay.
 */
function installHarnessIgnores(ctx) {
  const harness = join(ctx.target, '.harness');
  const hpkg = join(harness, 'package.json');
  // Recorded as managed, so deleting committed copies is not slice drift (DRIFT-01).
  for (const rel of ['package.json', 'package-lock.json']) ctx.recordManaged(join(harness, rel));
  if (readJson(hpkg)?.name === 'asdd-harness-deps') {
    for (const rel of ['node_modules', 'package-lock.json', 'package.json']) {
      if (existsSync(join(harness, rel))) ctx.remove(join(harness, rel), 'the harness needs no npm packages');
    }
    removeGitignoreLine(ctx, '.harness/node_modules');
  }
  ctx.ensureGitignore('.harness/knowledge');
  // raw learning signals are local; learn.mjs commits weekly summaries instead
  ctx.ensureGitignore('.harness/state/learning/signals');
  // integration keys (embeddings) are loaded from these files — never commit
  ctx.ensureGitignore('.env.local');
}

/**
 * Before anything is written: committed harness files a .gitignore rule hides stop the install, since they would never
 * reach the repository (other clones and CI run without them); --force installs anyway. Ignored runtime hook files
 * only warn.
 */
function checkIgnored(o) {
  const report = ignoreReport(o.target, runtimeNames(o.runtimes));
  if (report.harness.length) {
    const message = `the project's ignore rules hide harness files the team must commit: ${describe(report.harness)}. Remove those rules (git check-ignore -v <path> shows each), or pass --force to install anyway`;
    if (!o.force) throw new CliError(message);
    warn(message);
  }
  if (report.runtime.length) warn(`runtime hook files are ignored, so other clones run without the hooks: ${describe(report.runtime)}`);
}

/** Drop one exact line the kit added to the project's .gitignore. */
function removeGitignoreLine(ctx, line) {
  const gi = join(ctx.target, '.gitignore');
  if (!existsSync(gi)) return;
  const lines = readFileSync(gi, 'utf8').split('\n');
  if (!lines.includes(line)) return;
  log(`${c.yellow('GITIGNORE')}  - ${line}`);
  if (!ctx.dryRun) writeFileSync(gi, lines.filter((l) => l !== line).join('\n'));
}

/** Written when an install starts writing files and removed when they are all written: its presence means an interrupted install. */
export const INSTALLING_MARKER = '.harness/.installing';

const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

/**
 * installed-versions.json: the kit's versions, every kit-owned path, the hash of every kit file as written (so the
 * next install can tell a file the project changed), the hash of every seed, and the files this run left alone.
 */
function installVersionManifest(ctx) {
  if (ctx.dryRun) {
    log(`${c.dim('COPY')}  ${ctx.installedVersionsFile}`);
    return;
  }
  if (!existsSync(ctx.kitVersionsFile)) {
    warn('Kit version manifest not found — skipping version tracking');
    return;
  }
  const prev = readJson(ctx.installedVersionsFile) ?? {};
  const v = JSON.parse(readFileSync(ctx.kitVersionsFile, 'utf8'));
  v.managed_files = [...new Set([...(prev.managed_files || []), ...ctx.managed])].sort();
  const seeded = { ...(prev.seeded_files || {}) };
  for (const rel of ctx.seeded) {
    const hash = fileHash(join(ctx.target, rel));
    if (hash) seeded[rel] = hash;
  }
  v.seeded_files = Object.fromEntries(Object.entries(seeded).sort(([a], [b]) => a.localeCompare(b)));
  // A skipped file keeps the hash the kit wrote; a file from an earlier run (a module not passed this time) keeps its own.
  const kitFiles = {};
  for (const [rel, hash] of Object.entries(prev.kit_files || {})) {
    if (!ctx.kitFiles.has(rel) && existsSync(join(ctx.target, rel))) kitFiles[rel] = hash;
  }
  for (const rel of ctx.kitFiles) {
    const hash = ctx.skipped.includes(rel) ? ctx.kitHashes[rel] : fileHash(join(ctx.target, rel));
    if (hash) kitFiles[rel] = hash;
  }
  v.kit_files = Object.fromEntries(Object.entries(kitFiles).sort(([a], [b]) => a.localeCompare(b)));
  if (ctx.skipped.length) v.skipped_files = [...ctx.skipped].sort();
  mkdirSync(dirname(ctx.installedVersionsFile), { recursive: true });
  writeFileSync(ctx.installedVersionsFile, `${JSON.stringify(v, null, 2)}\n`);
  log(`${c.blue('COPY')}  ${ctx.installedVersionsFile}`);
}

function verify(ctx) {
  if (ctx.dryRun) {
    info('Skipping verify (dry-run)');
    return;
  }
  info('Verifying project configuration');
  if (ctx.run(process.execPath, [installerBin(ctx), 'check-config']) !== 0) throw new CliError('project configuration failed');
  info('Verifying harness invariants');
  if (ctx.run(process.execPath, [installerBin(ctx), 'check']) !== 0) throw new CliError('invariants failed');
}

function printSummary(ctx, previous) {
  section('Summary');
  ok(`Kit ${previous && previous !== ctx.version ? `upgraded ${previous} → ${ctx.version}` : ctx.version} installed into ${ctx.target}`);
  const { created, updated, kept, skipped } = ctx.stats;
  log(`  ${created} created, ${updated} updated, ${kept} unchanged, ${skipped} skipped`);
  if (skipped) {
    warn(`${skipped} kit file(s) changed in this project were left as they are:`);
    for (const rel of ctx.skipped) log(`       ${rel}`);
    log('     Keep your change, or take the kit version with: asdd install <dir> --force');
  }
  log('');
  log(c.bold('Installed:'));
  log('  • Portable steering contracts  → .harness/steering/');
  log('  • Agent definitions            → .agents/agents/');
  log('  • Skills catalog               → .agents/skills/');
  log('  • asdd                         → not copied: npm i -D asdd-harness-kit (pinned per project) or npm i -g asdd-harness-kit');
  log('  • Project adapter              → .harness/config/project.json');
  log('  • Agent tier guidance          → .harness/config/models.json (agents use model: inherit)');
  const runtimes = ctx.runtimes && ctx.runtimes !== 'none' ? ctx.runtimes : '';
  if (runtimes) log(`  • Runtime wiring               → ${runtimes}`);
  if (ctx.modules) log(`  • Modules enabled              → ${ctx.modules}`);
  log('');
  log(c.bold('Next steps:'));
  log('  1. Fill bindings (if still stubs):');
  for (const f of ['product.md', 'structure.md', 'tech.md', 'domain-layer.project.md', 'quality-gates.project.md']) log(`       .harness/steering/${f}`);
  log('  2. Read AGENTS.md');
  log('  3. Start Discovery: .harness/specs/<slice>/intent.md');
  log('  4. Check the install any time: asdd doctor');
  if (runtimes) {
    log('');
    log(c.dim('Runtime-specific notes:'));
    log("  Agents use model: inherit (they run on the invoking session's model).");
    log('  Review .harness/config/models.json for tier rationale.');
    if (runtimes.includes('cursor')) log('  Cursor:  verify-on-stop + command-gate hooks active in .cursor/hooks.json');
    if (runtimes.includes('claude')) {
      log('  Claude:  .claude/settings.json PreToolUse(Bash)+Stop hooks');
      log('  Claude:  read CLAUDE.md for session instructions');
    }
    if (runtimes.includes('opencode')) log('  OpenCode: config written to opencode.json');
  }
  if (ctx.dryRun) {
    log('');
    warn('This was a dry-run. Re-run without --dry-run to apply.');
  }
}

/** The kit version the project has now (project.json kit.version), or null. */
export const installedKitVersion = (target) => readJson(join(target, '.harness/config/project.json'))?.kit?.version ?? null;

/**
 * Refuse what would leave the project worse off: an interrupted install (its marker is still there) and an older kit
 * than the one installed. --force passes both, after the person has looked.
 */
function guard(o, version) {
  const previous = installedKitVersion(o.target);
  if (o.force) return previous;
  if (existsSync(join(o.target, INSTALLING_MARKER))) {
    throw new CliError(
      `an earlier install was interrupted (${INSTALLING_MARKER} is still there). Review the project (git status), then re-run with --force to finish it, or remove the marker.`,
    );
  }
  if (previous && compareVersions(previous, version) > 0) {
    throw new CliError(
      `the project has asdd-harness-kit ${previous}, newer than this CLI (${version}). Use npx asdd-harness-kit@${previous}, or pass --force to downgrade.`,
    );
  }
  return previous;
}

const real = (p) => {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
};

/**
 * The kit installing itself: like a project, its .harness/ gets copies from cli/ — the portable steering and
 * templates, the config schema, models.json, versions.json, and folder READMEs — plus the project.json commands, the
 * skills index, and the checks. The CLI is not copied: the kit runs cli/ itself (node cli/bin/asdd.mjs). Only those copies are recorded in installed-versions.json,
 * so the kit's sources (cli/, .agents/, tools/) stay under spec drift. Runtimes are wired only when asked for.
 */
function selfInstall(ctx) {
  section('Installing asdd-harness-kit into itself');
  log(`${c.dim('Kit:')}    ${ctx.kit} (${ctx.version})`);
  // The sources are cli/: a copy that differs is refreshed whatever the version says.
  ctx.force = true;
  // Kit repo keeps its MCP tools under tools/ and usually already has Cursor wired.
  if (!ctx.runtimes && existsSync(join(ctx.target, '.cursor'))) ctx.runtimes = 'cursor';
  guardSkillCollisions(ctx);
  guardSteeringCollisions(ctx);
  guardRuleCollisions(ctx);
  retireProjectCli(ctx);
  copyShipped(ctx);
  removeRetiredKitFiles(ctx);
  retireJev(ctx);
  installProjectAdapter(ctx);
  refreshSkillsIndex(ctx);
  // The skills index is generated from the skills: the regenerated copy is the source's new content.
  const index = join(ctx.target, '.harness/steering/skills.md');
  const source = join(ctx.kit, 'cli/steering/skills.md');
  if (!ctx.dryRun && existsSync(index) && readFileSync(index, 'utf8') !== readFileSync(source, 'utf8')) {
    writeFileSync(source, readFileSync(index));
    log(`${c.blue('INDEX')} cli/steering/skills.md (skills index regenerated)`);
  }
  wireRuntimes(ctx);
  installHarnessIgnores(ctx);
  installVersionManifest(ctx);
  if (!ctx.dryRun) verify(ctx);
  const { created, updated } = ctx.stats;
  ok(`The kit .harness/ is installed from cli/ (${created} created, ${updated} updated); it runs node cli/bin/asdd.mjs`);
  return { ok: true, self: true, dryRun: Boolean(ctx.dryRun), target: ctx.target, kit: ctx.kit, version: ctx.version, previous: null, runtimes: ctx.runtimes || '', modules: '', files: ctx.stats, skipped: [] };
}

/**
 * Install the kit from `kit` into `o.target` (resolved). Every phase, in the order the kit has always used.
 * @returns {object} the result `--json` prints
 */
export function runInstall(o, kit) {
  const ctx = new InstallContext({ ...o, kit });
  ctx.version = kitVersion(kit);
  ctx.self = real(o.target) === real(kit);
  // Bad arguments fail before anything is written (no half-done install, no leftover marker).
  for (const m of o.modules === 'all' ? [] : list(o.modules)) {
    if (!MODULES.includes(m)) {
      throw new CliError(
        m === 'jev'
          ? 'jev is not an installable module: Jev is only the jev-gate MCP server in the kit repo (clone https://github.com/eencinasq/asdd-harness-kit and see tools/jev-gate/README.md)'
          : `unknown module: ${m} (${MODULES.join('|')})`,
      );
    }
  }
  runtimeNames(o.runtimes);
  if (ctx.self) return selfInstall(ctx);
  checkIgnored(o);
  const previous = guard(o, ctx.version);
  section('Installing asdd-harness-kit');
  log(`${c.dim('Kit:')}    ${kit} (${ctx.version})`);
  log(`${c.dim('Target:')} ${o.target}${previous ? ` (has ${previous})` : ''}`);
  if (ctx.dryRun) log(`${c.dim('Mode:')}   dry-run`);

  // Reads only target state: runs before the marker so a collision halt leaves nothing behind.
  guardSkillCollisions(ctx);
  guardSteeringCollisions(ctx);
  guardRuleCollisions(ctx);
  const marker = join(o.target, INSTALLING_MARKER);
  if (!ctx.dryRun) {
    mkdirSync(dirname(marker), { recursive: true });
    writeFileSync(marker, `asdd install ${ctx.version} started ${new Date().toISOString()}\n`);
  }
  installPortableSteering(ctx);
  installBindings(ctx);
  installHarnessScaffold(ctx);
  installProjectAdapter(ctx);
  installAgentsCore(ctx);
  removeRetiredKitFiles(ctx);
  removeRuntimeDocs(ctx);
  removeModuleSources(ctx);
  installDocsRoot(ctx);
  retireJev(ctx);
  enableModules(ctx);
  refreshSkillsIndex(ctx);
  wireRuntimes(ctx);
  installHarnessIgnores(ctx);
  installVersionManifest(ctx);
  // Every file is written: a failing check below is the project's state, not an interrupted install.
  if (!ctx.dryRun) rmSync(marker, { force: true });
  verify(ctx);
  printSummary(ctx, previous);
  return {
    ok: true,
    dryRun: Boolean(ctx.dryRun),
    target: o.target,
    kit,
    version: ctx.version,
    previous,
    runtimes: ctx.runtimes || '',
    modules: ctx.modules || '',
    files: ctx.stats,
    skipped: ctx.skipped,
  };
}

/** @returns {Promise<number>} exit status */
export async function install(argv) {
  const o = parseInstallArgs(argv);
  if (o.help) {
    process.stdout.write(INSTALL_HELP);
    return 0;
  }
  if (o.json) {
    setQuiet(true);
    try {
      if (o.interactive) throw new CliError('--json does not prompt: pass the target and options');
      o.noInteractive = true;
      const result = await installOnce(o);
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return 0;
    } catch (error) {
      process.stdout.write(`${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error), ...(error?.problems ? { problems: error.problems } : {}) })}\n`);
      return error instanceof CliError ? error.code : 1;
    }
  }
  await installOnce(o);
  return 0;
}

async function installOnce(o) {
  if (!o.noInteractive && !o.target && !o.interactive) {
    if (!isTty()) {
      process.stdout.write(INSTALL_HELP);
      throw new CliError('target directory required (or use --interactive in a TTY)');
    }
    o.interactive = true;
  }
  if (o.pr && o.interactive) throw new CliError('--pr does not prompt: pass the target and options');

  const cleanup = [];
  const ask = o.interactive ? prompter() : null;
  try {
    const kit = resolveKit(o, cleanup);
    if (o.interactive) await runInteractive(o, ask);
    if (!o.target) {
      if (!o.json) process.stdout.write(INSTALL_HELP);
      throw new CliError('target directory required');
    }
    if (!isDir(resolve(o.target))) throw new CliError(`target not found: ${o.target}`);
    o.target = resolve(o.target);

    if (o.interactive) {
      await preflightChecks(o, ask);
      log('');
      if (!(await ask.yes('Proceed with installation?', 'y'))) {
        info('Aborted.');
        return { ok: true, aborted: true };
      }
    }
    ask?.close();
    if (o.pr) {
      const { installWithPr } = await import('./pr.mjs');
      return installWithPr(o, kit, runInstall);
    }
    return runInstall(o, kit);
  } finally {
    ask?.close();
    for (const fn of cleanup) fn();
  }
}
