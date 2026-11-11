// Where the CLI finds the kit it ships with, and its version. Node built-ins only.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** cli/src or cli/dist — whichever folder this module was loaded from. */
export const CODE_ROOT = dirname(fileURLToPath(import.meta.url));

/** This CLI's folder: cli/ in the kit checkout or the asdd-harness-kit package (global, or a project's node_modules). */
export const CLI_ROOT = resolve(CODE_ROOT, '..');

/** The kit checkout or npm package this CLI belongs to (cli/ lives at its root). */
export const KIT_ROOT = resolve(CLI_ROOT, '..');

/** The harness commands and libraries (check, verify, gate, sync, knowledge, …). Same relative layout under src/ or dist/. */
export const HARNESS_DIR = join(CODE_ROOT, 'harness');

/** True for the full CLI (always, since projects get no copy; an old .harness/cli copy had the harness only). */
export const IS_FULL = existsSync(join(CODE_ROOT, 'install/index.mjs'));

const versionOf = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8')).version || null;
  } catch {
    return null;
  }
};

/** The kit version, from the package (or kit checkout) this CLI belongs to. */
export const VERSION = versionOf(join(CLI_ROOT, 'package.json')) ?? versionOf(join(KIT_ROOT, 'package.json')) ?? '0.0.0-dev';

export const KIT_REMOTE = process.env.ASDD_KIT_REMOTE || 'https://github.com/eencinasq/asdd-harness-kit.git';
export const KIT_REF = process.env.ASDD_KIT_REF || 'main';

/** Templates the installer seeds into projects (bindings, logs, state). */
export const TEMPLATES = join(KIT_ROOT, 'cli/templates');

/** An error the CLI reports as `✗ <message>` and exits with `code`. */
export class CliError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

/** True when `dir` is a kit checkout (or an unpacked kit package). */
export const isKit = (dir) => existsSync(join(dir, 'cli/steering/domain-layer.md'));
