// Install state and the file operations every phase uses (copy policies, version tracking, JSON patches).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';

import { CliError } from '../paths.mjs';
import { c, isQuiet, log } from '../ui.mjs';

const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

export const sha256 = (data) => createHash('sha256').update(data).digest('hex');

/** sha256 of a regular file, or null (missing, a symlink, unreadable). */
export function fileHash(path) {
  try {
    return lstatSync(path).isFile() ? sha256(readFileSync(path)) : null;
  } catch {
    return null;
  }
}

/** Kit-owned files the installer rewrites after copying them (the skills index): always refreshed, never "changed". */
const REGENERATED = new Set(['.harness/steering/skills.md']);

/** Files a kit tree never installs: OS junk and the kit's own tests. */
const SKIPPED = /^(\.DS_Store|\._.*|.*\.test\..*|.*\.spec\..*)$/;

/** Every file under `dir` (recursively, sorted), relative to it. Symlinks are not files. */
export function filesUnder(dir) {
  const out = [];
  const walk = (rel) => {
    for (const e of readdirSync(join(dir, rel), { withFileTypes: true })) {
      const child = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(child);
      else if (e.isFile()) out.push(child);
    }
  };
  walk('');
  return out.sort();
}

export const isSymlink = (path) => {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
};

export class InstallContext {
  constructor(options) {
    Object.assign(this, options);
    this.managed = [];
    this.seeded = [];
    /** Kit-owned files copied (or kept) by this run; their hashes go to installed-versions.json `kit_files`. */
    this.kitFiles = new Set();
    /** Kit-owned files the project changed since the kit wrote them, left as they are (no --force). */
    this.skipped = [];
    this.stats = { created: 0, updated: 0, kept: 0, skipped: 0 };
    this.kitVersionsFile = join(this.kit, 'cli/versions.json');
    this.installedVersionsFile = join(this.target, '.harness/config/installed-versions.json');
    this.kitArtifacts = readJson(this.kitVersionsFile)?.artifacts ?? null;
    const installed = readJson(this.installedVersionsFile);
    this.installedArtifacts = installed?.artifacts ?? null;
    /** What the kit wrote at the last install: rel path → sha256 (absent before kit 3.9). */
    this.kitHashes = installed?.kit_files ?? {};
  }

  /** Path relative to the target, as installed-versions.json records it. */
  rel(path) {
    return relative(this.target, path).split('\\').join('/');
  }

  /** Kit-owned file (refreshed on upgrade); spec drift exempts it via installed-versions.json. */
  recordManaged(path) {
    this.managed.push(this.rel(path));
  }

  /** A refresh copy is due when the kit's version of the file differs from the installed one. */
  needsUpdate(src) {
    if (!this.kitArtifacts || !this.installedArtifacts) return false;
    const rel = relative(this.kit, src).split('\\').join('/');
    const kitVer = this.kitArtifacts[rel];
    const instVer = this.installedArtifacts[rel];
    return Boolean(kitVer && instVer && kitVer !== instVer);
  }

  /**
   * policy `create`: copy only when missing (a project-owned seed); `refresh`: kit-owned, also copied with
   * --force or when its version changed.
   */
  copyFile(src, dest, policy = 'create') {
    if (!existsSync(src)) throw new CliError(`missing kit file: ${src}`);
    if (policy === 'refresh') {
      this.recordManaged(dest);
      // Test hook: list refreshed kit sources (each needs a versions.json entry)
      if (process.env.HARNESS_TRACE_REFRESH) appendFileSync(process.env.HARNESS_TRACE_REFRESH, `${relative(this.kit, src)}\n`);
    }
    const rel = this.rel(dest);
    if (policy === 'refresh') this.kitFiles.add(rel);
    const action = this.copyAction(src, dest, rel, policy);
    if (action === 'keep') {
      this.stats.kept += 1;
      log(`${c.dim('KEEP')}  ${dest}`);
      return;
    }
    if (action === 'skip') {
      this.stats.skipped += 1;
      this.skipped.push(rel);
      log(`${c.yellow('SKIP')}  ${dest} (changed in this project since the kit installed it; --force overwrites)`);
      return;
    }
    this.stats[action === 'create' ? 'created' : 'updated'] += 1;
    log(`${c.blue('COPY')}  ${dest}`);
    if (this.dryRun) return;
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    // Project-owned seeds: spec drift exempts them only while unedited (sha256 in installed-versions.json).
    if (policy === 'create') this.seeded.push(rel);
  }

