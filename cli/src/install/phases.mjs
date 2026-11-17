// The install phases that lay down the kit: steering, bindings, harness scripts, project.json, agents, MCP, docs.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { CliError, KIT_REF, KIT_REMOTE, TEMPLATES } from '../paths.mjs';
import { c, info, log, warn } from '../ui.mjs';
import { filesUnder, isSymlink, previousManaged } from './context.mjs';
import { registryFiles, retiredPaths } from './registry.mjs';

/** Where the shipped steering lives in the kit: the CLI. The kit's own .harness/steering holds only its bindings (and links). */
export const STEERING_SOURCE = 'cli/steering';
const KIT_ROOT = join(import.meta.dirname, '../../..');
/**
 * Portable steering = the top-level files of cli/steering (templates/ ships via copyTree below). The directory is
 * the source of truth: a new file installs by existing — the old hardcoded list could silently omit it (G-8).
 */
const STEERING = Object.freeze(
  readdirSync(join(KIT_ROOT, STEERING_SOURCE), { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .sort(),
);
/**
 * File-level install rows come from the registry (`files` section) — the single enumeration SoT. Derived views
 * keep the old export shapes so consumers don't change: refresh rows install kit-owned, create rows seed
 * project-owned, seeded rows are written once inline, and `self` rows join the kit's own self-copy set.
 */
const FILES = registryFiles(KIT_ROOT);
const REFRESH_FILES = FILES.filter((f) => f.install === 'refresh');
export const HARNESS_FILES = REFRESH_FILES.filter((f) => !f.dest.startsWith('.agents/')).map((f) => [f.dest, f.src]);
const AGENTS_REFRESH_FILES = REFRESH_FILES.filter((f) => f.dest.startsWith('.agents/'));
const SCAFFOLD_CREATE_FILES = FILES.filter((f) => f.install === 'create' && f.dest.startsWith('.harness/') && f.class !== 'binding');
const DOCS_CREATE_FILES = FILES.filter((f) => f.install === 'create' && !f.dest.startsWith('.harness/') && f.class !== 'binding');
const BINDING_FILES = FILES.filter((f) => f.class === 'binding');
/** READMEs of the project's own folders: written once, then the project's. */
const FOLDER_READMES = FILES.filter((f) => f.install === 'seeded')
  .map((f) => f.dest.slice('.harness/'.length, -'/README.md'.length));

/**
 * What the kit repo copies into its own .harness/ when it installs itself (project path → source): the files a
 * project receives, so the kit's agents and checks read exactly what ships.
 */
export const SELF_COPIES = [
  ...STEERING.map((f) => [`.harness/steering/${f}`, `${STEERING_SOURCE}/${f}`]),
  ...FILES.filter((f) => f.self).map((f) => [f.dest, f.src]),
];

/** Copy one registry file row: dirs go through copyTree, files through copyFile; `optional` rows skip missing srcs. */
function installFileRow(ctx, f, policy) {
  const src = join(ctx.kit, f.src);
  if (f.optional && !existsSync(src)) return;
  const dest = join(ctx.target, f.dest);
  if (statSync(src).isDirectory()) ctx.copyTree(src, dest, policy);
  else ctx.copyFile(src, dest, policy);
}

export function installPortableSteering(ctx) {
  for (const f of STEERING) ctx.copyFile(join(ctx.kit, STEERING_SOURCE, f), join(ctx.target, '.harness/steering', f), 'refresh');
}

/** Binding stubs live in cli/templates/bindings: the kit's own .harness/steering bindings describe the kit itself and never ship. */
export function installBindings(ctx) {
  if (ctx.skipBindings) {
    info('Skipping bindings');
    return;
  }
  for (const f of BINDING_FILES) {
    const src = join(ctx.kit, f.src);
    const dest = join(ctx.target, f.dest);
    if (ctx.forceBindings) ctx.forced(() => ctx.copyFile(src, dest, 'refresh'));
    else ctx.copyFile(src, dest, 'create');
  }
}

const isTest = (rel) => /\.(test|spec)\./.test(rel);

/** The kit repo runs its own cli/ (node cli/bin/asdd.mjs): its hooks and commands point there. */
export const KIT_BIN = 'cli/bin/asdd.mjs';
/** Older kits copied the CLI into each project here. asdd is a Node package now (a devDependency, or global). */
export const LEGACY_PROJECT_CLI = '.harness/cli';
export const LEGACY_PROJECT_BIN = `${LEGACY_PROJECT_CLI}/bin/asdd.mjs`;

/**
 * How a project's hooks run asdd, with nothing of the CLI in the project: the project's devDependency
 * (node_modules/.bin/asdd) first, else a global asdd on the PATH. Neither installed fails (closed) with how to install.
 */
export const projectAsdd = (verb) =>
  `b=node_modules/.bin/asdd; [ -x "$b" ] || b=asdd; command -v "$b" >/dev/null 2>&1 || { echo "asdd is not installed: npm i -D asdd-harness-kit (or npm i -g asdd-harness-kit)" >&2; exit 2; }; exec "$b" ${verb}`;

/**
 * Claude Code runs hooks in the session's current directory, which can be a subfolder; asdd and the kit's relative
 * cli/bin path need the project root. Claude Code sets CLAUDE_PROJECT_DIR for hooks (fallback: the current directory).
 */
export const CLAUDE_ROOT_CD = 'cd "${CLAUDE_PROJECT_DIR:-.}"';

/** A Claude Code hook command that starts at the project root; `onFail` is the exit code when that cd fails. */
export const claudeHook = (command, onFail = 2) =>
  String(command).startsWith(CLAUDE_ROOT_CD) ? command : `${CLAUDE_ROOT_CD} || exit ${onFail}; ${command}`;

/** The command a target's hooks run for `verb`: the resolver in a project, cli/ in the kit repo. */
export const asddCommand = (ctx, verb) => (ctx.self ? `node ${KIT_BIN} ${verb}` : projectAsdd(verb));

/**
 * The load hook (`asdd observe <runtime>`), fail-open unlike the gate resolver: asdd missing, failing, or slow, the
 * command prints nothing and exits 0 (a Claude Code hook exiting 2 reaches the model). Only Claude Code gets one:
 * Cursor is hookless for guidance loads (D-3, cli/test/fixtures/telemetry/cursor/README.md).
 */
export const observeCommand = (ctx, runtime) =>
  ctx.self
    ? `node ${KIT_BIN} observe ${runtime} >/dev/null 2>&1; exit 0`
    : `b=node_modules/.bin/asdd; [ -x "$b" ] || b=asdd; command -v "$b" >/dev/null 2>&1 && "$b" observe ${runtime} >/dev/null 2>&1; exit 0`;

/** The asdd the installer itself runs on the target (checks, skills index): this kit's, never one the project had. */
export const installerBin = (ctx) => join(ctx.kit, KIT_BIN);

/**
 * Projects get no copy of the CLI. An install by an older kit left one in .harness/cli/ (and before that the harness
 * in .harness/scripts/): both go, so the project runs the asdd package it installs. The dir goes only when it is
 * provably the kit's copy (managed files, or the bin/asdd.mjs signature) — a project's own .harness/cli/ is kept.
 */
export function retireProjectCli(ctx) {
  const dest = join(ctx.target, LEGACY_PROJECT_CLI);
  if (existsSync(dest) || isSymlink(dest)) {
    if (provablyKitOwned(ctx, LEGACY_PROJECT_CLI) || existsSync(join(dest, 'bin/asdd.mjs'))) {
      // Recorded as managed, so deleting the committed copy is not slice drift (DRIFT-01).
      ctx.recordManaged(join(dest, 'bin/asdd.mjs'));
      ctx.remove(dest, ctx.self ? 'the kit runs cli/ directly' : 'asdd is a Node package now: npm i -D asdd-harness-kit (or -g)');
    } else {
      warn(`${dest} is not recorded as the kit's CLI copy — kept for manual reconciliation`);
    }
  }
  if (!ctx.self) removeLegacyScripts(ctx);
}

/**
 * The kit repo: its .harness/ gets copies of the steering and skeleton the CLI ships, like any project, so the kit's
 * agents and checks read exactly what ships. The sources stay in cli/; `asdd kit self --check` fails while a copy is stale.
 */
export function copyShipped(ctx) {
  for (const [rel, src] of SELF_COPIES) {
    const path = join(ctx.target, rel);
    unlinkLegacyLink(ctx, path);
    if (statSync(join(ctx.kit, src)).isDirectory()) ctx.copyTree(join(ctx.kit, src), path, 'refresh');
    else ctx.copyFile(join(ctx.kit, src), path, 'refresh');
  }
}

/** Earlier kit self-installs linked these paths into cli/; a copy replaces the link. */
function unlinkLegacyLink(ctx, path) {
  if (!isSymlink(path)) return;
  log(`${c.yellow('FIX')}   ${path} (link → copy)`);
  if (!ctx.dryRun) unlinkSync(path);
}

/** The kit's files in .harness/scripts/ (before the CLI): removed on upgrade; a project's own script there stays. */
function removeLegacyScripts(ctx) {
  const legacy = join(ctx.target, '.harness/scripts');
  const kitNames = new Set([
    // The npm package ships cli/dist only; a kit checkout has cli/src (same names).
    ...['cli/src/harness', 'cli/dist/harness']
      .filter((dir) => existsSync(join(ctx.kit, dir)))
      .flatMap((dir) => filesUnder(join(ctx.kit, dir)))
      .filter((rel) => !isTest(rel)),
    'jev-command-gate.mjs',
    'knowledge-store-kuzu.mjs',
    // The Jev gates left the harness (the jev-gate MCP server owns them now).
    'jev-client.mjs',
    'jev-gates.mjs',
  ]);
  if (!existsSync(legacy) || !statSync(legacy).isDirectory()) return;
  const managed = previousManaged(ctx.installedVersionsFile);
  const own = [];
  for (const rel of filesUnder(legacy)) {
    const proven = managed?.has(`.harness/scripts/${rel}`) === true;
    if ((kitNames.has(rel) || isTest(rel)) && proven) {
      // Recorded as managed, so deleting a committed copy is not slice drift (DRIFT-01).
      ctx.recordManaged(join(legacy, rel));
      ctx.remove(join(legacy, rel), 'the harness runs from the asdd package now');
    } else {
      own.push(rel);
    }
  }
  if (ctx.dryRun) return;
  if (!own.length) {
    rmSync(legacy, { recursive: true, force: true });
    return;
  }
  warn(`.harness/scripts/ keeps files that are not the kit's: ${own.join(', ')}`);
  // Folders the kit's files leave empty (validators/) go too.
  const prune = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) if (e.isDirectory()) prune(join(dir, e.name));
    if (dir !== legacy && !readdirSync(dir).length) rmdirSync(dir);
  };
  prune(legacy);
}

