// `asdd install` options: parsing and help.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { CliError } from '../paths.mjs';
import { runtimeMap } from './registry.mjs';

const KIT_ROOT = join(import.meta.dirname, '../../..');
export const RUNTIMES = Object.keys(runtimeMap(KIT_ROOT));
/** Registered modules = the cli/modules/ directories (each must carry module.json — validated at install). */
export const MODULES = Object.freeze(
  readdirSync(join(KIT_ROOT, 'cli/modules'), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort(),
);

/** `asdd install --help`: the registry's generated help (main.mjs passes it in) plus the modules and runtimes this kit ships. */
export const installHelp = (registryHelp) => `${registryHelp.trimEnd()}

Modules:  ${MODULES.join(', ')} (or all)
Runtimes: ${RUNTIMES.join(', ')} (or none)
`;

/** Registry flag name → the install option it sets. */
const OPTION_OF = {
  interactive: 'interactive',
  'no-interactive': 'noInteractive',
  'dry-run': 'dryRun',
  'from-git': 'fromGit',
  force: 'force',
  'force-bindings': 'forceBindings',
  'force-mcp': 'forceMcp',
  'skip-bindings': 'skipBindings',
  'skip-docs': 'skipDocs',
  'skip-deps': 'skipDeps',
  'rehome-colliding-skills': 'rehomeColliding',
  'rehome-colliding-steering': 'rehomeSteering',
  pr: 'pr',
  json: 'json',
  'kit-dir': 'kitDir',
  modules: 'modules',
  runtime: 'runtimes',
  'target-os': 'targetOs',
};

/**
 * The install options from a parsed command line ({ values, args } of parseCommand('install', …), which main.mjs
 * runs: the Installer layer depends on Shared only, not on the Harness parser).
 * @returns {Record<string, any>}
 */
export function installOptions({ values, args }) {
  const o = { modules: '', runtimes: '', kitDir: '', target: args.dir ?? '' };
  for (const [flag, option] of Object.entries(OPTION_OF)) if (values[flag] !== undefined) o[option] = values[flag];
  if (values['kit-dir'] === '') throw new CliError('--kit-dir needs a path');
  if (o.targetOs && !['win32', 'linux', 'darwin'].includes(o.targetOs)) {
    throw new CliError(`unknown --target-os: ${o.targetOs} (expected win32, linux, or darwin)`);
  }
  return o;
}

/** Comma list → trimmed, non-empty entries. */
export const list = (value) =>
  String(value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
