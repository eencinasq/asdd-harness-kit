// What a project's .gitignore must not hide: the harness files the team commits. An ignored one installs fine
// locally but never reaches the repository, so every other clone (and CI) runs without it.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { committedChecks, runtimeMap } from './registry.mjs';

const KIT_ROOT = join(import.meta.dirname, '../../..');

/** One representative path per committed harness area (registry committed_checks.paths — the files need not exist: git checks the rules). */
export const COMMITTED_PATHS = committedChecks(KIT_ROOT);

/** The runtime files that wire the hooks, per runtime (registry runtimes.<name>.committed; only some have committed hook files). */
export const RUNTIME_PATHS = Object.fromEntries(
  Object.entries(runtimeMap(KIT_ROOT)).map(([name, r]) => [name, r.committed]),
);

/**
 * The paths of `paths` that `dir`'s ignore rules hide, each with the rule (`source:line:pattern`).
 * Empty outside a git repository or without git: there is nothing to commit to, so nothing to report.
 * @returns {{ path: string, rule: string }[]}
 */
export function ignoredPaths(dir, paths) {
  if (!paths.length) return [];
  const res = spawnSync('git', ['-C', dir, 'check-ignore', '-v', '--stdin'], { input: `${paths.join('\n')}\n`, encoding: 'utf8' });
  // 0: some are ignored, 1: none are, 128: not a repository (or git failed).
  if (res.error || res.status !== 0) return [];
  return res.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [rule, path] = line.split('\t');
      return { path, rule };
    })
    // A matching negation (`!pattern`) means the path is NOT ignored.
    .filter((hit) => !hit.rule.replace(/^.*?:\d+:/, '').startsWith('!'));
}

/** `path (rule)` for a message: the first three, then how many more. */
export function describe(hits) {
  const shown = hits.slice(0, 3).map((h) => `${h.path} (${h.rule})`).join(', ');
  return hits.length > 3 ? `${shown} and ${hits.length - 3} more` : shown;
}

/** `harness`: committed harness paths that are ignored; `runtime`: ignored hook files of the given runtimes. */
export function ignoreReport(dir, runtimes = []) {
  return {
    harness: ignoredPaths(dir, COMMITTED_PATHS),
    runtime: ignoredPaths(
      dir,
      runtimes.flatMap((r) => RUNTIME_PATHS[r] ?? []),
    ),
  };
}
