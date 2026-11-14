// Optional modules (cli/modules/<name> in the kit): enable them; retire the old jev module.
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { c, log } from '../ui.mjs';
import { list, MODULES } from './options.mjs';
import { mountMap, readManifest, retiredPaths, validateModules } from './registry.mjs';

const projectFile = (ctx) => join(ctx.target, '.harness/config/project.json');

/** Mounts are manifest-driven (D-1/D-10): module.json declares contributes, mountMap expands them, ctx.copyFile installs each pair. */
function enableOne(ctx, m) {
  const manifest = readManifest(ctx.kit, m);
  for (const p of mountMap(ctx.kit, manifest)) {
    ctx.copyFile(p.src, join(ctx.target, p.dest), 'refresh');
  }
}

/**
 * Jev is no longer part of the harness or the ASDD pipeline (only the kit's jev-gate MCP server, for chat). An upgrade
 * removes what the old jev module installed: its harness commands, jev.md, and capabilities.jev / modules.jev
 * (registry retired.jev_files).
 */
const KIT_ROOT = join(import.meta.dirname, '../../..');
const RETIRED_JEV_FILES = retiredPaths(KIT_ROOT, 'jev_files');

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
  validateModules(ctx.kit, mods);
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
