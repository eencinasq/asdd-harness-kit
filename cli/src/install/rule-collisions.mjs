// Rule collision guard (rules proposal D-7): fail closed before the .agents/rules copy overwrites a
// consumer-authored same-name file. File-level parity with guardSteeringCollisions; runs once before
// installAgentsCore. Never bypassed by --force; --dry-run reports without halting;
// no-ops when the kit ships no rules dir.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { CliError } from '../paths.mjs';
import { log, warn } from '../ui.mjs';
import { filesUnder, previousManaged } from './context.mjs';

const SKIPPED = /^(\.DS_Store|\._.*|.*\.test\..*|.*\.spec\..*)$/;

function report({ legacy, collisions }) {
  log('');
  if (legacy) {
    log('Rule collision guard — LEGACY INSTALL: .harness/config/installed-versions.json is missing, empty, or unparseable, so rule-file provenance cannot be proven.');
  } else {
    log('Rule collision guard — consumer-authored rule files detected:');
  }
  for (const rel of collisions.slice(0, 15)) log(`  .agents/rules/${rel} — exists in target but was never kit-installed`);
  if (collisions.length > 15) log(`  … +${collisions.length - 15} more`);
  log('');
  log('Resolution paths:');
  log('  • Manual rename: rename each target file to a non-colliding name, then re-run;');
  log('  • If these files WERE kit-installed, repair .harness/config/installed-versions.json managed_files, then re-run.');
  log('The kit never silently overwrites unmanaged files.');
}

export function guardRuleCollisions(ctx) {
  const rulesKit = join(ctx.kit, 'cli/rules');
  if (!existsSync(rulesKit)) return; // nothing to install — no collision possible
  const rulesTarget = join(ctx.target, '.agents/rules');
  if (!existsSync(rulesTarget)) return; // nothing exists to clobber

  const managed = previousManaged(ctx.installedVersionsFile);
  const legacy = managed === null;
  const collisions = [];
  for (const rel of filesUnder(rulesKit).filter((f) => !SKIPPED.test(f.split('/').pop()))) {
    const p = join(rulesTarget, rel);
    if (!existsSync(p) || !statSync(p).isFile()) continue;
    const key = `.agents/rules/${rel.split('\\').join('/')}`;
    if (managed && managed.has(key)) continue;
    collisions.push(rel);
  }
  if (!collisions.length) return;

  report({ legacy, collisions });
  if (ctx.dryRun) {
    warn('rule collision(s) detected — dry-run, not halting');
    return;
  }
  throw new CliError('rule name collision — refusing to overwrite unmanaged files');
}
