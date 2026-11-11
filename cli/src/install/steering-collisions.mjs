// Steering collision guard: fail closed before the portable steering copy overwrites a consumer-authored
// same-name file. File-level (skills guard at dir level). The install set derives from
// steering.registry.json (kit block): portable/index/hybrid-index/contract-doc/artifact_template entries —
// binding files are never shipped, and module-class files ship only with their module (none today).
// Runs before any steering copy; --force never bypasses; --dry-run reports;
// --rehome-colliding-steering moves collisions to .harness/steering.local/.
import { existsSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

import { CliError } from '../paths.mjs';
import { log, warn } from '../ui.mjs';

const INSTALLABLE = new Set(['portable', 'index', 'hybrid-index', 'contract-doc', 'artifact_template']);

function managedSet(ctx) {
  try {
    const m = JSON.parse(readFileSync(ctx.installedVersionsFile, 'utf8')).managed_files;
    return Array.isArray(m) && m.length ? new Set(m) : null;
  } catch {
    return null;
  }
}

function report({ legacy, collisions }) {
  log('');
  if (legacy) {
    log('Steering collision guard — LEGACY INSTALL: .harness/config/installed-versions.json is missing, empty, or unparseable, so steering-file provenance cannot be proven.');
  } else {
    log('Steering collision guard — consumer-authored steering files detected:');
  }
  for (const rel of collisions.slice(0, 15)) log(`  ${rel} — exists in target but was never kit-installed`);
  if (collisions.length > 15) log(`  … +${collisions.length - 15} more`);
  log('');
  log('Resolution paths:');
  log('  • Rehome (one command): re-run with --rehome-colliding-steering — moves the colliding files to .harness/steering.local/ and proceeds;');
  log('  • Manual rename: rename each file to a non-colliding name, then re-run;');
  log('  • If these files WERE kit-installed, repair .harness/config/installed-versions.json managed_files, then re-run.');
  log('The kit never silently overwrites unmanaged files.');
}

export function guardSteeringCollisions(ctx) {
  const steeringTarget = join(ctx.target, '.harness/steering');
  if (!existsSync(steeringTarget)) return; // nothing exists to clobber
  const registryPath = join(ctx.kit, 'cli/scaffold/config/steering.registry.json');
  if (!existsSync(registryPath)) return; // pre-registry kit: nothing to compare

  const kit = JSON.parse(readFileSync(registryPath, 'utf8')).kit ?? {};
  const managed = managedSet(ctx);
  const legacy = managed === null;
  const collisions = [];
  for (const [rel, entry] of Object.entries(kit)) {
    if (!INSTALLABLE.has(entry.class)) continue;
    const p = join(ctx.target, rel);
    if (!existsSync(p) || !statSync(p).isFile()) continue;
    const key = rel.split('\\').join('/');
    if (managed && managed.has(key)) continue;
    collisions.push(rel);
  }
  if (!collisions.length) return;

  report({ legacy, collisions });

  if (ctx.rehomeSteering) {
    if (ctx.dryRun) {
      warn('steering collision(s) detected — dry-run: would rehome colliding files to .harness/steering.local/ and proceed');
      return;
    }
    const dest = join(ctx.target, '.harness/steering.local');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    warn('steering collision(s) — rehomed consumer-authored files to .harness/steering.local/:');
    for (const rel of collisions) {
      let dst = join(dest, basename(rel));
      if (existsSync(dst)) dst = `${dst}.rehomed-${stamp}`;
      mkdirSync(dest, { recursive: true });
      renameSync(join(ctx.target, rel), dst);
      warn(`  - ${rel} → .harness/steering.local/${basename(dst)}`);
    }
    warn('rehomed steering is preserved but inactive; rename to a non-colliding name (and register it in steering.registry.local.json) to re-enable');
    return;
  }

  if (ctx.dryRun) {
    warn('steering collision(s) detected — dry-run, not halting');
    return;
  }
  throw new CliError('steering name collision — refusing to overwrite unmanaged files');
}
