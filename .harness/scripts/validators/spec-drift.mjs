import { runDrift } from '../drift-lib.mjs';

// DRIFT-06 is reported by validators/features.mjs; skip it here to avoid duplicate lines.
export default function validate(ctx) {
  const { root, fail, warn } = ctx;
  const { findings, notes } = runDrift({
    root,
    includeContract: false,
    prBranch: process.env.HARNESS_PR_BRANCH,
    prBody: process.env.HARNESS_PR_BODY,
  });
  for (const f of findings) (f.severity === 'fail' ? fail : warn)(`${f.check} ${f.message}`);
  for (const n of notes) warn(`spec drift: ${n}`);
}
