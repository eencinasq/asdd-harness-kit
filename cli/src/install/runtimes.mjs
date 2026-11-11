// Runtime wiring: each IDE folder links to the shared .agents/ agents, skills, and MCP config.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CliError } from '../paths.mjs';
import { c, log, warn } from '../ui.mjs';
import { isSymlink } from './context.mjs';
import { list, RUNTIMES } from './options.mjs';
import { asddCommand, KIT_BIN, LEGACY_PROJECT_BIN } from './phases.mjs';

/** Hook commands for this install target: the asdd resolver in a project, cli/ in the kit repo. */
const hookCmds = (ctx) => {
  const verify = asddCommand(ctx, 'verify');
  const gate = asddCommand(ctx, 'gate');
  return {
    verify,
    gate,
    stop: { command: verify, timeout: 60, loop_limit: 3, failClosed: true },
    shell: { command: gate, timeout: 30, failClosed: true },
  };
};

/** True when a hook already runs `asdd <verb>` (the resolver, any asdd bin path) or the pre-CLI script. */
const runsAsdd = (cmd, verb) => new RegExp(`(asdd(\\.mjs)?|exec "\\$b") ${verb}\\b`).test(String(cmd ?? ''));
const isVerifyCmd = (cmd) => runsAsdd(cmd, 'verify') || /node \.harness\/scripts\/verify-on-stop\.mjs/.test(String(cmd ?? ''));
const isGateCmd = (cmd) => runsAsdd(cmd, 'gate') || /node \.harness\/scripts\/(jev-)?command-gate\.mjs/.test(String(cmd ?? ''));

/** Rewrite a pre-CLI kit command onto this target's asdd bin. */
function upgradeHookCommand(command, verifyCmd, gateCmd) {
  if (typeof command !== 'string') return null;
  let next = command
    .replace(/node \.harness\/scripts\/verify-on-stop\.mjs/g, verifyCmd)
    .replace(/node \.harness\/scripts\/(jev-)?command-gate\.mjs/g, gateCmd)
    // The old project copy (.harness/cli) and the kit repo's cli/ follow this target's command.
    .replace(new RegExp(`node ${LEGACY_PROJECT_BIN.replace(/\./g, '\\.')} (verify|gate)\\b`, 'g'), (_, verb) =>
      verb === 'verify' ? verifyCmd : gateCmd,
    )
    .replace(new RegExp(`node ${KIT_BIN.replace(/\./g, '\\.')} (verify|gate)\\b`, 'g'), (_, verb) =>
      verb === 'verify' ? verifyCmd : gateCmd,
    )
    // An earlier form of the project resolver (b=node_modules/.bin/asdd; … exec "$b" <verb>) takes the current one.
    .replace(/^b=node_modules\/\.bin\/asdd;.*exec "\$b" (verify|gate)$/, (_, verb) => (verb === 'verify' ? verifyCmd : gateCmd));
  return next === command ? null : next;
}

const agentFiles = (ctx) => {
  const dir = join(ctx.target, '.agents/agents');
  return existsSync(dir) ? readdirSync(dir).filter((f) => /^asdd-.*\.md$/.test(f)).sort() : [];
};

/** A dir-level agents symlink (legacy installs) must become a real dir, or per-file links self-loop .agents/agents. */
function realAgentsDir(ctx, runtimeDir) {
  const dir = join(ctx.target, runtimeDir, 'agents');
  if (isSymlink(dir)) {
    unlinkSync(dir);
    log(`${c.yellow('FIX')}   ${dir} (dir symlink → real dir)`);
  }
  mkdirSync(dir, { recursive: true });
  return dir;
}

function linkAgentFiles(ctx, runtimeDir) {
  const dir = realAgentsDir(ctx, runtimeDir);
  for (const base of agentFiles(ctx)) {
    ctx.link(`../../.agents/agents/${base}`, join(dir, base));
    ctx.recordManaged(join(dir, base));
    log(`${c.blue('LINK')}  ${join(dir, base)}`);
  }
}

/** Link `path` → `source` when it is missing or already a link; a real file or dir there is the project's. */
function linkUnlessOwned(ctx, path, source, label = path) {
  if (isSymlink(path) || !existsSync(path)) {
    ctx.link(source, path);
    ctx.recordManaged(path);
    log(`${c.blue('LINK')}  ${label}`);
  } else {
    log(`${c.dim('KEEP')}  ${path}`);
  }
}

const linkSkills = (ctx, runtimeDir) => linkUnlessOwned(ctx, join(ctx.target, runtimeDir, 'skills'), '../.agents/skills');

/** Link only when nothing is there (an existing file or link is kept). */
function linkIfMissing(ctx, path, source) {
  if (!existsSync(path)) {
    ctx.link(source, path);
    ctx.recordManaged(path);
    log(`${c.blue('LINK')}  ${path}`);
  } else {
    log(`${c.dim('KEEP')}  ${path}`);
  }
}