  /**
   * create: the file is missing. update: kit-owned, and --force or its version changed, unless the project edited it
   * since the kit wrote it (skip; --force still overwrites). keep: everything else, and content already identical.
   */
  copyAction(src, dest, rel, policy) {
    if (!existsSync(dest)) return 'create';
    if (policy !== 'refresh') return 'keep';
    const current = fileHash(dest);
    if (current !== null && current === fileHash(src)) return 'keep';
    if (this.force) return 'update';
    if (!this.needsUpdate(src)) return 'keep';
    const recorded = this.kitHashes[rel];
    if (recorded && current !== recorded && !REGENERATED.has(rel)) return 'skip';
    return 'update';
  }

  /**
   * Kit-owned content the installer generates (a rendered runtime agent file): written when missing, replacing a link,
   * or when it changed; a copy the project edited since the kit wrote it is kept unless --force (like `refresh`).
   */
  writeGenerated(dest, content) {
    const rel = this.rel(dest);
    this.recordManaged(dest);
    this.kitFiles.add(rel);
    const linked = isSymlink(dest);
    if (!linked && existsSync(dest)) {
      const current = readFileSync(dest, 'utf8');
      if (current === content) {
        this.stats.kept += 1;
        log(`${c.dim('KEEP')}  ${dest}`);
        return;
      }
      const recorded = this.kitHashes[rel];
      if (recorded && fileHash(dest) !== recorded && !this.force) {
        this.stats.skipped += 1;
        this.skipped.push(rel);
        log(`${c.yellow('SKIP')}  ${dest} (changed in this project since the kit rendered it; --force overwrites)`);
        return;
      }
    }
    this.stats[existsSync(dest) || linked ? 'updated' : 'created'] += 1;
    log(`${c.blue('RENDER')} ${dest}`);
    if (this.dryRun) return;
    if (linked) unlinkSync(dest);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, content);
  }

  copyTree(src, dest, policy = 'refresh') {
    if (!existsSync(src)) throw new CliError(`missing kit dir: ${src}`);
    for (const rel of filesUnder(src)) {
      if (SKIPPED.test(rel.split('/').pop())) continue; // kit tests are not installed
      this.copyFile(join(src, rel), join(dest, rel), policy);
    }
  }

  /** Run `fn` with --force on (modules, --force-bindings, --force-mcp). */
  forced(fn) {
    const previous = this.force;
    this.force = true;
    try {
      return fn();
    } finally {
      this.force = previous;
    }
  }

  /** `rm -rf` inside the target, logged; skipped on a dry run. */
  remove(path, reason) {
    log(`${c.yellow('REMOVE')} ${path}${reason ? ` (${reason})` : ''}`);
    if (!this.dryRun) rmSync(path, { recursive: true, force: true });
  }

  /** `ln -sfn source path` */
  link(source, path) {
    if (isSymlink(path) || existsSync(path)) unlinkSync(path);
    mkdirSync(dirname(path), { recursive: true });
    symlinkSync(source, path);
  }

  chmodExecutable(dir) {
    if (this.dryRun || !existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      try {
        chmodSync(join(dir, name), 0o755);
      } catch {
        /* not ours to fix */
      }
    }
  }

  /** Read, patch, and rewrite a JSON file (2-space, trailing newline). Returns what `patch` returned. */
  patchJson(file, patch) {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    const result = patch(data);
    if (result !== false) writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
    return result;
  }

  /** Run a command in the target; inherits the terminal unless `quiet`. Returns the exit status. */
  run(cmd, args, { cwd = this.target, quiet = false } = {}) {
    // With --json, a child's output goes to stderr: stdout is the JSON result.
    // ASDD_DELEGATED: the installer's own asdd runs the checks, never an older one the project installed.
    const res = spawnSync(cmd, args, { cwd, env: { ...process.env, ASDD_DELEGATED: '1' }, stdio: quiet ? 'ignore' : isQuiet() ? ['ignore', 2, 2] : 'inherit' });
    return res.error ? 1 : (res.status ?? 1);
  }

  /** Append `line` to the target's .gitignore unless it is already there. */
  ensureGitignore(line) {
    const gi = join(this.target, '.gitignore');
    const text = existsSync(gi) ? readFileSync(gi, 'utf8') : null;
    if (text?.split(/\r?\n/).includes(line)) return;
    if (this.dryRun) {
      log(`${c.dim('GITIGNORE')}  ${line}`);
      return;
    }
    appendFileSync(gi, `${text && !text.endsWith('\n') ? '\n' : ''}${line}\n`);
    log(`${c.blue('GITIGNORE')}  ${line}`);
  }
}
