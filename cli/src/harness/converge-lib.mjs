/**
 * Cheap converge sensor (ASDD-ROADMAP P1.3): before a feature goes `passing`,
 * require req_ids (when the slice has MUST reqs), test mentions, and evidence.
 */
import { join } from 'node:path';
import {
  listSlices,
  mentionedRequirementIds,
  parseRequirements,
  testFiles,
  isGitRepo,
} from './drift-lib.mjs';

/** Re-export for tests that need to inject. */
export { parseRequirements };

/**
 * @param {object} opts
 * @param {string} opts.root
 * @param {string} [opts.sliceId]
 * @param {boolean} [opts.strict] missing test mention → fail
 * @param {ReturnType<typeof listSlices>} [opts.slices]
 * @param {string[]} [opts.tests]
 */
export function runConverge(opts) {
  const root = opts.root;
  const strict = Boolean(opts.strict);
  const slices = opts.slices ?? listSlices(root);
  const selected = opts.sliceId ? slices.filter((s) => s.slice_id === opts.sliceId) : slices.filter((s) => s.status === 'in_progress');
  const gitAvailable = isGitRepo(root);
  const tests = opts.tests ?? testFiles(root, gitAvailable);
  const findings = [];

  for (const s of selected) {
    const reqs = parseRequirements(root, s.slice_id);
    const mustIds = reqs.filter((r) => r.must).map((r) => r.id);
    const mentioned = mentionedRequirementIds(root, tests, reqs.map((r) => r.id));

    for (const f of s.features) {
      if (f.status !== 'in_progress' && f.status !== 'passing') continue;
      const node = `feature:${s.slice_id}:${f.id}`;
      const reqIds = Array.isArray(f.req_ids) ? f.req_ids.map(String) : [];

      if (mustIds.length && reqIds.length === 0) {
        findings.push({
          code: 'CONVERGE-01',
          severity: 'fail',
          slice_id: s.slice_id,
          feature_id: f.id,
          node,
          message: `feature ${f.id} has no req_ids while slice has MUST requirements`,
        });
      }

      for (const id of reqIds) {
        if (!mentioned.has(id)) {
          findings.push({
            code: 'CONVERGE-02',
            severity: strict ? 'fail' : 'warn',
            slice_id: s.slice_id,
            feature_id: f.id,
            node,
            message: `feature ${f.id} lists ${id} but no test file mentions it`,
          });
        }
      }

      if (f.status === 'passing' && !String(f.evidence ?? '').trim()) {
        findings.push({
          code: 'CONVERGE-03',
          severity: 'fail',
          slice_id: s.slice_id,
          feature_id: f.id,
          node,
          message: `feature ${f.id} is passing without evidence`,
        });
      }
    }
  }

  const fails = findings.filter((x) => x.severity === 'fail');
  const warns = findings.filter((x) => x.severity === 'warn');
  return { findings, fails, warns, ok: fails.length === 0 };
}

/** Format for CLI / check-invariants lines. */
export function formatConvergeFindings(result) {
  const lines = [];
  for (const f of result.findings) {
    lines.push(`${f.severity.toUpperCase()}  ${f.code} ${f.message}`);
  }
  return lines;
}