/** Agents declare `model: inherit`; a kit-installed per-runtime models.json (it carries "tier_models") goes. */
function removeRuntimeModels(ctx, runtimeDir) {
  const file = join(ctx.target, runtimeDir, 'models.json');
  if (!existsSync(file) || !readFileSync(file, 'utf8').includes('"tier_models"')) return;
  ctx.remove(file, 'agents inherit the runtime model');
}

function installCursorVerifyHook(ctx) {
  const { verify, gate, stop, shell } = hookCmds(ctx);
  const dest = join(ctx.target, '.cursor/hooks.json');
  if (ctx.dryRun) {
    log(`${c.dim('HOOK')}  ${dest} stop → ${verify}, beforeShellExecution → ${gate}`);
    return;
  }
  mkdirSync(join(ctx.target, '.cursor'), { recursive: true });
  ctx.recordManaged(dest);
  if (!existsSync(dest)) {
    // The template ships the project resolver; the kit repo gets its cli/ commands.
    if (ctx.self) writeFileSync(dest, `${JSON.stringify({ version: 1, hooks: { beforeShellExecution: [shell], stop: [stop] } }, null, 2)}\n`);
    else copyFileSync(join(ctx.kit, 'cli/runtimes/cursor/hooks.json'), dest);
    log(`${c.blue('COPY')}  ${dest}`);
    return;
  }
  ctx.patchJson(dest, (data) => {
    data.version ??= 1;
    data.hooks ??= {};
    const stopList = Array.isArray(data.hooks.stop) ? data.hooks.stop : [];
    const gateList = Array.isArray(data.hooks.beforeShellExecution) ? data.hooks.beforeShellExecution : [];
    for (const entry of [...stopList, ...gateList]) {
      const next = upgradeHookCommand(entry?.command, verify, gate);
      if (next) {
        entry.command = next;
        log(`MERGE ${dest} (${next})`);
      }
    }
    if (!stopList.some((e) => isVerifyCmd(e?.command))) {
      stopList.push(stop);
      data.hooks.stop = stopList;
      log(`MERGE ${dest} (stop → verify-on-stop)`);
    }
    if (!gateList.some((e) => isGateCmd(e?.command))) {
      gateList.push(shell);
      data.hooks.beforeShellExecution = gateList;
      log(`MERGE ${dest} (beforeShellExecution → command-gate)`);
    }
  });
}

function installClaudeHooks(ctx) {
  const { verify, gate } = hookCmds(ctx);
  const dest = join(ctx.target, '.claude/settings.json');
  if (ctx.dryRun) {
    log(`${c.dim('HOOK')}  ${dest} PreToolUse(Bash) → command-gate, Stop → verify-on-stop`);
    return;
  }
  mkdirSync(join(ctx.target, '.claude'), { recursive: true });
  ctx.recordManaged(dest);
  if (!existsSync(dest)) writeFileSync(dest, '{}\n');
  ctx.patchJson(dest, (data) => {
    data.hooks ??= {};
    const preList = Array.isArray(data.hooks.PreToolUse) ? data.hooks.PreToolUse : [];
    const stopList = Array.isArray(data.hooks.Stop) ? data.hooks.Stop : [];
    for (const h of [...preList, ...stopList].flatMap((e) => e?.hooks ?? [])) {
      const next = upgradeHookCommand(h?.command, verify, gate);
      if (next) {
        h.command = next;
        log(`MERGE ${dest} (${next})`);
      }
    }
    if (!preList.some((e) => (e?.hooks ?? []).some((h) => isGateCmd(h?.command)))) {
      preList.push({ matcher: 'Bash', hooks: [{ type: 'command', command: gate }] });
      data.hooks.PreToolUse = preList;
      log(`MERGE ${dest} (PreToolUse/Bash → command-gate)`);
    }
    if (!stopList.some((e) => (e?.hooks ?? []).some((h) => isVerifyCmd(h?.command)))) {
      stopList.push({ hooks: [{ type: 'command', command: verify }] });
      data.hooks.Stop = stopList;
      log(`MERGE ${dest} (Stop → verify-on-stop)`);
    }
  });
}

const CLAUDE_MD = 'Follow [`AGENTS.md`](AGENTS.md) (ASDD + Harness INIT, SoT under `.harness/`).';

