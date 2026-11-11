import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CHANGE_TYPES, PROPOSAL_STATUSES, derivePatterns, loadProposals } from '../learning-lib.mjs';
import { readSessions } from '../sync-state.mjs';

const DECIDED = new Set(['accepted', 'rejected', 'applied']);

/** Contract problems of one steering proposal (QG-LEARN-03, QG-LEARN-05). */
export function proposalFindings(root, proposal, patternIds) {
  const out = [];
  const where = proposal.file;
  const name = where.split('/').pop();
  if (!proposal.id) return [`${where}: missing frontmatter (id, pattern, status, control, change, success)`];
  if (!/^SP-\d{3,}$/.test(proposal.id) || !name.startsWith(proposal.id)) out.push(`${where}: id "${proposal.id}" must be SP-NNN and match the file name`);
  if (!proposal.pattern) out.push(`${where}: missing pattern`);
  else if (!patternIds.has(proposal.pattern)) out.push(`${where}: pattern ${proposal.pattern} matches no learning signal (run learn.mjs --all)`);
  if (!PROPOSAL_STATUSES.includes(proposal.status)) out.push(`${where}: status must be one of ${PROPOSAL_STATUSES.join(', ')} (got "${proposal.status ?? ''}")`);
  if (!CHANGE_TYPES.includes(proposal.change)) out.push(`${where}: change must be one of ${CHANGE_TYPES.join(', ')} (got "${proposal.change ?? ''}")`);
  const control = String(proposal.control ?? '').split('#')[0].trim();
  if (!control || control.startsWith('<')) out.push(`${where}: control must name the guide or sensor file to change`);
  else if (!existsSync(join(root, control))) out.push(`${where}: control ${control} does not exist`);
  if (!proposal.success || proposal.success.startsWith('<')) out.push(`${where}: success criterion is unfilled`);
  if (DECIDED.has(proposal.status) && !proposal.decided_by) out.push(`${where}: status ${proposal.status} needs decided_by (Tech Lead decision)`);
  if (proposal.status === 'applied' && !proposal.applied_commit) out.push(`${where}: status applied needs applied_commit (the commit that changed ${control || 'the control'})`);
  if (proposal.applied_at && !Number.isFinite(Date.parse(proposal.applied_at))) out.push(`${where}: applied_at must be an ISO date`);
  return out;
}

/**
 * Whether `applied_commit` really changed the control (QG-LEARN-05).
 * Returns { fail } when it did not, { warn } when git cannot tell, or {}.
 */
export function appliedCommitFinding(root, proposal) {
  if (proposal.status !== 'applied' || !proposal.applied_commit) return {};
  const where = proposal.file;
  const control = String(proposal.control ?? '').split('#')[0].trim();
  const run = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (run(['rev-parse', '--git-dir']).status !== 0) return { warn: `${where}: not a git repository — cannot verify applied_commit` };
  if (run(['cat-file', '-e', `${proposal.applied_commit}^{commit}`]).status !== 0) {
    return { fail: `${where}: applied_commit ${proposal.applied_commit} is not a commit in this repository` };
  }
  const files = run(['show', '--name-only', '--format=', proposal.applied_commit]).stdout.split('\n').map((f) => f.trim());
  if (control && !files.some((f) => f === control || f.startsWith(`${control.replace(/\/$/, '')}/`))) {
    return { fail: `${where}: applied_commit ${proposal.applied_commit} does not change ${control}` };
  }
  return {};
}

/**
 * Self-improving harness (QG-LEARN-*).
 * WARN: an open pattern without a proposal, or an applied change that did not stop it.
 * FAIL: a malformed proposal, or a slice that completed Knowledge while a pattern it
 * contributed to is still open.
 */
export default function validate(ctx) {
  const { root, fail, warn } = ctx;
  const proposals = loadProposals(root);
  const { patterns } = derivePatterns(root, { proposals });
  const ids = new Set(patterns.map((p) => p.id));

  for (const p of proposals) {
    const findings = proposalFindings(root, p, ids);
    for (const f of findings) fail(`QG-LEARN-03 ${f}`);
    if (findings.length) continue;
    const commit = appliedCommitFinding(root, p);
    if (commit.fail) fail(`QG-LEARN-05 ${commit.fail}`);
    if (commit.warn) warn(`QG-LEARN-05 ${commit.warn}`);
  }

  const open = patterns.filter((p) => p.status === 'open');
  for (const p of open) {
    const action = p.kind === 'noise' ? 'tune or remove the sensor' : 'change the guide or sensor that let it through';
    const why = p.reopened ? 'an applied proposal did not stop it' : 'no steering proposal';
    warn(`QG-LEARN-03 pattern ${p.id} (${p.signature}, ×${p.occurrences}, ${p.kind}): ${why} — ${action}: asdd learn --propose ${p.id}`);
  }

  const slicesDir = join(root, '.harness/state/slices');
  for (const p of open) {
    for (const sliceId of p.slices) {
      const sessions = readSessions(join(slicesDir, sliceId));
      if (sessions.some((s) => s.event_type === 'phase_completed' && s.phase === 'knowledge')) {
        fail(`QG-LEARN-04 slice "${sliceId}" completed Knowledge while pattern ${p.id} (${p.signature}) it contributed to is open — add a steering proposal (accepted or rejected counts) for it`);
      }
    }
  }
}
