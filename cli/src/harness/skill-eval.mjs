#!/usr/bin/env node
/**
 * asdd skill-eval — deterministic per-skill task fixtures (P5.2, gap G16).
 * Usage: asdd skill-eval [--skill <name>] [--baseline <ref>] [--fixtures <dir>] [--json]
 *
 * Runs the fixtures shipped with the kit (cli/eval/skills/<skill>/) plus the project's own under
 * .harness/eval/skills/<skill>/ (same file name overrides the shipped case), and reports a pass rate per skill.
 * --fixtures <dir> evaluates only that directory. A case whose `requires` is unmet is reported as skipped.
 * --baseline <ref> re-scores each fixture against the skill body at that git ref
 * (git show <ref>:<path>, never a checkout) and reports improved / regressed /
 * unchanged; any regression exits non-zero and names the regressed fixtures.
 */
import { join } from 'node:path';

import { PROJECT_FIXTURES_REL, formatSkillEvalReport, runSkillEval } from './skill-eval-lib.mjs';
import { parseCommand, runMain } from './commands.mjs';

export async function run(argv = process.argv.slice(2)) {
  const { values } = parseCommand('skill-eval', argv);
  const wantJson = values.json;

  const root = process.cwd();
  const fixturesDir = values.fixtures;
  const suite = runSkillEval({
    root,
    skill: values.skill,
    baseline: values.baseline,
    fixturesDir,
    projectFixturesDir: fixturesDir ? undefined : join(root, PROJECT_FIXTURES_REL),
  });
  if (wantJson) process.stdout.write(`${JSON.stringify(suite, null, 2)}\n`);
  else process.stdout.write(formatSkillEvalReport(suite));
  return suite.ok ? 0 : 1;
}

await runMain(import.meta.url, run);
