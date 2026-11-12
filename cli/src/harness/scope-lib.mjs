/**
 * scope-lib.mjs — the files a feature's scope_paths cover, and the evidence hash of a passing feature.
 * No harness imports (drift-lib and sync-state both use it, and must not import each other).
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export const EVIDENCE_HASH_RE = /^[0-9a-f]{64}$/;

export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') {
        re += '(?:.*/)?';
        i += 2;
      } else {
        re += '.*';
        i += 1;
      }
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

function gitLines(root, args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout.split('\n').map((l) => l.trim()).filter(Boolean) : null;
}

function walkFiles(root, dir, out = [], limit = 20000) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (out.length >= limit) break;
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(root, abs, out, limit);
    else out.push(relative(root, abs).replaceAll('\\', '/'));
  }
  return out;
}

/**
 * Lists project files under a folder prefix ('' = everything): git's tracked and untracked-but-not-ignored files, or a
 * filesystem walk outside git. Files deleted from the working tree are left out even while git's index still has them,
 * so committing a deletion does not change an evidence hash a second time. One listing per lister.
 */
export function fileLister(root, gitAvailable) {
  let tracked = null;
  return (prefix) => {
    if (!gitAvailable) return walkFiles(root, join(root, prefix));
    if (!tracked) {
      const deleted = new Set(gitLines(root, ['ls-files', '--deleted']) ?? []);
      tracked = (gitLines(root, ['ls-files', '--cached', '--others', '--exclude-standard']) ?? []).filter(
        (f) => !deleted.has(f),
      );
    }
    return prefix ? tracked.filter((f) => f.startsWith(`${prefix}/`)) : tracked;
  };
}

const inGit = (root) => gitLines(root, ['rev-parse', '--is-inside-work-tree'])?.[0] === 'true';

/** Every project file a list of scope paths covers (files, directories, globs), sorted and repository-relative. */
export function scopeFiles(root, scopes, listFiles = fileLister(root, inGit(root))) {
  const out = new Set();
  for (const scope of scopes) {
    if (!scope.includes('*') && !scope.includes('?')) {
      const abs = join(root, scope);
      if (!existsSync(abs)) continue;
      if (statSync(abs).isDirectory()) for (const f of listFiles(scope)) out.add(f);
      else out.add(scope);
      continue;
    }
    const segments = scope.split('/');
    const prefix = segments.slice(0, segments.findIndex((s) => s.includes('*') || s.includes('?'))).join('/');
    const re = globToRegExp(scope);
    for (const f of listFiles(prefix)) if (re.test(f)) out.add(f);
  }
  return [...out].sort();
}

/**
 * The evidence of a passing feature: sha256 over the path and content of every file its scope_paths cover.
 * `asdd sync` records it when a feature is marked passing (no commit needed); DRIFT-02 recomputes it.
 */
export function evidenceHash(root, scopes, listFiles) {
  const hash = createHash('sha256');
  for (const file of scopeFiles(root, scopes, listFiles)) {
    hash.update(`${file}\0`);
    try {
      hash.update(readFileSync(join(root, file)));
    } catch {
      hash.update('<missing>');
    }
    hash.update('\0');
  }
  return hash.digest('hex');
}