export function installHarnessScaffold(ctx) {
  const { kit, target } = ctx;
  retireProjectCli(ctx);
  // Examples only: the target's .github/ is never touched (their rows are refresh but self:false)
  for (const f of REFRESH_FILES) if (!f.dest.startsWith('.agents/')) installFileRow(ctx, f, 'refresh');
  for (const f of SCAFFOLD_CREATE_FILES) ctx.copyFile(join(kit, f.src), join(target, f.dest), 'create');

  for (const d of FOLDER_READMES) {
    const dir = join(target, '.harness', d);
    if (ctx.dryRun) {
      log(`${c.dim('DIR')}   ${dir}`);
      continue;
    }
    mkdirSync(dir, { recursive: true });
    const readme = join(kit, 'cli/scaffold', d, 'README.md');
    if (!existsSync(join(dir, 'README.md')) && existsSync(readme)) {
      writeFileSync(join(dir, 'README.md'), readFileSync(readme));
      log(`${c.blue('COPY')}  ${join(dir, 'README.md')}`);
      ctx.seeded.push(ctx.rel(join(dir, 'README.md')));
    }
  }
}

export function kitVersion(kit) {
  try {
    return JSON.parse(readFileSync(join(kit, 'package.json'), 'utf8')).version || '0.0.0-dev';
  } catch {
    return '0.0.0-dev';
  }
}

