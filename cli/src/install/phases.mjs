// The install phases that lay down the kit: steering, bindings, harness scripts, project.json, agents, MCP, docs.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { CliError, KIT_REF, KIT_REMOTE, TEMPLATES } from '../paths.mjs';
import { c, info, log, warn } from '../ui.mjs';
import { filesUnder, isSymlink } from './context.mjs';

const STEERING = [
  'domain-layer.md', 'quality-gates.md', 'manifest.md', 'session-loop.md', 'asdd-lite.md', 'knowledge.md',
  'skills.md', 'security-rules.md', 'controls.md', 'spec-drift.md', 'README.md',
];

/** Where the shipped steering lives in the kit: the CLI. The kit's own .harness/steering holds only its bindings (and links). */
export const STEERING_SOURCE = 'cli/steering';
/** The .harness/ skeleton the kit owns in a project: project path → kit source (all in the CLI). */
export const HARNESS_FILES = [
  ['.harness/audits/README.md', 'cli/scaffold/audits/README.md'],
  ['.harness/config/project.schema.json', 'cli/scaffold/config/project.schema.json'],
  ['.harness/config/README.md', 'cli/scaffold/config/README.md'],
  ['.harness/features/feature.schema.json', 'cli/scaffold/features/feature.schema.json'],
  ['.harness/config/versions.json', 'cli/versions.json'],
  ['.harness/config/models.json', 'cli/scaffold/config/models.json'],
  ['.harness/config/skill-profile-waivers.json', 'cli/scaffold/config/skill-profile-waivers.json'],
];
/** READMEs of the project's own folders: written once, then the project's. */
const FOLDER_READMES = ['specs', 'features', 'state/slices', 'state/archive'];

/**
 * What the kit repo copies into its own .harness/ when it installs itself (project path → source): the files a
 * project receives, so the kit's agents and checks read exactly what ships.
 */
export const SELF_COPIES = [
  ...STEERING.map((f) => [`.harness/steering/${f}`, `${STEERING_SOURCE}/${f}`]),
  ['.harness/steering/templates', `${STEERING_SOURCE}/templates`],
  ...HARNESS_FILES,
  ...FOLDER_READMES.map((d) => [`.harness/${d}/README.md`, `cli/scaffold/${d}/README.md`]),
  // What .agents/ and the root get: agents, skills, the MCP config and launchers, and the agent map.
  ['.agents/agents', 'cli/agents'],
  ['.agents/skills', 'cli/skills'],
  ['.agents/mcp/bin', 'cli/mcp/bin'],
  ['.agents/mcp/sync-runtime-mcp.cjs', 'cli/mcp/sync-runtime-mcp.cjs'],
  ['.agents/mcp/README.md', 'cli/mcp/README.md'],
  ['.agents/mcp/mcp.json', 'cli/mcp/mcp.json'],
  ['AGENTS.md', 'cli/AGENTS.md'],
];

export function installPortableSteering(ctx) {
  for (const f of STEERING) ctx.copyFile(join(ctx.kit, STEERING_SOURCE, f), join(ctx.target, '.harness/steering', f), 'refresh');
  ctx.copyTree(join(ctx.kit, STEERING_SOURCE, 'templates'), join(ctx.target, '.harness/steering/templates'), 'refresh');
}

const BINDINGS = ['product.md', 'structure.md', 'tech.md', 'domain-layer.project.md', 'quality-gates.project.md', 'design-system.md'];

