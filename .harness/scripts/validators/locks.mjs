import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export default function validate(ctx) {
  const { root, fail, readJson, manifest } = ctx;
  const locksDir = join(root, '.harness/state/locks');
  if (!existsSync(locksDir)) return;

  for (const name of readdirSync(locksDir)) {
    if (!name.endsWith('.lock')) continue;
    const lockRel = `.harness/state/locks/${name}`;
    const lock = readJson(lockRel);
    if (!lock) continue;

    // Lock for a DONE slice is stale
    const sliceId = lock.slice || name.replace('.lock', '');
    const sliceEntry = Array.isArray(manifest?.active_slices)
      ? manifest.active_slices.find((s) => s.slice_id === sliceId)
      : null;
    if (sliceEntry && sliceEntry.status === 'DONE') {
      fail(`stale lock "${lockRel}" — slice "${sliceId}" is DONE`);
    }
  }
}
