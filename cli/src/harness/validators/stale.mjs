import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PHASES } from '../sync-state.mjs';

const DEFAULT_STALE_DAYS = 14;

function staleDays(root) {
  try {
    const config = JSON.parse(readFileSync(join(root, '.harness/config/project.json'), 'utf8'));
    const days = config?.stale?.days;
    return Number.isFinite(days) && days > 0 ? days : DEFAULT_STALE_DAYS;
  } catch {
    return DEFAULT_STALE_DAYS;
  }
}

/**
 * STALE-01 (K-7): an in_progress slice with no session activity for N days is
 * stale — park it, resume it, or abandon it. Stale slices are the root of the
 * DRIFT noise floor (their trackers rot while the tree moves on). WARN-only:
 * a slow-moving slice is legitimate, a forgotten one is not.
 */
export default function validate(ctx) {
  const { root, warn, registry } = ctx;
  if (!registry || !Array.isArray(registry.slices)) return;
  const limit = staleDays(root);
  const now = Date.now();

  for (const entry of registry.slices) {
    const sliceId = typeof entry === 'string' ? entry : entry?.slice_id;
    const status = typeof entry === 'string' ? null : entry?.status;
    if (typeof sliceId !== 'string' || !sliceId.trim()) continue;
    if (ctx.slice && sliceId !== ctx.slice) continue;
    if (status !== 'in_progress') continue;

    // last_activity is derived by sync; fall back to the newest session timestamp.
    let newest = typeof entry === 'object' && entry ? Date.parse(entry.last_activity ?? '') || 0 : 0;
    if (!newest) {
      const sessionsDir = join(root, '.harness/state/slices', sliceId, 'sessions');
      if (!existsSync(sessionsDir)) continue;
      for (const name of readdirSync(sessionsDir).filter((n) => n.endsWith('.json'))) {
        try {
          const data = JSON.parse(readFileSync(join(sessionsDir, name), 'utf8'));
          const t = Date.parse(data.timestamp);
          if (Number.isFinite(t) && t > newest) newest = t;
        } catch {
          // unparseable session — manifest validator reports it
        }
      }
    }
    if (!newest) continue;

    const daysIdle = Math.floor((now - newest) / 86400000);
    if (daysIdle > limit) {
      const phase = typeof entry === 'string' ? 'unknown' : (entry.phase ?? PHASES[0]);
      warn(`STALE-01 slice "${sliceId}": no session activity for ${daysIdle}d (limit ${limit}d) at phase ${phase} — park or abandon it (a checkpoint session with "status": "PARKED"/"ABANDONED", then asdd sync — MAN-07), or resume it`);
    }
  }
}
