#!/usr/bin/env node
/**
 * asdd mutate — mutation testing as a coverage sensor (slice mutation-testing).
 *
 *   asdd mutate --slice <id> [--feature <TASK-NNN>] [--json]
 *
 * Runs the project's `Mutation command` binding (quality-gates.project.md) once, with `{files}` replaced by the
 * selected features' files, and classifies the exit: 0 → pass, non-zero → survivors (the binding wraps its tool so a
 * surviving mutant exits non-zero, the same contract as `Contract command`). No binding → unconfigured (not a pass);
 * no file → no-files; cannot start or too slow → error. Opt-in: no hook or `asdd check` runs it (runs take minutes).
 */
import { spawnSync } from 'node:child_process';

import { isExempt, harnessManaged, listSlices, readBinding, testFileMatcher } from './drift-lib.mjs';
import { scopeFiles } from './scope-lib.mjs';
import { normalizeScopePath } from './validators/paths.mjs';
import { UsageError, parseCommand, runMain } from './commands.mjs';

/** A wrong command line: the problem, then the command's usage (REQ-005). */
const usageError = (problem) => new UsageError(`${problem}\nusage: asdd mutate --slice <id> [options] (asdd mutate --help)`);

const BINDING = '.harness/steering/quality-gates.project.md';
export const TIMEOUT_MS = 30 * 60 * 1000;
export const OUTPUT_TAIL = 4000;
/** Documentation and data files: never handed to a mutation tool. */
const NON_SOURCE = /\.(md|mdx|txt|json|ya?ml|toml|lock|csv|svg|png|jpe?g|gif|html|css)$/i;
const EXIT = { pass: 0, survivors: 1, unconfigured: 0, 'no-files': 0, error: 2 };

/** POSIX single-quote a path for a shell command line. */
const shQuote = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`;

/**
 * The selected features (REQ-002: one feature whatever its status; else in_progress and passing) and their files:
 * existing files matching scope_paths, minus test files, harness-managed paths, and documentation/data files.
 * @returns {{ features: string[], files: string[] }}
 */
export function mutationTargets(root, sliceId, featureId) {
  const slice = listSlices(root).find((s) => s.slice_id === sliceId);
  if (!slice) throw usageError(`unknown slice: ${sliceId}`);
  const selected = featureId
    ? slice.features.filter((f) => f.id === featureId)
    : slice.features.filter((f) => f.status === 'in_progress' || f.status === 'passing');
  if (featureId && !selected.length) throw usageError(`unknown feature: ${featureId} in slice ${sliceId}`);
  const scopes = selected.flatMap((f) => (Array.isArray(f.scope_paths) ? f.scope_paths : []).map(normalizeScopePath).filter(Boolean));
  const isTest = testFileMatcher(root);
  const managed = harnessManaged(root);
  const files = [...scopeFiles(root, scopes)]
    .filter((f) => !isTest(f) && !isExempt(f, managed) && !f.startsWith('.harness/') && !NON_SOURCE.test(f))
    .sort();
  return { features: selected.map((f) => f.id), files: [...new Set(files)] };
}

/**
 * REQ order: the slice and feature (REQ-005) → the binding (REQ-003) → the files (REQ-004) → the run (REQ-001/006/007).
 * `exec` is injectable for tests; it receives the command line and returns spawnSync's result shape.
 */
export function runMutation({ root, sliceId, featureId, exec = defaultExec }) {
  const { features, files } = mutationTargets(root, sliceId, featureId);
  const base = { slice: sliceId, features, files, files_substituted: false, command: null, exit_code: null, output_tail: null };
  const [bound] = readBinding(root, BINDING, 'Mutation command');
  if (!bound) return { status: 'unconfigured', ...base };
  if (!files.length) return { status: 'no-files', ...base };
  const substituted = bound.includes('{files}');
  const command = substituted ? bound.replaceAll('{files}', files.map(shQuote).join(' ')) : bound;
  const r = exec(command, root);
  const output = `${r.stdout ?? ''}\n${r.stderr ?? ''}`.trim();
  const ran = { ...base, files_substituted: substituted, command, exit_code: r.status ?? null, output_tail: output.slice(-OUTPUT_TAIL) };
  if (r.error || r.status === null) {
    const why = r.error?.code === 'ETIMEDOUT' || r.signal ? `timed out after ${TIMEOUT_MS / 60000} min` : r.error?.message ?? 'did not start';
    return { status: 'error', ...ran, output_tail: `${why}\n${ran.output_tail}`.trim().slice(-OUTPUT_TAIL) };
  }
  return { status: r.status === 0 ? 'pass' : 'survivors', ...ran };
}

/** The bound command is project-owned steering (trusted like Audit commands); the paths are single-quoted. */
function defaultExec(command, cwd) {
  return spawnSync(command, { cwd, shell: true, encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 });
}

const LABEL = { pass: 'PASS', survivors: 'FAIL', error: 'FAIL', unconfigured: 'SKIP', 'no-files': 'SKIP' };

export function formatMutation(result) {
  const what =
    result.status === 'unconfigured'
      ? 'unconfigured (not a pass): bind `Mutation command` in .harness/steering/quality-gates.project.md'
      : result.status === 'no-files'
        ? `no files to mutate in ${result.features.join(', ') || 'no selected feature'}`
        : `${result.status}; ${result.files.length} file(s)${result.files_substituted ? '' : ' (no {files} in the command: it ran unchanged)'}; ${result.command}`;
  const lines = [`${LABEL[result.status]}  mutation — ${what}`];
  if (result.status === 'survivors' || result.status === 'error') lines.push(result.output_tail);
  return `${lines.join('\n')}\n`;
}

export async function run(argv = process.argv.slice(2)) {
  const { values } = parseCommand('mutate', argv);
  if (!values.slice) throw usageError('missing --slice <id>');
  const result = runMutation({ root: process.cwd(), sliceId: values.slice, featureId: values.feature });
  process.stdout.write(values.json ? `${JSON.stringify(result, null, 2)}\n` : formatMutation(result));
  return EXIT[result.status];
}

await runMain(import.meta.url, run);
