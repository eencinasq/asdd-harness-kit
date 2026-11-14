/**
 * Resolve Verify-on-Stop mode (ASDD-ROADMAP P4.3).
 * fail_closed (default) blocks the session; advisory runs check but does not block.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const STOP_MODES = new Set(['fail_closed', 'advisory']);

export function readProjectConfig(root) {
  const p = join(root, '.harness/config/project.json');
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * @param {string} root
 * @param {{ env?: NodeJS.ProcessEnv, config?: object|null }} [opts]
 * @returns {'fail_closed'|'advisory'}
 */
export function resolveStopMode(root, opts = {}) {
  const env = opts.env || process.env;
  const rawEnv = String(env.HARNESS_STOP_MODE || '').trim().toLowerCase();
  if (STOP_MODES.has(rawEnv)) return rawEnv;

  const config = opts.config !== undefined ? opts.config : readProjectConfig(root);
  const fromConfig = config?.stop?.mode;
  if (typeof fromConfig === 'string' && STOP_MODES.has(fromConfig)) return fromConfig;

  return 'fail_closed';
}

export function isAdvisoryStop(root, opts) {
  return resolveStopMode(root, opts) === 'advisory';
}
