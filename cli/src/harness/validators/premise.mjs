import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { deriveStatus, readSessions } from '../sync-state.mjs';

const nonEmpty = (v) => typeof v === 'string' && v.trim() !== '';

/**
 * PREMISE-01 findings for one slice's sessions (file order). A failed attempt is a session carrying
 * `feature_id` + `failure_signature`. After the second failure with one signature on one feature, a
 * `checkpoint` session for that feature with a non-empty `premise` must come before the next attempt
 * (the third failure) — or exist at all while no third attempt has been recorded.
 */
export function premiseFindings(sessions) {
  const failures = new Map(); // `${feature}\u0000${signature}` → session indexes
  sessions.forEach((s, i) => {
    if (!nonEmpty(s?.feature_id) || !nonEmpty(s?.failure_signature)) return;
    const key = `${s.feature_id}\u0000${s.failure_signature.trim()}`;
    if (!failures.has(key)) failures.set(key, []);
    failures.get(key).push(i);
  });
  const findings = [];
  for (const [key, idx] of failures) {
    if (idx.length < 2) continue;
    const [feature, signature] = key.split('\u0000');
    const from = idx[1];
    const until = idx[2] ?? sessions.length;
    const named = sessions
      .slice(from + 1, until)
      .some((s) => s?.event_type === 'checkpoint' && s.feature_id === feature && nonEmpty(s.premise));
    if (!named) findings.push({ feature_id: feature, failure_signature: signature, failures: idx.length });
  }
  return findings;
}

/**
 * PREMISE-01 (attack the premise): two fixes that share one premise failed the same gate — name the
 * premise before a third attempt. WARN-only, in_progress slices only (closed slices are historical
 * evidence, SP-003).
 */
export default function validate(ctx) {
  const { root, warn } = ctx;
  const slicesDir = join(root, '.harness/state/slices');
  if (!existsSync(slicesDir)) return;
  for (const e of readdirSync(slicesDir, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('.')) continue;
    if (ctx.slice && e.name !== ctx.slice) continue;
    const sessions = readSessions(join(slicesDir, e.name));
    if (!sessions.length || deriveStatus(sessions) !== 'in_progress') continue;
    for (const f of premiseFindings(sessions)) {
      warn(
        `PREMISE-01 slice "${e.name}": feature ${f.feature_id} failed ${f.failures}× on ${f.failure_signature} with no "premise" checkpoint after the second failure — write a checkpoint session with feature_id, "premise" (the shared premise, one sentence) and "removes" before another attempt`,
      );
    }
  }
}