/** The project id: the origin repository's name, else the folder name in kebab case. */
export function suggestProjectName(target) {
  let name = '';
  if (existsSync(join(target, '.git'))) {
    const res = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: target, encoding: 'utf8' });
    name = /\/([^/]*)\.git$/.exec(res.stdout?.trim() ?? '')?.[1] ?? '';
  }
  if (!name) name = basename(target).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return name || 'project';
}

/** project.json `commands`: what people and CI run (the asdd package; `node cli/bin/asdd.mjs` in the kit repo). */
const commandsFor = (asdd) => ({
  invariants: `${asdd} check`,
  verify_on_stop: `${asdd} verify`,
  spec_drift: `${asdd} drift`,
});
export const projectCommands = (ctx) => commandsFor(ctx.self ? `node ${KIT_BIN}` : 'asdd');
export const PROJECT_COMMANDS = commandsFor('asdd');
const LEGACY_COMMANDS = {
  invariants: 'node .harness/scripts/check-invariants.mjs',
  verify_on_stop: 'node .harness/scripts/verify-on-stop.mjs',
  spec_drift: 'node .harness/scripts/check-spec-drift.mjs',
};

export function installProjectAdapter(ctx) {
  const config = join(ctx.target, '.harness/config/project.json');
  ctx.recordManaged(config);
  const version = kitVersion(ctx.kit);
  const installedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  if (existsSync(config)) {
    log(`${c.blue('MERGE')}  ${config} (kit.version + kit.installed_at)`);
    if (ctx.dryRun) return;
    ctx.patchJson(config, (data) => {
      data.kit ??= {};
      data.kit.version = version;
      data.kit.installed_at = installedAt;
      // Seed required capability keys missing from older installs — never overwrite
      data.capabilities ??= {};
      data.capabilities.codegraph ??= { enabled: false, required: false };
      // Orca was never wired: drop the kit's seeded block (a project-customized one stays).
      const orca = data.capabilities.orca;
      if (orca && orca.enabled === false && orca.experimental === true && Object.keys(orca).length === 2) delete data.capabilities.orca;
      // Commands still at a pre-CLI kit default move to the CLI; a project's own command stays.
      data.commands ??= {};
      // Kit defaults (pre-CLI, project copy, kit repo) follow the target's asdd; anything else is the project's.
      const defaults = [LEGACY_COMMANDS, commandsFor(`node ${LEGACY_PROJECT_BIN}`), commandsFor(`node ${KIT_BIN}`), commandsFor('asdd')];
      for (const [key, command] of Object.entries(projectCommands(ctx))) {
        if (!data.commands[key] || defaults.some((d) => d[key] === data.commands[key])) data.commands[key] = command;
      }
    });
    return;
  }

  log(`${c.blue('CREATE')} ${config}`);
  if (ctx.dryRun) return;
  mkdirSync(dirname(config), { recursive: true });
  const project = {
    schema_version: '1.0',
    project_id: suggestProjectName(ctx.target),
    kit: { name: 'asdd-harness-kit', source: KIT_REMOTE, ref: KIT_REF, version, installed_at: installedAt },
    harness_version: version,
    mode: 'full',
    bindings_complete: false,
    paths: {
      steering: '.harness/steering',
      specs: '.harness/specs',
      state: '.harness/state',
      features: '.harness/features',
      progress_index: '.harness/PROGRESS.md',
    },
    bindings: {
      product: '.harness/steering/product.md',
      structure: '.harness/steering/structure.md',
      tech: '.harness/steering/tech.md',
      domain_layer: '.harness/steering/domain-layer.project.md',
      quality_gates: '.harness/steering/quality-gates.project.md',
    },
    commands: projectCommands(ctx),
    modules: {},
    drift: { contract: 'warn' },
    capabilities: { codegraph: { enabled: false, required: false } },
    runtimes: [],
  };
  writeFileSync(config, `${JSON.stringify(project, null, 2)}\n`);
}

