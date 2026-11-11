import { join } from 'node:path';
import { existsSync, readdirSync } from 'node:fs';

export function normalizeScopePath(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const path = value.trim().replaceAll('\\', '/').replace(/\/+/g, '/').replace(/\/$/, '');
  if (!path || path.startsWith('/') || /^[A-Za-z]:/.test(path)) return null;
  const parts = path.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) return null;
  return parts.join('/');
}

export function pathsOverlap(left, right) {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

export default function validate(ctx) {
  const { root, fail, dirExists, readJson } = ctx;

  // Banned SoT paths
  for (const banned of ['.kiro/steering', '.kiro/specs', '.kiro/state']) {
    if (dirExists(banned)) {
      fail(`banned SoT path exists: ${banned} (SoT is .harness/ only)`);
    }
  }

  // Archive validation
  if (dirExists('.harness/state/archive')) {
    const archive = join(root, '.harness/state/archive');
    for (const name of readdirSync(archive)) {
      if (!name.endsWith('.json')) continue;
      readJson(`.harness/state/archive/${name}`);
    }
  }
}
