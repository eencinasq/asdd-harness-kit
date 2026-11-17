#!/usr/bin/env node
/**
 * asdd skill-eval — deterministic per-skill task fixtures (P5.2, gap G16).
 * Usage: asdd skill-eval [--skill <name>] [--baseline <ref>] [--fixtures <dir>] [--json]
 *
 * Runs the fixtures under cli/eval/skills/<skill>/ and reports a pass rate per skill.
 * --baseline <ref> re-scores each fixture against the skill body at that git ref
 * (git show <ref>:<path>, never a checkout) and reports improved / regressed /
 * unchanged; any regression exits non-zero and names the regressed fixtures.
 */
import { runSkillEval, formatSkillEvalReport } from './skill-eval-lib.mjs';

const argv = process.argv.slice(2);
const wantJson = argv.includes('--json');
const opt = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

const suite = runSkillEval({
  root: process.cwd(),
  skill: opt('--skill'),
  baseline: opt('--baseline'),
  fixturesDir: opt('--fixtures'),
});
if (wantJson) process.stdout.write(`${JSON.stringify(suite, null, 2)}\n`);
else process.stdout.write(formatSkillEvalReport(suite));
process.exit(suite.ok ? 0 : 1);
