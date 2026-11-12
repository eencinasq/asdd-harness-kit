import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { derivePatterns, loadProposals, proposalFindings } from '../learning-lib.mjs';
import { readSessions } from '../sync-state.mjs';

/** Contract problems of one steering proposal (QG-LEARN-03, QG-LEARN-05): one implementation, in learning-lib. */
export { proposalFindings };

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