/** Binding stubs live in cli/templates/bindings: the kit's own .harness/steering bindings describe the kit itself and never ship. */
export function installBindings(ctx) {
  if (ctx.skipBindings) {
    info('Skipping bindings');
    return;
  }
  for (const f of BINDINGS) {
    const src = join(ctx.kit, 'cli/templates/bindings', f);
    const dest = join(ctx.target, '.harness/steering', f);
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

/** The command a target's hooks run for `verb`: the resolver in a project, cli/ in the kit repo. */
export const asddCommand = (ctx, verb) => (ctx.self ? `node ${KIT_BIN} ${verb}` : projectAsdd(verb));

/** The asdd the installer itself runs on the target (checks, skills index): this kit's, never one the project had. */
export const installerBin = (ctx) => join(ctx.kit, KIT_BIN);

/**
 * Projects get no copy of the CLI. An install by an older kit left one in .harness/cli/ (and before that the harness
 * in .harness/scripts/): both go, so the project runs the asdd package it installs.
 */
export function retireProjectCli(ctx) {
  const dest = join(ctx.target, LEGACY_PROJECT_CLI);
  // Recorded as managed, so deleting the committed copy is not slice drift (DRIFT-01).
  ctx.recordManaged(join(dest, 'bin/asdd.mjs'));
  if (existsSync(dest) || isSymlink(dest)) {
    ctx.remove(dest, ctx.self ? 'the kit runs cli/ directly' : 'asdd is a Node package now: npm i -D asdd-harness-kit (or -g)');
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
  // Recorded as managed, so deleting a committed copy is not slice drift (DRIFT-01).
  for (const rel of kitNames) ctx.recordManaged(join(legacy, rel));
  if (!existsSync(legacy)) return;
  const own = [];
  for (const rel of filesUnder(legacy)) {
    if (kitNames.has(rel) || isTest(rel)) ctx.remove(join(legacy, rel), 'the harness runs from the asdd package now');
    else own.push(rel);
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
  // Examples only: the target's .github/ is never touched
  ctx.copyFile(join(kit, '.github/CODEOWNERS.harness.example'), join(target, '.harness/examples/CODEOWNERS.harness.example'), 'refresh');
  ctx.copyFile(join(kit, '.github/workflows/harness-audit.yml.example'), join(target, '.harness/examples/harness-audit.yml.example'), 'refresh');
  for (const [dest, src] of HARNESS_FILES) ctx.copyFile(join(kit, src), join(target, dest), 'refresh');
  ctx.copyFile(join(TEMPLATES, 'PROGRESS.md'), join(target, '.harness/PROGRESS.md'), 'create');
  ctx.copyFile(join(TEMPLATES, 'manifest.json'), join(target, '.harness/state/manifest.json'), 'create');

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
export const KIT_TOOL_SERVERS = ['knowledge', 'spec-drift', 'jev-gate'];

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
  ctx.copyTree(join(kit, 'cli/agents'), join(target, '.agents/agents'), 'refresh');
  ctx.copyTree(join(kit, 'cli/skills'), join(target, '.agents/skills'), 'refresh');
  ctx.copyTree(join(kit, 'cli/mcp/bin'), join(target, '.agents/mcp/bin'), 'refresh');
  ctx.copyFile(join(kit, 'cli/mcp/sync-runtime-mcp.cjs'), join(target, '.agents/mcp/sync-runtime-mcp.cjs'), 'refresh');
  ctx.copyFile(join(kit, 'cli/mcp/README.md'), join(target, '.agents/mcp/README.md'), 'refresh');
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
  ctx.copyFile(join(kit, 'cli/AGENTS.md'), join(target, 'AGENTS.md'), 'create');
  // The kit's own domain model and logs (its history) never ship; projects get the stubs
  ctx.copyFile(join(TEMPLATES, 'docs/domain-model.md'), join(target, 'docs/architecture/domain-model.md'), 'create');
  ctx.copyFile(join(TEMPLATES, 'docs/agent-failure-log.md'), join(target, 'docs/agent-failure-log.md'), 'create');
  ctx.copyFile(join(TEMPLATES, 'docs/dissent-log.md'), join(target, 'docs/dissent-log.md'), 'create');
  ctx.copyFile(join(kit, 'docs/knowledge-base/README.md'), join(target, 'docs/knowledge-base/README.md'), 'create');
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
const RETIRED_KIT_PATHS = [
  'scripts/harness-migrate.mjs',
  'scripts/migrate-v2-v3.mjs',
  '.agents/skills/product-delivery/agents',
  '.agents/skills/product-delivery/contracts/discovery.schema.yaml',
  '.agents/skills/product-delivery/contracts/delivery-map.schema.yaml',
  '.agents/skills/product-delivery/contracts/sprint-plan.schema.yaml',
  '.agents/skills/product-delivery/contracts/tech-spec.schema.yaml',
  '.agents/skills/product-delivery/contracts/user-story.schema.yaml',
  '.agents/skills/product-delivery/references/technical-diagrams.md',
  '.agents/skills/user-story-decomposition',
  '.agents/skills/capability-prioritization',
  '.agents/mcp/spec-drift-auditor.mjs',
  '.agents/mcp/ui/drift-dashboard.html',
  '.agents/mcp/jev-gate-server.mjs',
  '.agents/mcp/knowledge-server.mjs',
  // Codegraph is a skill on the codegraph CLI now: its MCP launcher and steering go.
  '.agents/mcp/bin/codegraph-mcp.cjs',
  // The open-code-review skill (ocr CLI) is no longer part of the kit.
  '.agents/skills/open-code-review',
  '.harness/steering/codegraph.md',
  '.harness/steering/codegraph-agents.md',
];

/** The bash installer the kit copied into projects before the CLI; removed only while it is still the kit's copy. */
const LEGACY_INSTALLER = 'scripts/install-into.sh';
const LEGACY_INSTALLER_MARK = 'Install / upgrade asdd-harness-kit into an existing project.';

export function removeRetiredKitFiles(ctx) {
  for (const rel of RETIRED_KIT_PATHS) {
    const path = join(ctx.target, rel);
    if (existsSync(path)) ctx.remove(path, 'retired kit file');
  }
  const legacy = join(ctx.target, LEGACY_INSTALLER);
  // Recorded as managed, so deleting a committed copy is not slice drift (DRIFT-01).
  ctx.recordManaged(legacy);
  if (existsSync(legacy) && readFileSync(legacy, 'utf8').includes(LEGACY_INSTALLER_MARK)) {
    ctx.remove(legacy, 'replaced by the asdd CLI: npx asdd-harness-kit install');
  }
}

export function removeModuleSources(ctx) {
  const legacy = join(ctx.target, '.agents/modules');
  if (existsSync(legacy)) ctx.remove(legacy, 'modules remain in asdd-harness-kit');
  const enable = join(ctx.target, 'scripts/enable-module.sh');
  if (existsSync(enable)) ctx.remove(enable, 'use the kit installer to enable modules');
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
