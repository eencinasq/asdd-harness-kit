#!/usr/bin/env node
/**
 * Spec drift check (DRIFT-01 … DRIFT-07).
 *
 * Usage: node .harness/scripts/check-spec-drift.mjs [--json] [--base <ref>] [--target <ref>]
 *          [--slice <id>]... [--requirements] [--pr-branch <name>] [--pr-body <text>]
 *
 * PR context also comes from HARNESS_PR_BRANCH / HARNESS_PR_BODY (CI).
 * Exit 1 when any finding is FAIL.
 */
import { runDrift } from './drift-lib.mjs';

const args = process.argv.slice(2);
const value = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const sliceIds = args.flatMap((a, i) => (a === '--slice' && args[i + 1] ? [args[i + 1]] : []));

const result = runDrift({
  root: process.cwd(),
  base: value('--base'),
  target: value('--target'),
  sliceIds,
  requirementChecks: args.includes('--requirements'),
  prBranch: value('--pr-branch') ?? process.env.HARNESS_PR_BRANCH,
  prBody: value('--pr-body') ?? process.env.HARNESS_PR_BODY,
});

if (args.includes('--json')) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  for (const f of result.findings) {
    const line = `${f.severity === 'fail' ? 'FAIL' : 'WARN'}  ${f.check} ${f.message}`;
    (f.severity === 'fail' ? console.error : console.warn)(line);
  }
  for (const n of result.notes) console.warn(`WARN  spec drift: ${n}`);
  const s = result.summary;
  console.log(
    `${s.drift_level === 'blocking' ? 'FAIL' : 'PASS'}  spec drift — ${s.drift_level}; files ${s.files_analyzed}; compliance ${s.spec_compliance ?? 'n/a'}; base ${s.base ?? 'none'}`
  );
}
process.exitCode = result.findings.some((f) => f.severity === 'fail') ? 1 : 0;