/** MCP servers that live under tools/ in the kit repo. Projects never receive a copy; agents use `asdd` instead. */
/** Kit MCP servers = the tools/ directories (each ships a bin/ launcher). */
export const KIT_TOOL_SERVERS = Object.freeze(
  readdirSync(join(KIT_ROOT, 'tools'), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort(),
);

const mcpFile = (ctx) => join(ctx.target, '.agents/mcp/mcp.json');

/** Empty project MCP seed: chat MCP servers stay in the kit (`tools/`); projects use `asdd` for the same checks. */
const PROJECT_MCP = { mcpServers: {} };

/** Drop a retired kit server from an existing mcp.json (other servers stay). */
export function unregisterMcpServer(ctx, name) {
  const file = mcpFile(ctx);
  if (ctx.dryRun || !existsSync(file)) return;
  const removed = ctx.patchJson(file, (cfg) => {
    if (!cfg.mcpServers?.[name]) return false;
    delete cfg.mcpServers[name];
    return true;
  });
  if (removed) log(`${c.yellow('REMOVE')} ${file} (mcpServers.${name}, retired)`);
}

/** Add one kit server to an existing mcp.json without touching the others (from a module fragment). */
export function registerMcpServer(ctx, name, source) {
  const file = mcpFile(ctx);
  if (ctx.dryRun || !existsSync(file) || !source) return;
  const entry = JSON.parse(readFileSync(source, 'utf8')).mcpServers?.[name];
  if (!entry) return;
  const added = ctx.patchJson(file, (cfg) => {
    cfg.mcpServers ??= {};
    if (cfg.mcpServers[name]) return false;
    cfg.mcpServers[name] = entry;
    return true;
  });
  if (added) log(`${c.green('ADD')}   ${file} (mcpServers.${name})`);
}

/**
 * Upgrade: drop a kit MCP entry that still launches a retired script. Entries pointing elsewhere stay.
 */
export function upgradeLegacyEntry(ctx, name, legacy) {
  const file = mcpFile(ctx);
  if (ctx.dryRun || !existsSync(file)) return;
  ctx.patchJson(file, (cfg) => {
    const args = cfg.mcpServers?.[name]?.args ?? [];
    if (!args.some((a) => String(a).endsWith(legacy))) return false;
    delete cfg.mcpServers[name];
    return true;
  });
}

/** True when an mcp.json entry launches a kit tools/<name> binary (copied by older installs). */
const launchesKitTool = (entry, name) =>
  (entry?.args ?? []).some((a) => String(a).includes(`tools/${name}/`));

/** Drop kit tools/* MCP entries left by older installs (projects do not host those servers). */
export function unregisterKitToolServers(ctx) {
  const file = mcpFile(ctx);
  if (ctx.dryRun || !existsSync(file)) return;
  ctx.patchJson(file, (cfg) => {
    let changed = false;
    for (const name of KIT_TOOL_SERVERS) {
      if (!cfg.mcpServers?.[name] || !launchesKitTool(cfg.mcpServers[name], name)) continue;
      delete cfg.mcpServers[name];
      changed = true;
      log(`${c.yellow('REMOVE')} ${file} (mcpServers.${name}, tools/ stay in the kit)`);
    }
    return changed;
  });
}

/**
 * Remove tools/<name> trees older installs copied into the project. Only when package.json still names the kit server.
 * Never runs against the kit repo itself (self-install skips installAgentsCore).
 */
export function removeInstalledToolSources(ctx) {
  for (const name of KIT_TOOL_SERVERS) {
    const dir = join(ctx.target, 'tools', name);
    const pkg = join(dir, 'package.json');
    if (!existsSync(pkg)) continue;
    try {
      if (JSON.parse(readFileSync(pkg, 'utf8')).name !== name) continue;
    } catch {
      continue;
    }
    ctx.remove(dir, 'MCP servers stay in the kit (asdd CLI covers the same checks)');
  }
}

/** Write the empty project mcp.json seed (create-only), or replace it with --force-mcp. */
function seedProjectMcp(ctx) {
  const file = mcpFile(ctx);
  const text = `${JSON.stringify(PROJECT_MCP, null, 2)}\n`;
  if (ctx.forceMcp) {
    ctx.forced(() => {
      log(`${c.blue('COPY')}  ${file}`);
      if (!ctx.dryRun) {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, text);
      }
    });
    return;
  }
  if (existsSync(file)) return;
  log(`${c.green('CREATE')} ${file}`);
  if (!ctx.dryRun) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
}

