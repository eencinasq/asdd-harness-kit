// Skill collision guard: fail closed before ANY .agents/skills copy site overwrites a consumer-authored same-name
// directory. Runs once before the first skill copy (baseline cli/skills + enabled module skills). Never bypassed by
// --force; --dry-run reports without halting.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync } from 'node:fs';
import { basename, join } from 'node:path';

import { CliError } from '../paths.mjs';
import { log, warn } from '../ui.mjs';
import { filesUnder } from './context.mjs';
import { list, MODULES } from './options.mjs';

const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

const isJunk = (name) => name === '.DS_Store' || name.startsWith('._');

/** Skill copy roots for this run: baseline always; module skills only when enabled (they all ship a skills/ dir). */
function skillRoots(ctx) {
  const roots = [join(ctx.kit, 'cli/skills')];
  const mods = ctx.modules === 'all' ? MODULES : list(ctx.modules);
  for (const m of mods || []) {
    const dir = join(ctx.kit, 'cli/modules', m, 'skills');
    if (existsSync(dir)) roots.push(dir);
  }
  return roots;
}

/** Top-level skill directory names a root ships. */
const skillNames = (root) =>
  readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

/**
 * Report a collision: blank line, legacy banner or the unmanaged-file list, and the resolution path. Same message
 * the bash installer printed.
 */
function reportCollisions({ legacy, collisions }) {
  log('');
  if (legacy) {
    warn('Skill collision guard — LEGACY INSTALL: .harness/config/installed-versions.json is missing, empty, or unparseable, so skill-file provenance cannot be proven.');
  } else {
    warn('Skill collision guard — consumer-authored skill files detected:');
  }
  for (const { name, unmanaged } of collisions) {
    log(`  .agents/skills/${name}/ contains files the kit did not install:`);
    for (const f of unmanaged.slice(0, 10)) log(`    - ${f}`);
    if (unmanaged.length > 10) log(`    … +${unmanaged.length - 10} more`);
  }
  log('');
  log('Resolution paths:');
  log('  • Rehome (one command): re-run with --rehome-colliding-skills — moves the colliding dirs to .agents/skills.local/<name>/ and proceeds;');
  log('  • Move consumer-authored skill directories out of .agents/skills/ (or rename them) and re-run; or');
  log('  • If these files WERE kit-installed, repair .harness/config/installed-versions.json managed_files, then re-run.');
  log('The kit never silently overwrites unmanaged files.');
}

/**
 * Throw when a skills copy site would meet a target directory the kit cannot fully account for. A colliding directory
 * is fine only while every file in it is in managed_files (the kit installed it earlier). With no readable manifest
 * (a legacy install) every colliding directory is suspect.
 */
export function guardSkillCollisions(ctx) {
  const skillsTarget = join(ctx.target, '.agents/skills');
  if (!existsSync(skillsTarget)) return;

  const colliding = new Set();
  for (const root of skillRoots(ctx)) {
    for (const name of skillNames(root)) {
      if (existsSync(join(skillsTarget, name))) colliding.add(name);
    }
  }
  if (!colliding.size) return;

  const managed = readJson(ctx.installedVersionsFile)?.managed_files;
  const legacy = !Array.isArray(managed) || !managed.length;
  const managedSet = legacy ? null : new Set(managed);

  const collisions = [];
  for (const name of colliding) {
    const dir = join(skillsTarget, name);
    const files = filesUnder(dir).filter((f) => !isJunk(f.split('/').pop()));
    if (!files.length) continue;
    if (legacy) {
      collisions.push({ name, unmanaged: files });
      continue;
    }
    const unmanaged = files.filter((f) => !managedSet.has(`.agents/skills/${name}/${f}`));
    if (unmanaged.length) collisions.push({ name, unmanaged });
  }
  if (!legacy && !collisions.length) return;

  reportCollisions({ legacy, collisions });

  // Recovery UX: --rehome-colliding-skills moves each colliding dir to .agents/skills.local/<name>/ and proceeds.
  if (ctx.rehomeColliding) {
    if (ctx.dryRun) {
      warn('skill collision(s) detected — dry-run: would rehome colliding dirs to .agents/skills.local/ and proceed');
      return;
    }
    const dest = join(ctx.target, '.agents/skills.local');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    warn('skill collision(s) — rehomed consumer-authored dirs to .agents/skills.local/:');
    for (const { name } of collisions) {
      let dst = join(dest, name);
      if (existsSync(dst)) dst = `${dst}.rehomed-${stamp}`;
      mkdirSync(dest, { recursive: true });
      renameSync(join(skillsTarget, name), dst);
      warn(`  - ${name} → ${basename(dst)}`);
    }
    warn('rehomed skills are preserved but inactive; rename the dir and its frontmatter name: to re-enable under a non-colliding name');
    return;
  }

  if (ctx.dryRun) {
    warn('skill collision(s) detected — dry-run, not halting');
    return;
  }
  throw new CliError('skill name collision — refusing to overwrite unmanaged files');
}
