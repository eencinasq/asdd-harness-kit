#!/usr/bin/env node
/**
 * Codebase auditor — computational pass (continuous drift and health sensor).
 *
 *   node .harness/scripts/audit-codebase.mjs [--json] [--no-write] [--hotspots N] [--since 90.days]
 *
 * 1. Spec drift over all active slices (requirement checks forced).
 * 2. Unowned code: tracked product files (tests excluded) no slice maps or owns.
 * 3. Audit commands (quality-gates.project.md) and the domain Gate command, or "unconfigured".
 * 4. Semgrep over the repo (selected .semgrep.yml, or rules generated from the architecture specs).
 * 5. Churn hotspots ranked by churn, requirement links, and findings.
 * 5. Writes .harness/audits/<timestamp>.json; carries first_seen/occurrences from the previous report.
 *
 * Never edits product code. TL dismissals in .harness/audits/triage.json are suppressed
 * while the files they point to are unchanged. The inferential pass is the codebase-audit skill.
 * Design: https://github.com/eencinasq/asdd-harness-kit#spec-drift-and-codebase-audit
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  findingId,
  harnessManaged,
  isExempt,
  isGitRepo,
  listSlices,
  mappedPaths,
  matchesPath,
  readBinding,
  runDrift,
  testFiles,
  trackedFiles,
} from './drift-lib.mjs';
import { AUDITS_DIR, applyTriage, latestReport } from './audit-lib.mjs';
import { loadArchitectureSources, runSemgrepScan } from './semgrep-lib.mjs';

const COMMAND_TIMEOUT_MS = 300000;
const RECURRING = 3;

/** Harness, runtime, and documentation files are not product code. */
const NOT_PRODUCT = [
  /^\.(harness|agents|cursor|claude|github|gitlab|devin|kiro|junie|kimi-code|opencode|idea|vscode)\//,
  /^(docs|runtimes)\//,
  /\.md$/i,
  /^[^/]+\.(json|ya?ml|toml|lock)$/i,
  /(^|\/)\.[^/]+$/,
];

export function isProductFile(file, managed) {
  return !isExempt(file, managed) && !NOT_PRODUCT.some((re) => re.test(file));
}

function git(root, args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : '';
}

function unownedFindings(root, slices, files, gitAvailable) {
  const owned = slices.flatMap((s) => mappedPaths(root, s));
  const tests = new Set(testFiles(root, gitAvailable));
  const managed = harnessManaged(root);
  const byDir = new Map();
  for (const f of files) {
    if (!isProductFile(f, managed) || tests.has(f) || owned.some((m) => matchesPath(f, m))) continue;
    const dir = dirname(f) === '.' ? '(root)' : dirname(f);
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir).push(f);
  }
  return [...byDir.entries()].sort().map(([dir, paths]) => {
    const base = { check: 'UNOWNED', severity: 'advisory', slice_id: null, node: `dir:${dir}` };
    return {
      id: findingId(base),
      ...base,
      paths,
      message: `${paths.length} product file(s) in ${dir} have no slice or feature that owns them`,
    };
  });
}

function runCommand(root, name, command) {
  const r = spawnSync(command, { cwd: root, shell: true, encoding: 'utf8', timeout: COMMAND_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 });
  const output = `${r.stdout ?? ''}\n${r.stderr ?? ''}`.trim();
  if (r.error || r.status === null) return { name, command, status: 'error', message: r.error?.message ?? 'timed out' };
  return { name, command, status: r.status === 0 ? 'pass' : 'fail', exit_code: r.status, output: r.status === 0 ? undefined : output.slice(-4000) };
}

/** `name=command` entries from the Audit commands binding, plus the domain Gate command as "architecture". */
export function auditCommands(root) {
  const entries = readBinding(root, '.harness/steering/quality-gates.project.md', 'Audit commands').map((v) => {
    const i = v.indexOf('=');
    return i > 0 ? { name: v.slice(0, i).trim(), command: v.slice(i + 1).trim() } : { name: v, command: v };
  });
  const [gate] = readBinding(root, '.harness/steering/domain-layer.project.md', 'Gate command');
  return { entries, gate: gate ? { name: 'architecture', command: gate } : null };
}

function commandFindings(results) {
  return results.filter((r) => r.status !== 'pass').map((r) => {
    const base = { check: 'AUDIT-CMD', severity: r.status === 'fail' ? 'fail' : 'warn', slice_id: null, node: `command:${r.name}` };
    return { id: findingId(base), ...base, paths: [], message: `audit command "${r.name}" ${r.status === 'fail' ? `failed (exit ${r.exit_code})` : `errored: ${r.message}`}` };
  });
}

function hotspots(root, slices, findings, { since, limit }) {
  const churn = new Map();
  const managed = harnessManaged(root);
  for (const f of git(root, ['log', `--since=${since}`, '--format=', '--name-only']).split('\n')) {
    const file = f.trim();
    if (file && isProductFile(file, managed)) churn.set(file, (churn.get(file) ?? 0) + 1);
  }
  const features = slices.flatMap((s) => s.features);
  const reqLinks = (file) => features
    .filter((f) => (f.scope_paths ?? []).some((p) => matchesPath(file, p)))
    .reduce((n, f) => n + (f.req_ids?.length ?? 0), 0);
  const findingCount = (file) => findings.filter((x) => x.check !== 'UNOWNED' && x.paths?.includes(file)).length;
  return [...churn.keys()]
    .map((path) => {
      const c = churn.get(path);
      const links = reqLinks(path);
      const hits = findingCount(path);
      return { path, churn: c, req_links: links, findings: hits, score: c + 2 * links + 5 * hits };
    })
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, limit);
}