export function installAgentsCore(ctx) {
  const { kit, target } = ctx;
  for (const f of AGENTS_REFRESH_FILES) installFileRow(ctx, f, 'refresh');
  // tools/* MCP servers stay in the kit; projects use `asdd knowledge|drift|audit`.
  removeInstalledToolSources(ctx);
  seedProjectMcp(ctx);
  unregisterMcpServer(ctx, 'spec-drift-auditor');
  // The kit's codegraph MCP entry goes (the codegraph skill runs the CLI); a project's own codegraph server stays.
  upgradeLegacyEntry(ctx, 'codegraph', '.agents/mcp/bin/codegraph-mcp.cjs');
  upgradeLegacyEntry(ctx, 'knowledge', '.agents/mcp/knowledge-server.mjs');
  upgradeLegacyEntry(ctx, 'jev-gate', '.agents/mcp/jev-gate-server.mjs');
  unregisterKitToolServers(ctx);
  ctx.recordManaged(mcpFile(ctx));
}

export function installDocsRoot(ctx) {
  if (ctx.skipDocs) return;
  const { kit, target } = ctx;
  // The kit's own domain model and logs (its history) never ship; projects get the stubs
  for (const f of DOCS_CREATE_FILES) ctx.copyFile(join(kit, f.src), join(target, f.dest), 'create');
}

