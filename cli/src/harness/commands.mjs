/**
 * The harness commands of the asdd CLI: `asdd <command> [args]` runs the script next to this file, in the project of
 * the current directory. One table for the dispatcher, `asdd help`, and the docs.
 */
export const HARNESS_COMMANDS = {
  check: { script: 'check-invariants.mjs', help: 'every harness invariant and spec drift (Verify-on-Stop runs it)' },
  verify: { script: 'verify-on-stop.mjs', help: 'the Stop hook: runs check --live, blocks the session on FAIL (stdin: hook payload)' },
  gate: { script: 'command-gate.mjs', help: 'the shell command hook: allow / deny (stdin: hook payload)' },
  drift: { script: 'check-spec-drift.mjs', help: 'spec drift DRIFT-01…07 [--json] [--base <ref>] [--target <ref>] [--slice <id>] [--requirements]' },
  'check-config': { script: 'check-project-config.mjs', help: '.harness/config/project.json against its schema' },
  'skills-index': { script: 'check-skills-index.mjs', help: 'the skills index in skills.md [--write]' },
  status: {
    script: 'harness-status.mjs',
    help: 'slices, phases, open learning patterns [--metrics] [--json] [--html]',
  },
  converge: {
    script: 'converge.mjs',
    help: 'cheap feature converge: req_ids, test mentions, evidence [--slice <id>] [--strict] [--json]',
  },
  'converge-eval': {
    script: 'converge-eval.mjs',
    help: 'score EARS/converge fixtures under cli/eval/converge-ears [--json] [--cases <dir>]',
  },
  waves: {
    script: 'waves.mjs',
    help: 'parallelism hints from feature owners/deps/scopes [--slice <id>] [--json]',
  },
  portfolio: {
    script: 'portfolio.mjs',
    help: 'read-only multi-repo summary from .harness/config/portfolio.json [--json]',
  },
  'tracker-sync': {
    script: 'tracker-sync.mjs',
    help: 'plan bi-directional tracker sync from handoff+sessions [--slice <id>] [--json] [--apply]',
  },
  'spec-source': {
    script: 'spec-source.mjs',
    help: 'experimental REQ inventory (requires capabilities.spec_as_source) [--slice <id>] [--json]',
  },
  'init-flow': {
    script: 'init-flow.mjs',
    help: '15-minute brownfield path: install (if needed), one lite slice, minimal feature, asdd check',
  },
  sync: { script: 'sync-state.mjs', help: 'regenerate manifests, registry, PROGRESS.md, knowledge [--slice <id>]' },
  repair: { script: 'repair.mjs', help: 'repair harness layout (slices, state, specs, features) then sync [--dry-run] [--slice <id>] [--json]' },
  slice: {
    sub: {
      init: { script: 'init-slice.mjs', help: 'start a slice: slice init <id> [--full | --hotfix]' },
      escalate: { script: 'escalate-slice.mjs', help: 'lite/hotfix → escalated: slice escalate <id> --reasons "E1,E4" [--by <owner>] [--note "why"]' },
      amend: { script: 'amend-slice.mjs', help: 'reopen DONE slice: slice amend <id> [--note "…"] [--by <owner>]' },
    },
  },
  knowledge: {
    sub: {
      sync: { script: 'sync-knowledge.mjs', help: 'rebuild the knowledge index [--status] [--embed] [--backend=jsonl|sqlite|auto]' },
      search: { script: 'knowledge-query.mjs', pass: true, help: 'knowledge search "<query>" [--k 5] [--slice <id>]' },
      trace: { script: 'knowledge-query.mjs', pass: true, help: 'knowledge trace <node-id> [--depth 2]' },
      slice: { script: 'knowledge-query.mjs', pass: true, help: 'knowledge slice <slice-id>' },
      status: { script: 'knowledge-query.mjs', pass: true, help: 'knowledge status' },
      patterns: { script: 'knowledge-query.mjs', pass: true, help: 'knowledge patterns [--status <s>]' },
    },
  },
  learn: { script: 'learn.mjs', help: 'learning patterns [--all|--json|--summary|--signatures|--export|--propose <LP-id>]' },
  audit: { script: 'audit-codebase.mjs', help: 'codebase audit [--json] [--no-write] [--hotspots N] [--since 90.days]' },
  triage: { script: 'audit-triage.mjs', help: 'TL triage: triage <finding-id> --dismiss --reason "…" | --confirm | --clear | --list' },
};

/**
 * `asdd <args>` → { script, argv } for a harness command, or null when `args[0]` is not one.
 * `pass` subcommands keep their name as the script's first argument (knowledge search … → knowledge-query.mjs search …).
 */
export function resolveHarnessCommand(args) {
  const [name, ...rest] = args;
  const entry = HARNESS_COMMANDS[name];
  if (!entry) return null;
  if (!entry.sub) return { name, ...entry, argv: rest };
  const [subName, ...subRest] = rest;
  const sub = entry.sub[subName];
  if (!sub) return { name, error: `usage: asdd ${name} ${Object.keys(entry.sub).join('|')} …` };
  return { name: `${name} ${subName}`, ...sub, argv: sub.pass ? [subName, ...subRest] : subRest };
}
