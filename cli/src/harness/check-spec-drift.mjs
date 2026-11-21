#!/usr/bin/env node
/**
 * Spec drift check (DRIFT-01 … DRIFT-07).
 *
 * Usage: asdd drift [--json] [--base <ref>] [--target <ref>]
 *          [--slice <id>]... [--requirements] [--pr-branch <name>] [--pr-body <text>]
 *
 * PR context also comes from HARNESS_PR_BRANCH / HARNESS_PR_BODY (CI).
 * Exit 1 when any finding is FAIL.
 */
import { runDrift } from './drift-lib.mjs';
import { parseCommand, runMain } from './commands.mjs';

export async function run(argv = process.argv.slice(2)) {
  const { values } = parseCommand('drift', argv);

  const result = runDrift({
    root: process.cwd(),
    base: values.base,
    target: values.target,
    sliceIds: values.slice ?? [],
    requirementChecks: values.requirements,
    prBranch: values['pr-branch'] ?? process.env.HARNESS_PR_BRANCH,
    prBody: values['pr-body'] ?? process.env.HARNESS_PR_BODY,
  });

  if (values.json) {
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
  return result.findings.some((f) => f.severity === 'fail') ? 1 : 0;
}

await runMain(import.meta.url, run);