export function removeRuntimeDocs(ctx) {
  const readme = join(ctx.target, 'runtimes/README.md');
  if (!existsSync(readme)) return;
  // Safety: only remove if the README identifies this as the kit's runtime recipes
  if (!/asdd-harness-kit|runtime recipes|ASDD/.test(readFileSync(readme, 'utf8'))) {
    warn(`${readme} does not look like kit runtime recipes — skipping removal`);
    return;
  }
  ctx.remove(join(ctx.target, 'runtimes'), 'runtime recipes remain in asdd-harness-kit');
}

/**
 * Kit files no longer installed into projects; they were kit-owned and refreshed on every install.
 * Scrum-era product-delivery files, retired migration scripts (use `asdd repair`), retired MCP servers.
 */
const RETIRED_KIT_PATHS = retiredPaths(KIT_ROOT, 'kit_paths');

/** The bash installer the kit copied into projects before the CLI; removed only while it is still the kit's copy. */
const LEGACY_INSTALLER = 'scripts/install-into.sh';
const LEGACY_INSTALLER_MARK = 'Install / upgrade asdd-harness-kit into an existing project.';

/**
 * A retired path is removed only when the previous install's managed_files proves the kit wrote it: the path itself is
 * managed, or (for a directory) every file under it is. A consumer's file at a retired path is never deleted — it is
 * warned and left for manual reconciliation (the kit never silently deletes unmanaged files).
 */