const WIRE = {
  cursor(ctx) {
    const t = ctx.target;
    mkdirSync(join(t, '.cursor/rules'), { recursive: true });
    realAgentsDir(ctx, '.cursor');
    linkUnlessOwned(ctx, join(t, '.cursor/skills'), '../.agents/skills', `${join(t, '.cursor/skills')} → ../.agents/skills`);
    linkAgentFiles(ctx, '.cursor');
    linkIfMissing(ctx, join(t, '.cursor/mcp.json'), '../.agents/mcp/mcp.json');
    ctx.copyFile(join(ctx.kit, 'cli/runtimes/cursor/asdd-steering.mdc'), join(t, '.cursor/rules/asdd-steering.mdc'), 'refresh');
    removeRuntimeModels(ctx, '.cursor');
    installCursorVerifyHook(ctx);
  },
  claude(ctx) {
    const t = ctx.target;
    realAgentsDir(ctx, '.claude');
    linkSkills(ctx, '.claude');
    linkAgentFiles(ctx, '.claude');
    linkIfMissing(ctx, join(t, '.mcp.json'), '.agents/mcp/mcp.json');
    const claudeMd = join(t, 'CLAUDE.md');
    if (!existsSync(claudeMd)) {
      writeFileSync(claudeMd, `${CLAUDE_MD}\n`);
      ctx.recordManaged(claudeMd);
      log(`${c.blue('COPY')}  ${claudeMd}`);
    } else {
      // Still the kit's one-liner: kit-owned. Anything else is the project's own.
      if (readFileSync(claudeMd, 'utf8').replace(/\n+$/, '') === CLAUDE_MD) ctx.recordManaged(claudeMd);
      log(`${c.dim('KEEP')}  ${claudeMd}`);
    }
    removeRuntimeModels(ctx, '.claude');
    installClaudeHooks(ctx);
  },
  opencode(ctx) {
    const t = ctx.target;
    linkAgentFiles(ctx, '.opencode');
    linkSkills(ctx, '.opencode');
    const config = join(t, 'opencode.json');
    if (!existsSync(config)) {
      writeFileSync(config, `${JSON.stringify({ $schema: 'https://opencode.ai/config.json', instructions: ['AGENTS.md'] }, null, 2)}\n`);
      log(`${c.blue('COPY')}  ${config}`);
    } else {
      log(`${c.dim('KEEP')}  ${config}`);
    }
    if (existsSync(join(t, '.agents/mcp/sync-runtime-mcp.cjs'))) {
      ctx.run(process.execPath, ['.agents/mcp/sync-runtime-mcp.cjs']);
      for (const f of ['.agents/mcp/mcp.opencode.json', '.agents/mcp/mcp.codex.toml', 'opencode.json']) ctx.recordManaged(join(t, f));
      if (existsSync(join(t, '.codex/config.toml'))) ctx.recordManaged(join(t, '.codex/config.toml'));
    } else {
      warn('MCP projection script unavailable — skip OpenCode MCP projection');
    }
    removeRuntimeModels(ctx, '.opencode');
  },
  kimi(ctx) {
    const t = ctx.target;
    mkdirSync(join(t, '.kimi-code'), { recursive: true });
    linkUnlessOwned(ctx, join(t, '.kimi-code/agents'), '../.agents/agents');
    linkSkills(ctx, '.kimi-code');
    linkUnlessOwned(ctx, join(t, '.kimi-code/mcp.json'), '../.agents/mcp/mcp.json');
    removeRuntimeModels(ctx, '.kimi-code');
  },
  junie(ctx) {
    linkAgentFiles(ctx, '.junie');
    linkSkills(ctx, '.junie');
    linkUnlessOwned(ctx, join(ctx.target, '.junie/mcp/mcp.json'), '../../.agents/mcp/mcp.json');
    removeRuntimeModels(ctx, '.junie');
  },
  devin(ctx) {
    linkAgentFiles(ctx, '.devin');
    linkSkills(ctx, '.devin');
    linkUnlessOwned(ctx, join(ctx.target, '.devin/mcp_config.json'), '../.agents/mcp/mcp.json');
    removeRuntimeModels(ctx, '.devin');
  },
  kiro(ctx) {
    linkAgentFiles(ctx, '.kiro');
    linkSkills(ctx, '.kiro');
    linkUnlessOwned(ctx, join(ctx.target, '.kiro/settings/mcp.json'), '../../.agents/mcp/mcp.json');
    removeRuntimeModels(ctx, '.kiro');
  },
};

const ALIASES = { 'claude-code': 'claude', 'open-code': 'opencode', 'kimi-code': 'kimi', juni: 'junie' };

/** Normalized runtime names; throws on an unknown one. */
export function runtimeNames(value) {
  return list(value)
    .map((r) => r.toLowerCase())
    .map((r) => ALIASES[r] ?? r)
    .filter((r) => r !== 'none')
    .map((r) => {
      if (!RUNTIMES.includes(r)) throw new CliError(`unknown runtime: ${r} (use ${RUNTIMES.join('|')})`);
      return r;
    });
}

export function wireRuntimes(ctx) {
  const names = runtimeNames(ctx.runtimes);
  for (const r of names) {
    log(`${c.bold('RUNTIME')} ${r}`);
    if (!ctx.dryRun) WIRE[r](ctx);
  }
  // Record which runtimes this install wired (union with any the project already had).
  const config = join(ctx.target, '.harness/config/project.json');
  if (!ctx.dryRun && names.length && existsSync(config)) {
    ctx.patchJson(config, (data) => {
      const prev = Array.isArray(data.runtimes) ? data.runtimes : [];
      data.runtimes = [...new Set([...prev, ...names])];
    });
  }
}
