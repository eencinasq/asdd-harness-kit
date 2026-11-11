// Optional modules (cli/modules/<name> in the kit): enable them; retire the old jev module.
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { CliError } from '../paths.mjs';
import { c, log } from '../ui.mjs';
import { list, MODULES } from './options.mjs';
import { LEGACY_PROJECT_CLI as PROJECT_CLI } from './phases.mjs';

const projectFile = (ctx) => join(ctx.target, '.harness/config/project.json');

function enableOne(ctx, m) {
  const { kit, target } = ctx;
  const mod = (rel) => join(kit, 'cli/modules', rel);
  switch (m) {
    case 'bruno':
      ctx.copyFile(mod('bruno/asdd-integration-tester.md'), join(target, '.agents/agents/asdd-integration-tester.md'), 'refresh');
      break;
    case 'playwright-e2e':
      ctx.copyFile(mod('playwright-e2e/asdd-e2e-tester.md'), join(target, '.agents/agents/asdd-e2e-tester.md'), 'refresh');
      break;
    case 'web-ui':
      ctx.copyTree(mod('web-ui/skills'), join(target, '.agents/skills'), 'refresh');
      break;
    case 'http-api':
      ctx.copyTree(mod('http-api/skills'), join(target, '.agents/skills'), 'refresh');
      ctx.copyTree(mod('http-api/adapters'), join(target, '.agents/mcp/adapters'), 'refresh');
      break;
    default:
      throw new CliError(`unknown module: ${m} (${MODULES.join('|')})`);
  }
}

/**
 * Jev is no longer part of the harness or the ASDD pipeline (only the kit's jev-gate MCP server, for chat). An upgrade
 * removes what the old jev module installed: its harness commands, jev.md, and capabilities.jev / modules.jev.
 */
const RETIRED_JEV_FILES = [
  `${PROJECT_CLI}/src/harness/jev-client.mjs`,
  `${PROJECT_CLI}/src/harness/jev-gates.mjs`,
  `${PROJECT_CLI}/dist/harness/jev-client.mjs`,
  `${PROJECT_CLI}/dist/harness/jev-gates.mjs`,
  '.harness/steering/jev.md',
];

export function retireJev(ctx) {
  for (const rel of RETIRED_JEV_FILES) {
    // Recorded as managed, so deleting a committed copy is not slice drift (DRIFT-01).
    ctx.recordManaged(join(ctx.target, rel));
    if (existsSync(join(ctx.target, rel))) ctx.remove(join(ctx.target, rel), 'Jev is not part of the harness');
  }
  if (ctx.dryRun || !existsSync(projectFile(ctx))) return;
  const dropped = ctx.patchJson(projectFile(ctx), (d) => {
    const had = Boolean(d.capabilities?.jev || d.modules?.jev !== undefined);
    if (d.capabilities) delete d.capabilities.jev;
    if (d.modules) delete d.modules.jev;
    return had;
  });
  if (dropped) log(`${c.yellow('REMOVE')} ${projectFile(ctx)} (capabilities.jev, modules.jev)`);
}

export function enableModules(ctx) {
  if (!ctx.modules) return;
  const mods = ctx.modules === 'all' ? MODULES : list(ctx.modules);
  for (const m of mods) {
    log(`${c.bold('MODULE')} ${m}`);
    ctx.forced(() => enableOne(ctx, m));
  }
  // Record enabled modules in project.json
  if (!ctx.dryRun && existsSync(projectFile(ctx))) {
    ctx.patchJson(projectFile(ctx), (d) => {
      d.modules ??= {};
      for (const m of mods) d.modules[m] = true;
    });
  }
}