export function provablyKitOwned(ctx, rel) {
  const managed = previousManaged(ctx.installedVersionsFile);
  if (managed === null) return false;
  if (managed.has(rel)) return true;
  const p = join(ctx.target, rel);
  if (!statSync(p).isDirectory()) return managed.has(rel);
  const files = filesUnder(p);
  return files.length > 0 && files.every((f) => managed.has(`${rel}/${f}`));
}

/**
 * Global .harness/state/manifest.json is retired (RV1-AR-1): the generated registry.json is the slice index.
 * Its one project-authored field (domain_model_version) is preserved into .harness/config/project.json before
 * removal. Removed by shape (schema+active_slices = the kit format), not by managed-list proof.
 */
export function migrateGlobalManifest(ctx) {
  const rel = '.harness/state/manifest.json';
  const path = join(ctx.target, rel);
  if (!existsSync(path)) return;
  let data;
  try {
    data = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    data = null;
  }
  if (!data || !Array.isArray(data.active_slices)) {
    warn(`${rel} has unrecognized content — kept for manual reconciliation`);
    return;
  }
  const projectRel = join(ctx.target, '.harness/config/project.json');
  if (existsSync(projectRel) && data.domain_model_version) {
    try {
      const project = JSON.parse(readFileSync(projectRel, 'utf8'));
      if (project.domain_model_version === undefined) {
        project.domain_model_version = data.domain_model_version;
        if (!ctx.dryRun) writeFileSync(projectRel, `${JSON.stringify(project, null, 2)}\n`);
        log(`${c.blue('MIGRATE')} ${rel} domain_model_version → .harness/config/project.json`);
      }
    } catch {
      warn(`could not preserve domain_model_version from ${rel}`);
    }
  }
  ctx.remove(path, 'superseded by generated registry.json');
}

export function removeRetiredKitFiles(ctx) {
  migrateGlobalManifest(ctx);
  for (const rel of RETIRED_KIT_PATHS) {
    const path = join(ctx.target, rel);
    if (!existsSync(path)) continue;
    if (provablyKitOwned(ctx, rel)) ctx.remove(path, 'retired kit file');
    else warn(`${rel} exists but is not kit-managed — the kit retired this path; reconcile or remove it manually`);
  }
  const legacy = join(ctx.target, LEGACY_INSTALLER);
  if (existsSync(legacy) && readFileSync(legacy, 'utf8').includes(LEGACY_INSTALLER_MARK)) {
    // Recorded as managed, so deleting a committed copy is not slice drift (DRIFT-01).
    ctx.recordManaged(legacy);
    ctx.remove(legacy, 'replaced by the asdd CLI: npx asdd-harness-kit install');
  }
}

export function removeModuleSources(ctx) {
  const legacy = '.agents/modules';
  const path = join(ctx.target, legacy);
  if (existsSync(path)) {
    if (statSync(path).isDirectory() && filesUnder(path).length && !provablyKitOwned(ctx, legacy)) {
      warn(`${path} contains files the kit did not install — kept for manual reconciliation`);
    } else if (statSync(path).isDirectory() || provablyKitOwned(ctx, legacy)) {
      ctx.remove(path, 'modules remain in asdd-harness-kit');
    } else {
      warn(`${path} is not recorded as kit-installed — kept for manual reconciliation`);
    }
  }
  const enable = 'scripts/enable-module.sh';
  if (existsSync(join(ctx.target, enable))) {
    if (provablyKitOwned(ctx, enable)) ctx.remove(join(ctx.target, enable), 'use the kit installer to enable modules');
    else warn(`${join(ctx.target, enable)} is not recorded as kit-installed — kept for manual reconciliation`);
  }
}

export function refreshSkillsIndex(ctx) {
  if (ctx.dryRun) {
    info('Skills index name+description (dry-run)');
    return;
  }
  info('Updating skills index');
  if (ctx.run(process.execPath, [installerBin(ctx), 'skills-index', '--write']) !== 0) {
    throw new CliError('skills index update failed');
  }
}
