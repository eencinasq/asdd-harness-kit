/**
 * Bi-directional tracker sync planner (ASDD-ROADMAP P4.1).
 * Plan-only by default; --apply writes a local receipt (no MCP).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readSessions } from './sync-state.mjs';

const REQUIRED_HANDOFF = [
  'source_pitch_id',
  'title',
  'problem',
  'desired_outcome',
  'appetite',
  'cycle',
  'must_haves',
  'no_gos',
  'tracker_url',
  'tracker_type',
  'betting_state',
];

export function parseHandoffYaml(text) {
  const out = {};
  for (const line of String(text || '').split('\n')) {
    const m = line.match(/^([a-z_]+):\s*(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return out;
}

export function findHandoffs(root) {
  const dir = join(root, 'docs/pitches');
  if (!existsSync(dir)) return [];
  const found = [];
  for (const pitch of readdirSync(dir, { withFileTypes: true })) {
    if (!pitch.isDirectory()) continue;
    const p = join(dir, pitch.name, 'handoff.yaml');
    if (!existsSync(p)) continue;
    const raw = readFileSync(p, 'utf8');
    const fields = parseHandoffYaml(raw);
    const missing = REQUIRED_HANDOFF.filter((k) => !fields[k] || fields[k] === '');
    found.push({
      pitch_id: pitch.name,
      path: `docs/pitches/${pitch.name}/handoff.yaml`,
      fields,
      incomplete: fields.status === 'handoff_incomplete' || missing.length > 0,
      missing,
    });
  }
  return found;
}

function matchHandoff(handoffs, source) {
  if (!source) return null;
  return (
    handoffs.find((h) => h.fields.tracker_url && h.fields.tracker_url === source.tracker_url) ||
    handoffs.find((h) => h.fields.source_pitch_id && h.fields.source_pitch_id === source.pitch_id) ||
    handoffs.find((h) => h.pitch_id === source.pitch_id) ||
    null
  );
}

/**
 * @param {object} opts
 * @param {string} opts.root
 * @param {string} [opts.sliceId]
 */
export function buildTrackerSyncPlan(opts) {
  const root = opts.root;
  const handoffs = findHandoffs(root);
  const slicesDir = join(root, '.harness/state/slices');
  const sliceIds = opts.sliceId
    ? [opts.sliceId]
    : existsSync(slicesDir)
      ? readdirSync(slicesDir)
      : [];

  const actions = [];
  const warns = [];

  for (const sliceId of sliceIds) {
    const sliceDir = join(slicesDir, sliceId);
    if (!existsSync(join(sliceDir, 'sessions'))) continue;
    const sessions = readSessions(sliceDir);
    const source =
      sessions.map((s) => s.source).find((s) => s && typeof s === 'object') ||
      null;
    const handoff = matchHandoff(handoffs, source);
    if (source && !handoff) {
      warns.push(`slice ${sliceId}: has session source but no matching handoff.yaml`);
    }
    if (handoff?.incomplete) {
      warns.push(`handoff ${handoff.path}: incomplete (${(handoff.missing || []).join(', ') || 'flagged'})`);
    }

    const tracker = handoff?.fields || {};
    const base = {
      slice_id: sliceId,
      tracker_type: tracker.tracker_type || source?.tracker_type || 'manual',
      tracker_url: tracker.tracker_url || source?.tracker_url || null,
      handoff: handoff?.path || null,
    };

    if (sessions.some((s) => s.event_type === 'phase_started' && s.phase === 'discovery')) {
      actions.push({
        ...base,
        event: 'slice_created',
        action: 'comment',
        body: `ASDD slice \`${sliceId}\` created.`,
      });
    }
    for (const s of sessions.filter((x) => x.event_type === 'phase_completed')) {
      actions.push({
        ...base,
        event: 'phase_completed',
        phase: s.phase,
        action: 'comment',
        body: `Phase \`${s.phase}\` completed${s.evidence ? `: ${s.evidence}` : ''}.`,
      });
    }
    for (const s of sessions.filter((x) => x.event_type === 'feature_completed')) {
      actions.push({
        ...base,
        event: 'feature_passing',
        feature_id: s.feature_id,
        action: 'tick_must_have',
        body: `Feature \`${s.feature_id}\` passing.`,
      });
    }
    for (const s of sessions.filter((x) => x.event_type === 'dissent')) {
      actions.push({
        ...base,
        event: 'dissent',
        action: 'comment',
        body: `Dissent: ${s.note || s.evidence || 'recorded'}.`,
      });
    }
    const knowledgeDone = sessions.some((s) => s.event_type === 'phase_completed' && s.phase === 'knowledge');
    if (knowledgeDone) {
      actions.push({
        ...base,
        event: 'slice_done',
        action: 'close_scope',
        body: `Slice \`${sliceId}\` DONE.`,
      });
    }
  }

  if (!handoffs.length) warns.push('no docs/pitches/*/handoff.yaml found');

  return {
    generated_at: new Date().toISOString(),
    actions,
    warns,
    handoff_count: handoffs.length,
  };
}

export function applyTrackerSyncPlan(root, plan) {
  const dir = join(root, '.harness/state/tracker-sync');
  mkdirSync(dir, { recursive: true });
  const stamp = (plan.generated_at || new Date().toISOString()).replace(/[:.]/g, '-');
  const rel = `.harness/state/tracker-sync/${stamp}.json`;
  const receipt = {
    schema_version: '1.0',
    applied_at: new Date().toISOString(),
    note: 'Local receipt only — tracker MCP write remains with external-trackers skill / human.',
    plan,
  };
  writeFileSync(join(root, rel), `${JSON.stringify(receipt, null, 2)}\n`);
  return { receipt_path: rel, receipt };
}

export function formatTrackerSyncPlan(plan) {
  const lines = [
    '== tracker-sync plan (no MCP write) ==',
    `  actions  ${plan.actions.length}`,
    `  handoffs ${plan.handoff_count}`,
  ];
  for (const a of plan.actions.slice(0, 50)) {
    lines.push(`  • [${a.slice_id}] ${a.event} → ${a.action} (${a.tracker_type || '?'})`);
  }
  if (plan.actions.length > 50) lines.push(`  … +${plan.actions.length - 50} more`);
  for (const w of plan.warns || []) lines.push(`  WARN  ${w}`);
  return `${lines.join('\n')}\n`;
}
