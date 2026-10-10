import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { deriveEscalationSignals, deriveMode, readSessions } from '../sync-state.mjs';

/**
 * Lite-first escalation evidence.
 *
 * Lite slices carry open escalation signals as WARN while in progress. A lite
 * slice may NOT complete (phase_completed for qa/knowledge) while signals are
 * open — escalation (or removing the evidence) is required first.
 * Full and escalated slices are governed by the full-path gates instead.
 */
export default function validate(ctx) {
  const { root, fail, warn, manifest } = ctx;
  if (!manifest || !Array.isArray(manifest.active_slices)) return;

  for (const entry of manifest.active_slices) {
    const sliceId = typeof entry === 'string' ? entry : entry?.slice_id;
    if (typeof sliceId !== 'string' || !sliceId.trim()) continue;
    const sliceDir = join(root, '.harness/state/slices', sliceId);
    if (!existsSync(join(sliceDir, 'sessions'))) continue; // legacy v2 slices

    const sessions = readSessions(sliceDir);
    const mode = deriveMode(sessions);
    if (mode !== 'lite') continue;

    const signals = deriveEscalationSignals(sessions);
    if (signals.length === 0) continue;

    const closing = sessions.some(
      (s) => s.event_type === 'phase_completed' && ['qa', 'knowledge'].includes(s.phase)
    );
    const summary = signals.map((s) => s.type).join(', ');
    if (closing) {
      fail(
        `lite slice "${sliceId}" cannot complete with open escalation signals (${summary}) — run: node .harness/scripts/escalate-slice.mjs ${sliceId} --reasons "${summary}"`
      );
    } else {
      for (const s of signals) {
        warn(`lite slice "${sliceId}": escalation signal ${s.type} — ${s.evidence}`);
      }
    }
  }
}
