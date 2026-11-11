import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PHASES, SLICE_MODES, readSessions } from '../sync-state.mjs';

/**
 * Phase chain (QG-DEC-09).
 *
 * A phase may complete only when the gate of the phase before it is PASS, or
 * WARN acknowledged by a Tech Lead `override` session for that phase. Domain is
 * optional: with no domain gate, Design chains to Validation. Refactor chains to
 * QA. Lite stretches are skipped (QG-DEC-07). Findings are WARN: the agent
 * prompts are the guide, this is the sensor.
 */
export function predecessorOf(phase, gates) {
  if (phase === 'refactor') return 'qa';
  const idx = PHASES.indexOf(phase);
  if (idx <= 0) return null;
  const prev = PHASES[idx - 1];
  if (prev === 'domain' && !gates.domain) return 'validation';
  return prev;
}

export function phaseChainFindings(sessions) {
  const findings = [];
  const gates = {};
  let mode = 'lite';
  for (const s of sessions) {
    if (typeof s.mode === 'string' && SLICE_MODES.includes(s.mode)) mode = s.mode;
    const phase = s.phase;
    if (typeof phase !== 'string') continue;
    if (s.event_type === 'override' && s.human) {
      if (gates[phase]) gates[phase].acknowledged = true;
      continue;
    }
    if (s.event_type === 'dissent') {
      gates[phase] = { status: 'WARN', acknowledged: false };
      continue;
    }
    if (s.event_type === 'phase_blocked') {
      gates[phase] = { status: 'BLOCK', acknowledged: false };
      continue;
    }
    if (s.event_type !== 'phase_completed') continue;

    if (mode !== 'lite') {
      const prev = predecessorOf(phase, gates);
      const gate = prev ? gates[prev] : null;
      const at = s.session_id || s.timestamp;
      if (prev && !gate) {
        findings.push(`${phase} completed (${at}) with no ${prev} gate recorded`);
      } else if (prev && gate.status === 'BLOCK') {
        findings.push(`${phase} completed (${at}) while the ${prev} gate is BLOCK`);
      } else if (prev && gate.status === 'WARN' && !gate.acknowledged) {
        findings.push(`${phase} completed (${at}) while the ${prev} gate is WARN without a Tech Lead override`);
      }
    }
    const concerns = Array.isArray(s.concerns) && s.concerns.length > 0;
    gates[phase] = { status: concerns ? 'WARN' : 'PASS', acknowledged: false };
  }
  return findings;
}

export default function validate(ctx) {
  const { root, warn, manifest } = ctx;
  if (!manifest || !Array.isArray(manifest.active_slices)) return;

  for (const entry of manifest.active_slices) {
    const sliceId = typeof entry === 'string' ? entry : entry?.slice_id;
    if (typeof sliceId !== 'string' || !sliceId.trim()) continue;
    const sliceDir = join(root, '.harness/state/slices', sliceId);
    if (!existsSync(join(sliceDir, 'sessions'))) continue; // legacy v2 slices

    for (const finding of phaseChainFindings(readSessions(sliceDir))) {
      warn(`QG-DEC-09 slice "${sliceId}": ${finding}`);
    }
  }
}
