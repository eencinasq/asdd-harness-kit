// Which asdd a project runs, and whether it fits the kit the project installed. Projects get no copy of the CLI:
// asdd is the asdd-harness-kit package, a devDependency (pinned by the project's lockfile) or a global install.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseVersion } from './semver.mjs';

/** The project's own asdd, when it installed the package as a dependency. */
export const LOCAL_PACKAGE = 'node_modules/asdd-harness-kit';

const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

/** The project's devDependency asdd: its bin and version, or null. */
export function localAsdd(root) {
  const pkg = readJson(join(root, LOCAL_PACKAGE, 'package.json'));
  if (pkg?.name !== 'asdd-harness-kit') return null;
  return { bin: join(root, LOCAL_PACKAGE, 'cli/bin/asdd.mjs'), version: pkg.version ?? null };
}

/** The kit version the project installed (.harness/config/project.json kit.version), or null. */
export const projectKitVersion = (root) => readJson(join(root, '.harness/config/project.json'))?.kit?.version ?? null;

/**
 * Whether asdd `cli` can run a project installed with kit `project`. Another major: `fail` (the harness files and the
 * commands may not match). Another minor: `warn`. A patch difference, or no recorded version: `ok`.
 * @returns {{ level: 'ok' | 'warn' | 'fail', message: string }}
 */
export function versionFit(cli, project) {
  const a = parseVersion(cli);
  const b = parseVersion(project);
  if (!a || !b) return { level: 'ok', message: `asdd ${cli}` };
  const fix = `install the matching asdd (npm i -D asdd-harness-kit@${b[0]}.${b[1]}, or -g), or upgrade the project with this one (asdd install .)`;
  if (a[0] !== b[0]) return { level: 'fail', message: `asdd ${cli} cannot run this project, installed with kit ${project}: ${fix}` };
  if (a[1] !== b[1]) return { level: 'warn', message: `asdd ${cli} differs from the kit ${project} this project installed: ${fix}` };
  return { level: 'ok', message: `asdd ${cli} fits the kit ${project} this project installed` };
}