/** Carry first_seen and occurrences over from the previous report. */
function carryOver(findings, previous, now) {
  const prev = new Map((previous?.findings ?? []).map((f) => [f.id, f]));
  return findings.map((f) => {
    const p = prev.get(f.id);
    return { source: 'computational', ...f, first_seen: p?.first_seen ?? now, last_seen: now, occurrences: (p?.occurrences ?? 0) + 1 };
  });
}

export function runAudit({ root = process.cwd(), hotspotLimit = 10, since = '90.days', now = new Date().toISOString() } = {}) {
  const gitAvailable = isGitRepo(root);
  const slices = listSlices(root);
  const drift = runDrift({ root, requirementChecks: true });
  const files = trackedFiles(root, gitAvailable);
  const managed = harnessManaged(root);

  const { entries, gate } = auditCommands(root);
  const commands = [...entries, ...(gate ? [gate] : [])].map((c) => runCommand(root, c.name, c.command));
  const unconfigured = [];
  if (!entries.length) unconfigured.push('audit-commands');
  if (!gate) unconfigured.push('architecture');

  const semgrep = runSemgrepScan({
    root,
    sources: loadArchitectureSources(root),
    bin: process.env.HARNESS_SEMGREP || 'semgrep',
  });
  if (semgrep.status !== 'pass' && semgrep.status !== 'fail') unconfigured.push('semgrep');

  const raw = [
    ...drift.findings,
    ...unownedFindings(root, slices, files, gitAvailable),
    ...commandFindings(commands),
    ...semgrep.findings,
  ];
  const previous = latestReport(root)?.report ?? null;
  const all = carryOver(raw, previous, now);
  const { kept, suppressed } = applyTriage(root, all);

  return {
    generated_at: now,
    commit: gitAvailable ? git(root, ['rev-parse', '--short', 'HEAD']).trim() || null : null,
    summary: {
      files_analyzed: files.filter((f) => isProductFile(f, managed)).length,
      spec_compliance: drift.summary.spec_compliance,
      must_requirements: drift.summary.must_requirements,
      drift_level: kept.some((f) => f.severity === 'fail') ? 'blocking' : kept.some((f) => f.severity === 'warn') ? 'warning' : 'clean',
      slices: slices.map((s) => s.slice_id),
    },
    findings: kept,
    suppressed: suppressed.map((f) => ({ id: f.id, check: f.check, reason: f.triage.reason })),
    recurring: kept.filter((f) => f.occurrences >= RECURRING).map((f) => f.id),
    hotspots: gitAvailable ? hotspots(root, slices, kept, { since, limit: hotspotLimit }) : [],
    commands,
    semgrep: {
      status: semgrep.status,
      source: semgrep.source,
      ...(semgrep.path ? { path: semgrep.path } : {}),
      ...(semgrep.message ? { message: semgrep.message } : {}),
    },
    unconfigured,
    notes: drift.notes,
  };
}

export function writeReport(root, report) {
  const name = `${report.generated_at.replace(/[:.]/g, '-')}.json`;
  const rel = `${AUDITS_DIR}/${name}`;
  mkdirSync(join(root, AUDITS_DIR), { recursive: true });
  writeFileSync(join(root, rel), `${JSON.stringify(report, null, 2)}\n`);
  return rel;
}

function parseArgs(argv) {
  const opts = { json: false, write: true, hotspots: 10, since: '90.days' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (a === '--no-write') opts.write = false;
    else if (a === '--hotspots') opts.hotspots = Number(argv[++i]) || 10;
    else if (a === '--since') opts.since = argv[++i];
    else if (a === '-h' || a === '--help') opts.help = true;
  }
  return opts;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log('Usage: node .harness/scripts/audit-codebase.mjs [--json] [--no-write] [--hotspots N] [--since 90.days]');
    process.exit(0);
  }
  const root = process.cwd();
  const report = runAudit({ root, hotspotLimit: opts.hotspots, since: opts.since });
  const rel = opts.write ? writeReport(root, report) : null;
  if (opts.json) {
    console.log(JSON.stringify({ ...report, path: rel }, null, 2));
  } else {
    const by = (s) => report.findings.filter((f) => f.severity === s).length;
    console.log(`audit: ${report.findings.length} finding(s) — fail ${by('fail')}, warn ${by('warn')}, advisory ${by('advisory')}; ${report.suppressed.length} dismissed by triage`);
    console.log(`drift_level ${report.summary.drift_level}; spec_compliance ${report.summary.spec_compliance ?? 'n/a'}; files_analyzed ${report.summary.files_analyzed}`);
    if (report.unconfigured.length) console.log(`unconfigured (not a pass): ${report.unconfigured.join(', ')}`);
    if (report.semgrep) console.log(`semgrep ${report.semgrep.status}${report.semgrep.source ? ` (${report.semgrep.source})` : ''}${report.semgrep.path ? ` ${report.semgrep.path}` : ''}`);
    if (report.recurring.length) console.log(`recurring (>= ${RECURRING} occurrences, QG-DEB-06): ${report.recurring.join(', ')}`);
    for (const h of report.hotspots.slice(0, 5)) console.log(`hotspot ${h.path} score ${h.score} (churn ${h.churn}, req ${h.req_links}, findings ${h.findings})`);
    if (rel) console.log(`wrote ${rel}`);
  }
}
