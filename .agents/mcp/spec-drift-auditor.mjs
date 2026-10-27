#!/usr/bin/env node
/**
 * spec-drift-auditor MCP server (zero-dependency stdio server).
 *
 * Governance view over the harness: spec drift, architecture rules, spec
 * compliance, CI gate text, and audit reports. Thin projection — every check
 * lives in .harness/scripts (drift-lib.mjs, audit-lib.mjs) so Verify-on-Stop,
 * CI, and chat run the same logic. Read-only: this server never writes files.
 *
 * Design: https://github.com/eencinasq/asdd-harness-kit#spec-drift-and-codebase-audit
 * Protocol: MCP over line-delimited JSON-RPC 2.0 on stdio
 *   (initialize, ping, tools/*, resources/*, prompts/*).
 * MCP App: when the host declares io.modelcontextprotocol/ui, audit_diff,
 *   verify_architecture_rules, verify_spec_compliance, audit_report,
 *   audit_finding, and generate_ci_gate link ui://spec-drift/dashboard (prebuilt
 *   .agents/mcp/ui/drift-dashboard.html; source tools/drift-dashboard/). Their
 *   results stay under UI_RESULT_BUDGET; the view loads the rest by calling
 *   the same tool with page_token, and source texts with
 *   verify_architecture_rules { source }.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { changedFiles, harnessManaged, isExempt, isGitRepo, readBinding, resolveBase, runDrift } from '../../.harness/scripts/drift-lib.mjs';
import { loadArchitectureSources, resolveSemgrepConfig, runSemgrepScan } from '../../.harness/scripts/semgrep-lib.mjs';
import { applyTriage, latestReport, listReports } from '../../.harness/scripts/audit-lib.mjs';

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'spec-drift-auditor', version: '1.0.0' };
const ROOT = process.env.HARNESS_ROOT || process.cwd();
const GATE_TIMEOUT_MS = 120000;

// MCP Apps (extension io.modelcontextprotocol/ui, spec 2026-01-26)
const UI_EXTENSION = 'io.modelcontextprotocol/ui';
const UI_MIME = 'text/html;profile=mcp-app';
const UI_URI = 'ui://spec-drift/dashboard';
const UI_FILE = fileURLToPath(new URL('./ui/drift-dashboard.html', import.meta.url));
const UI_TOOLS = new Set(['audit_diff', 'verify_architecture_rules', 'verify_spec_compliance', 'audit_report', 'audit_finding', 'generate_ci_gate']);
// Cursor moves tool results larger than about 13 KB into a file and then does not mount the
// MCP App, so UI results stay under this budget and the view pages in the rest.
const UI_RESULT_BUDGET = 8000;
const UI_PATHS_PER_FINDING = 5;
const PAGE_STORE_MAX = 20;

let lastDiffReport = null;
let uiEnabled = false;
const pages = new Map();
let pageSeq = 0;

// ------------------------------------------------------------------ helpers

function readText(rel) {
  try {
    return readFileSync(join(ROOT, rel), 'utf8');
  } catch {
    return null;
  }
}

function readJson(rel) {
  const text = readText(rel);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function git(args) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

function str(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

// ------------------------------------------------------- architecture rules

const LOCATION_RE = /([\w./@-]+\.[A-Za-z0-9]+):(\d+)(?::\d+)?\s*[-:]?\s*(.*)$/;

function sourcesNote(sources) {
  const filled = sources.filter((s) => s.filled).map((s) => s.path);
  const open = sources.filter((s) => !s.filled).map((s) => s.path);
  const loaded = filled.length ? ` Loaded rules from ${filled.join(', ')}.` : '';
  const pending = open.length ? ` Still unfilled: ${open.join(', ')}.` : '';
  return `${loaded}${pending}`;
}

function publishSources(sources, includeText) {
  return includeText ? sources : sources.map(({ text, ...rest }) => rest);
}

function publishSemgrep(semgrep, includeText) {
  return {
    status: semgrep.status,
    source: semgrep.source,
    ...(semgrep.path ? { path: semgrep.path } : {}),
    ...(semgrep.message ? { message: semgrep.message } : {}),
    ...(includeText && semgrep.yaml ? { yaml: semgrep.yaml } : {}),
  };
}

function architectureStatus(gateStatus, semgrepStatus, findings) {
  if (findings.some((f) => f.severity === 'fail') || gateStatus === 'fail' || semgrepStatus === 'fail') return 'fail';
  if (gateStatus === 'error' || semgrepStatus === 'error' || semgrepStatus === 'unavailable') return 'error';
  if (gateStatus === 'pass' || semgrepStatus === 'pass') return 'pass';
  return 'unconfigured';
}

export function verifyArchitectureRules(paths = [], { includeText = true } = {}) {
  const sources = loadArchitectureSources(ROOT, { includeText: true });
  const domainProject = sources.find((s) => s.id === 'domain-layer.project').path;
  const [command] = readBinding(ROOT, domainProject, 'Gate command');
  const semgrep = runSemgrepScan({
    root: ROOT,
    sources,
    paths,
    bin: process.env.HARNESS_SEMGREP || 'semgrep',
  });

  let gateStatus = 'unconfigured';
  let gateFindings = [];
  let exitCode;
  let output;
  let gateMessage = `No Gate command bound in ${domainProject}.`;
  if (command) {
    const r = spawnSync(command, {
      cwd: ROOT,
      shell: true,
      encoding: 'utf8',
      timeout: GATE_TIMEOUT_MS,
      env: { ...process.env, HARNESS_AUDIT_PATHS: paths.join(' ') },
      maxBuffer: 16 * 1024 * 1024,
    });
    if (r.error || r.status === null) {
      gateStatus = 'error';
      gateMessage = r.error?.message ?? 'gate command timed out';
    } else {
      exitCode = r.status;
      gateStatus = r.status === 0 ? 'pass' : 'fail';
      output = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
      gateFindings = output
        .split('\n')
        .map((line) => line.match(LOCATION_RE))
        .filter(Boolean)
        .map((m) => ({
          check: 'ARCH',
          severity: r.status === 0 ? 'warn' : 'fail',
          paths: [m[1]],
          line: Number(m[2]),
          message: m[3].trim() || 'architecture rule violation',
        }));
      if (paths.length && gateFindings.length) gateFindings = gateFindings.filter((f) => paths.includes(f.paths[0]));
      gateMessage = undefined;
    }
  }

  const findings = [...gateFindings, ...semgrep.findings];
  const status = architectureStatus(gateStatus, semgrep.status, findings);
  const semgrepView = publishSemgrep(semgrep, includeText);
  let message;
  if (status === 'unconfigured') {
    message = `${gateMessage} ${semgrep.message ?? ''}`.replace(/\s+/g, ' ').trim();
    message = `${message}${sourcesNote(sources)} This is not a pass.`;
  } else if (status === 'error') {
    message = [gateStatus === 'error' ? gateMessage : null, semgrep.status === 'error' || semgrep.status === 'unavailable' ? semgrep.message : null]
      .filter(Boolean)
      .join(' ');
  }

  return {
    status,
    ...(command ? { command } : { binding: `${domainProject} → Gate command` }),
    ...(exitCode !== undefined ? { exit_code: exitCode } : {}),
    findings,
    sources: publishSources(sources, includeText),
    semgrep: semgrepView,
    ...(message ? { message } : {}),
    ...(output && gateStatus !== 'pass' ? { output: output.trim().slice(-4000) } : {}),
  };
}

// ---------------------------------------------------------------- adapters

async function loadAdapters() {
  const dirs = ['.agents/mcp/adapters'];
  const modules = readJson('.harness/config/project.json')?.modules ?? {};
  for (const [name, enabled] of Object.entries(modules)) {
    if (enabled === true) dirs.push(`.agents/modules/${name}/adapters`);
  }
  const adapters = new Map();
  for (const dir of dirs) {
    const abs = join(ROOT, dir);
    if (!existsSync(abs)) continue;
    for (const file of readdirSync(abs).sort()) {
      if (!file.endsWith('.mjs') || file.endsWith('.test.mjs')) continue;
      try {
        const mod = (await import(pathToFileURL(join(abs, file)).href)).default;
        if (mod?.id && typeof mod.run === 'function' && !adapters.has(mod.id)) adapters.set(mod.id, mod);
      } catch (error) {
        process.stderr.write(`adapter ${dir}/${file} failed to load: ${error.message}\n`);
      }
    }
  }
  return adapters;
}

function earsAdapter(sliceId) {
  const res = runDrift({ root: ROOT, sliceIds: [sliceId], requirementChecks: true, includeContract: false });
  const findings = res.findings.filter((f) => f.check === 'DRIFT-03' || f.check === 'DRIFT-04');
  return {
    status: findings.some((f) => f.severity === 'fail') ? 'fail' : 'pass',
    spec_compliance: res.summary.spec_compliance,
    must_requirements: res.summary.must_requirements,
    findings,
  };
}

export async function verifySpecCompliance(sliceId, adapterId) {
  const known = new Set((readJson('.harness/state/manifest.json')?.active_slices ?? []).map((s) => (typeof s === 'string' ? s : s.slice_id)));
  if (!known.has(sliceId)) return { error: `unknown slice "${sliceId}"`, known: [...known] };
  const adapters = await loadAdapters();
  const available = ['ears', ...adapters.keys()];
  if (adapterId && !available.includes(adapterId)) {
    return { error: `unknown adapter "${adapterId}"`, available };
  }
  const results = {};
  if (!adapterId || adapterId === 'ears') results.ears = earsAdapter(sliceId);
  for (const [id, adapter] of adapters) {
    if (adapterId && adapterId !== id) continue;
    try {
      results[id] = await adapter.run({ root: ROOT, sliceId, readBinding });
    } catch (error) {
      results[id] = { status: 'error', findings: [], message: error.message };
    }
  }
  const all = Object.values(results).flatMap((r) => r.findings ?? []);
  return {
    slice_id: sliceId,
    adapters: results,
    summary: {
      spec_compliance: results.ears?.spec_compliance ?? null,
      drift_level: all.some((f) => f.severity === 'fail') ? 'blocking' : all.length ? 'warning' : 'clean',
    },
  };
}

// --------------------------------------------------------------- audit_diff

export function auditDiff({ base_branch, target_branch, mode = 'author', pr_body } = {}) {
  const review = mode === 'review';
  const target = str(target_branch);
  const prBranch = review ? target ?? git(['rev-parse', '--abbrev-ref', 'HEAD']) ?? '' : undefined;
  const probe = review ? runDrift({ root: ROOT, base: str(base_branch), target, prBranch, prBody: pr_body }) : null;
  const linked = probe?.summary.linked_slices ?? [];
  const res = review && linked.length
    ? runDrift({ root: ROOT, base: str(base_branch), target, sliceIds: linked, prBranch, prBody: pr_body })
    : probe ?? runDrift({ root: ROOT, base: str(base_branch), target });

  let findings = res.findings;
  let suppressed = [];
  if (review) ({ kept: findings, suppressed } = applyTriage(ROOT, findings));

  const targetRef = target ?? 'HEAD';
  const changed = isGitRepo(ROOT)
    ? changedFiles(ROOT, resolveBase(ROOT, str(base_branch), targetRef), targetRef).filter((f) => !isExempt(f, harnessManaged(ROOT)))
    : [];
  const architecture = verifyArchitectureRules(changed, { includeText: false });
  const all = [...findings, ...architecture.findings];
  const report = {
    mode,
    findings: all,
    suppressed,
    architecture: {
      status: architecture.status,
      command: architecture.command,
      message: architecture.message,
      sources: architecture.sources.map(({ id, path, filled }) => ({ id, path, filled })),
      semgrep: architecture.semgrep
        ? {
            status: architecture.semgrep.status,
            source: architecture.semgrep.source,
            ...(architecture.semgrep.path ? { path: architecture.semgrep.path } : {}),
            ...(architecture.semgrep.message ? { message: architecture.semgrep.message } : {}),
          }
        : undefined,
    },
    summary: {
      ...res.summary,
      drift_level: all.some((f) => f.severity === 'fail') ? 'blocking' : all.length ? 'warning' : 'clean',
    },
    notes: res.notes,
    generated_at: new Date().toISOString(),
  };
  lastDiffReport = report;
  return report;
}

// ----------------------------------------------------------- generate_ci_gate

const CI_TEMPLATES = {
  github: {
    path: '.github/workflows/harness-gates.yml',
    content: `name: harness-gates

on:
  push:
  pull_request:

jobs:
  harness:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - name: Harness invariants and spec drift
        env:
          HARNESS_PR_BRANCH: \${{ github.head_ref }}
          HARNESS_PR_BODY: \${{ github.event.pull_request.body }}
          HARNESS_DRIFT_BASE: \${{ github.event.pull_request.base.sha }}
        run: |
          node .harness/scripts/sync-state.mjs
          node .harness/scripts/check-invariants.mjs
`,
  },
  gitlab: {
    path: '.gitlab-ci.yml (job harness-gates)',
    content: `harness-gates:
  image: node:22
  variables:
    GIT_DEPTH: "0"
    HARNESS_PR_BRANCH: $CI_MERGE_REQUEST_SOURCE_BRANCH_NAME
    HARNESS_PR_BODY: $CI_MERGE_REQUEST_DESCRIPTION
    HARNESS_DRIFT_BASE: $CI_MERGE_REQUEST_DIFF_BASE_SHA
  script:
    - node .harness/scripts/sync-state.mjs
    - node .harness/scripts/check-invariants.mjs
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH
`,
  },
};

export function generateCiGate(provider) {
  const t = CI_TEMPLATES[provider];
  if (!t) return { error: `unknown provider "${provider}"`, available: Object.keys(CI_TEMPLATES) };
  return {
    provider,
    suggested_path: t.path,
    content: t.content,
    note: 'Text only. The job fails when check-invariants exits non-zero; thresholds live in quality-gates.md, not here. Write the file only when a mapped task names this path.',
  };
}

// ------------------------------------------------------------ audit reports

function reportFindings() {
  const latest = latestReport(ROOT);
  return { latest, findings: latest?.report?.findings ?? [] };
}

export function auditReport({ since, severity } = {}) {
  const { latest, findings } = reportFindings();
  if (!latest) {
    return { error: 'no audit report yet — run: node .harness/scripts/audit-codebase.mjs', reports: [] };
  }
  const sinceTime = since ? Date.parse(since) : NaN;
  const filtered = findings.filter((f) =>
    (!severity || f.severity === severity) &&
    (Number.isNaN(sinceTime) || Date.parse(f.last_seen ?? f.first_seen ?? 0) >= sinceTime));
  return { ...latest.report, path: latest.path, findings: filtered, reports: listReports(ROOT).slice(0, 10) };
}

async function traceNode(nodeId, depth = 2) {
  if (!nodeId) return null;
  let store;
  try {
    const { openStore } = await import('../../.harness/scripts/knowledge-store.mjs');
    store = await openStore(ROOT);
  } catch {
    return null;
  }
  if (!store) return null;
  const seen = new Set([nodeId]);
  const edgeKeys = new Set();
  const edges = [];
  let frontier = [nodeId];
  for (let d = 0; d < depth && frontier.length; d += 1) {
    const next = [];
    for (const id of frontier) {
      for (const e of await store.edgesIncident(id)) {
        const key = `${e.from}|${e.rel}|${e.to}`;
        if (!edgeKeys.has(key)) {
          edgeKeys.add(key);
          edges.push(e);
        }
        const other = e.from === id ? e.to : e.from;
        if (!seen.has(other)) {
          seen.add(other);
          next.push(other);
        }
      }
    }
    frontier = next;
  }
  const nodes = [];
  for (const id of seen) {
    const n = await store.nodeById(id);
    if (n) nodes.push(n);
  }
  return { start: nodeId, nodes, edges };
}

export async function auditFinding(id) {
  const pool = [...(lastDiffReport?.findings ?? []), ...reportFindings().findings];
  const finding = pool.find((f) => f.id === id);
  if (!finding) return { error: `finding ${id} not found in the latest audit_diff or audit report` };
  return { finding, trace: await traceNode(finding.node) };
}

// ------------------------------------------------------------ UI paging

function jsonSize(value) {
  return JSON.stringify(value, null, 2).length;
}

function tally(findings, keyOf) {
  const counts = {};
  for (const f of findings) {
    const key = keyOf(f);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function trimPaths(f) {
  return f.paths?.length > UI_PATHS_PER_FINDING
    ? { ...f, paths: f.paths.slice(0, UI_PATHS_PER_FINDING), paths_total: f.paths.length }
    : f;
}

/** Longest prefix of findings that keeps { ...base, findings } within the budget (at least one). */
function fitFindings(base, findings, budget = UI_RESULT_BUDGET) {
  let lo = 0;
  let hi = findings.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (jsonSize({ ...base, findings: findings.slice(0, mid) }) <= budget) lo = mid;
    else hi = mid - 1;
  }
  return findings.slice(0, Math.max(lo, Math.min(1, findings.length)));
}

function storePage(findings) {
  const token = `p${(pageSeq += 1)}`;
  pages.set(token, findings);
  if (pages.size > PAGE_STORE_MAX) pages.delete(pages.keys().next().value);
  return token;
}

/**
 * Fit a tool result into UI_RESULT_BUDGET: the first findings that fit (paths capped), full
 * counts in `page`, and a token for paging through the same tool. Results already within budget pass unchanged.
 */
export function compactForUi(payload, toolName) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.findings)) return payload;
  if (jsonSize(payload) <= UI_RESULT_BUDGET) return payload;
  const recurring = new Set(Array.isArray(payload.recurring) ? payload.recurring : []);
  const all = payload.findings.map((f) => (recurring.has(f.id) ? { ...f, recurring: true } : f));
  const base = { ...payload };
  if (typeof base.output === 'string' && base.output.length > 1500) {
    base.output = `…${base.output.slice(-1500)}`;
    base.output_truncated = true;
  }
  if (Array.isArray(base.recurring)) base.recurring = base.recurring.length;
  if (Array.isArray(base.reports)) base.reports = base.reports.slice(0, 5);
  if (Array.isArray(base.suppressed)) base.suppressed = base.suppressed.map(({ id, check }) => ({ id, check }));
  const page = {
    tool: toolName,
    token: storePage(all),
    offset: 0,
    count: all.length,
    total: all.length,
    by_severity: tally(all, (f) => f.severity),
    by_source: tally(all, (f) => f.source ?? 'computational'),
    hint: `Only the first findings are inline. Call ${toolName} with page_token = token and offset = count for the rest.`,
  };
  const findings = fitFindings({ ...base, page }, all.map(trimPaths));
  return { ...base, findings, page: { ...page, count: findings.length } };
}

export function findingsPage(token, offset = 0) {
  const all = pages.get(token);
  if (!all) return { error: `unknown or expired page token "${token}"; call the original tool again` };
  const start = Math.max(0, Math.floor(Number(offset) || 0));
  const base = { token, offset: start, total: all.length, next: all.length };
  const findings = fitFindings(base, all.slice(start));
  const next = start + findings.length;
  return { ...base, findings, next: next < all.length ? next : null };
}

/** Architecture sources for the view: list without id; one source's text, or the Semgrep rules (id "semgrep"). */
export function architectureSources(id) {
  const sources = loadArchitectureSources(ROOT, { includeText: true });
  if (!id) return { sources: sources.map(({ text, ...s }) => ({ ...s, bytes: text?.length ?? 0 })) };
  if (id === 'semgrep') {
    const config = resolveSemgrepConfig(ROOT, sources);
    const text = config.yaml ?? (config.path ? readText(config.path) : null);
    return { id, source: config.source, ...(config.path ? { path: config.path } : {}), message: config.message, text };
  }
  const src = sources.find((s) => s.id === id);
  if (!src) return { error: `unknown source "${id}"`, available: ['semgrep', ...sources.map((s) => s.id)] };
  return { id, path: src.path, filled: src.filled, text: src.text ?? null };
}

// ---------------------------------------------------------------- resources

function architectureRules() {
  const parts = loadArchitectureSources(ROOT).map((src) =>
    src.filled
      ? `<!-- ${src.path} -->\n${src.text}`
      : `<!-- ${src.path} (unfilled; not product truth) -->`);
  const gates = (readText('.harness/steering/quality-gates.md') ?? '')
    .split('\n')
    .filter((l) => /^- \*\*QG-(DOM|DRIFT)-/.test(l));
  if (gates.length) parts.push(`<!-- .harness/steering/quality-gates.md (QG-DOM, QG-DRIFT) -->\n${gates.join('\n')}`);
  return parts.join('\n\n');
}

function manifestView() {
  const registry = readJson('.harness/state/registry.json');
  const active = (readJson('.harness/state/manifest.json')?.active_slices ?? []).map((s) => (typeof s === 'string' ? s : s.slice_id));
  const slices = Object.fromEntries(active.map((id) => [id, readJson(`.harness/state/slices/${id}/manifest.json`)]));
  return { registry, slices };
}

function latestDriftReport() {
  if (lastDiffReport) return { source: 'audit_diff (this session)', report: lastDiffReport };
  const latest = latestReport(ROOT);
  if (latest) return { source: latest.path, report: latest.report };
  return { source: 'fresh check-spec-drift', report: runDrift({ root: ROOT }) };
}

const RESOURCES = [
  { uri: 'spec://manifest', name: 'Harness manifest', mimeType: 'application/json', description: 'Generated registry and per-slice manifests of active slices', read: () => JSON.stringify(manifestView(), null, 2) },
  { uri: 'spec://rules/architecture', name: 'Architecture rules', mimeType: 'text/markdown', description: 'domain-layer contract and project binding, plus product, structure, and tech bindings (paths from project.json) and QG-DOM / QG-DRIFT gates. Unfilled stubs are marked, not quoted.', read: architectureRules },
  { uri: 'spec://drift/latest-report', name: 'Latest drift report', mimeType: 'application/json', description: 'Latest audit_diff result in this session, else the latest .harness/audits report, else a fresh drift check', read: () => JSON.stringify(latestDriftReport(), null, 2) },
];

const UI_RESOURCE = {
  uri: UI_URI,
  name: 'Spec drift dashboard',
  mimeType: UI_MIME,
  description: 'MCP App view for audit_diff, verify_architecture_rules, verify_spec_compliance, audit_report, audit_finding, and generate_ci_gate (author and review actions)',
  read: () => readFileSync(UI_FILE, 'utf8'),
  meta: { ui: { prefersBorder: true } },
};

function hostSupportsUi(capabilities) {
  const mimeTypes = capabilities?.extensions?.[UI_EXTENSION]?.mimeTypes;
  return Array.isArray(mimeTypes) && mimeTypes.includes(UI_MIME) && existsSync(UI_FILE);
}

// ------------------------------------------------------------------ prompts

const PROMPTS = [
  {
    name: 'architecture-review',
    description: 'Review files against the bound architecture rules (inferential pass of the codebase-audit skill).',
    arguments: [{ name: 'paths', description: 'Space-separated repo paths (default: changed files)', required: false }],
    text: (a) => `Run an architecture review${a.paths ? ` of: ${a.paths}` : ' of the changed files'}.
1. Call the spec-drift-auditor tool verify_architecture_rules${a.paths ? ` with paths [${a.paths.split(/\s+/).map((p) => JSON.stringify(p)).join(', ')}]` : ''}. It reads domain-layer.md, domain-layer.project.md, product.md, structure.md, and tech.md (paths follow project.json bindings; filled: false is a kit stub and is not product truth). It selects .semgrep.yml or the Semgrep rules binding, or generates a temporary config from a "Paths | Must not import" table plus the Language row in tech.md, then runs semgrep scan --json. Report each SEMGREP finding with file, line, rule, and fix or remediation. If status is "unconfigured" or semgrep is "unavailable", say so; do not treat it as a pass.
2. Read the resource spec://rules/architecture.
3. Read .agents/skills/codebase-audit/SKILL.md and follow its inferential pass for these files.
4. Report findings with file, line, and the rule cited. Inferential findings are advisory (QG-DRIFT-05). Do not edit code.
5. Call audit_report so the Tech Lead sees the computational and inferential findings together (hosts with MCP Apps open the dashboard).`,
  },
  {
    name: 'spec-alignment',
    description: 'Check one slice against its spec: drift, requirement coverage, and per-REQ verdicts.',
    arguments: [{ name: 'slice_id', description: 'Slice to check', required: true }],
    text: (a) => `Check spec alignment for slice ${a.slice_id}.
1. Call audit_diff (mode "author") and verify_spec_compliance with slice_id "${a.slice_id}".
2. Read .harness/specs/${a.slice_id}/intent.md and requirements.md (or spec.md for lite slices).
3. For each requirement, report satisfied / violated / unclear with file and line evidence. Never report unclear as satisfied.
4. Apply QG-DRIFT-01..03 from .harness/steering/quality-gates.md. Do not edit code.`,
  },
  {
    name: 'pr-review',
    description: 'Tech Lead pull request review: drift, compliance, architecture; draft comments only.',
    arguments: [
      { name: 'base_branch', description: 'PR base branch', required: true },
      { name: 'target_branch', description: 'PR head branch', required: true },
      { name: 'pr_body', description: 'PR description (for the Slice: line)', required: false },
    ],
    text: (a) => `Review the pull request ${a.base_branch}...${a.target_branch} as the Tech Lead.
1. Call audit_diff with base_branch "${a.base_branch}", target_branch "${a.target_branch}", mode "review"${a.pr_body ? ', and the pr_body below' : ''}. If DRIFT-07 fires, stop: the PR must name a slice.
2. For each linked slice in summary.linked_slices, run the spec-alignment prompt steps.
3. Run the architecture-review prompt steps on the changed files.
4. Findings already dismissed in .harness/audits/triage.json are suppressed; do not raise them again.
5. Output draft review comments ordered by severity (fail, warn, advisory), each with file, line, and the REQ or rule it cites. Do not post them and do not edit code. To record a dismissal, use: node .harness/scripts/audit-triage.mjs <finding-id> --dismiss --reason "<why>".${a.pr_body ? `\n\nPR body:\n${a.pr_body}` : ''}`,
  },
];

// -------------------------------------------------------------------- tools

// The dashboard pages through the tool that produced the result: hosts such as Cursor only let
// an MCP App call tools from their cached tool list, which can predate newly added tools.
const PAGE_ARGS = {
  page_token: { type: 'string', description: 'page.token from a result cut to fit the MCP App size budget; returns the next findings instead of running the check' },
  offset: { type: 'integer', minimum: 0, description: 'With page_token: index of the first finding to return (page.count of the previous page)' },
};

const TOOLS = [
  {
    name: 'audit_diff',
    description: 'Spec drift (DRIFT-01..07) and architecture rules for a diff, with a summary (files_analyzed, spec_compliance, drift_level). mode "review" adds DRIFT-07 and applies TL triage.',
    inputSchema: {
      type: 'object',
      properties: {
        base_branch: { type: 'string', description: 'Base ref (default: Drift base branch binding, origin/HEAD, main)' },
        target_branch: { type: 'string', description: 'Target ref (default: HEAD plus working tree)' },
        mode: { type: 'string', enum: ['author', 'review'], default: 'author' },
        pr_body: { type: 'string', description: 'PR description, for the "Slice: <id>" link (review mode)' },
        ...PAGE_ARGS,
      },
    },
    run: (a) => auditDiff(a),
  },
  {
    name: 'verify_architecture_rules',
    description: 'Read domain-layer.md, domain-layer.project.md, product.md, structure.md, and tech.md. Select .semgrep.yml (or the Semgrep rules binding) or generate a temporary config from the boundary table, run semgrep scan --json, and return violations with fixes. Also runs the Gate command when it is bound. Unconfigured and a missing semgrep binary are not a pass. Does not write .semgrep.yml.',
    inputSchema: {
      type: 'object',
      properties: {
        paths: { type: 'array', items: { type: 'string' }, description: 'Restrict findings to these paths' },
        include_text: { type: 'boolean', description: 'Include source texts and generated Semgrep YAML (default: true without MCP Apps, false with them)' },
        source: { type: 'string', description: 'Skip the checks and return one source text by id (for example domain-layer, tech), "semgrep" for the selected or generated rules, or "list"' },
        ...PAGE_ARGS,
      },
    },
    run: (a) => {
      const source = str(a.source);
      if (source) return architectureSources(source === 'list' ? undefined : source);
      return verifyArchitectureRules(Array.isArray(a.paths) ? a.paths : [], { includeText: typeof a.include_text === 'boolean' ? a.include_text : !uiEnabled });
    },
  },
  {
    name: 'verify_spec_compliance',
    description: 'Compare a slice spec with the code: the "ears" adapter (requirement coverage and test mentions) plus enabled module adapters (for example "openapi").',
    inputSchema: {
      type: 'object',
      properties: {
        slice_id: { type: 'string' },
        adapter: { type: 'string', description: 'Run only this adapter (default: all)' },
      },
      required: ['slice_id'],
    },
    run: (a) => (str(a.slice_id) ? verifySpecCompliance(a.slice_id.trim(), str(a.adapter)) : { error: 'arguments.slice_id must be a non-empty string' }),
  },
  {
    name: 'generate_ci_gate',
    description: 'Return CI configuration text (GitHub or GitLab) that runs check-invariants (including spec drift). Carries no threshold; does not write files.',
    inputSchema: { type: 'object', properties: { provider: { type: 'string', enum: ['github', 'gitlab'] } }, required: ['provider'] },
    run: (a) => generateCiGate(a.provider),
  },
  {
    name: 'audit_report',
    description: 'Latest codebase audit report from .harness/audits/, including Semgrep problems and fixes, filtered by severity or by findings seen since a date.',
    inputSchema: {
      type: 'object',
      properties: {
        since: { type: 'string', description: 'ISO date; keep findings seen since then' },
        severity: { type: 'string', enum: ['fail', 'warn', 'advisory'] },
        ...PAGE_ARGS,
      },
    },
    run: (a) => auditReport(a),
  },
  {
    name: 'audit_finding',
    description: 'One finding (from the latest audit_diff or audit report) with its knowledge-graph trace (REQ, feature, file).',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    run: (a) => (str(a.id) ? auditFinding(a.id.trim()) : { error: 'arguments.id must be a non-empty string' }),
  },
];

// ------------------------------------------------------------ JSON-RPC plumbing

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function reply(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function replyError(id, code, message) {
  send({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
}

/** The JSON text and structuredContent carry the same payload (compacted for MCP App hosts). */
function toolResult(payload, withUi = false) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    ...(withUi && payload && typeof payload === 'object'
      ? { structuredContent: payload, _meta: { ui: { resourceUri: UI_URI }, [UI_EXTENSION]: { resourceUri: UI_URI } } }
      : {}),
    isError: Boolean(payload?.error),
  };
}

function listTools() {
  return TOOLS.map(({ run, ...t }) => (uiEnabled && UI_TOOLS.has(t.name) ? { ...t, _meta: { ui: { resourceUri: UI_URI } } } : t));
}

async function handleMessage(message) {
  if (!message || typeof message !== 'object') return;
  const { id, method, params } = message;
  const isNotification = id === undefined || id === null;

  switch (method) {
    case 'initialize':
      uiEnabled = hostSupportsUi(params?.capabilities);
      reply(id, {
        protocolVersion: params?.protocolVersion || PROTOCOL_VERSION,
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
          ...(uiEnabled ? { extensions: { [UI_EXTENSION]: { mimeTypes: [UI_MIME] } } } : {}),
        },
        serverInfo: SERVER_INFO,
      });
      return;
    case 'ping':
      if (!isNotification) reply(id, {});
      return;
    case 'tools/list':
      reply(id, { tools: listTools() });
      return;
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === params?.name);
      if (!tool) {
        reply(id, toolResult({ error: `Unknown tool: ${params?.name}` }));
        return;
      }
      const withUi = uiEnabled && UI_TOOLS.has(tool.name);
      const args = params?.arguments ?? {};
      const pageToken = 'page_token' in (tool.inputSchema.properties ?? {}) ? str(args.page_token) : undefined;
      const payload = pageToken ? findingsPage(pageToken, args.offset) : await tool.run(args);
      reply(id, toolResult(withUi ? compactForUi(payload, tool.name) : payload, withUi));
      return;
    }
    case 'resources/list': {
      const list = uiEnabled ? [...RESOURCES, UI_RESOURCE] : RESOURCES;
      reply(id, { resources: list.map(({ read, meta, ...r }) => r) });
      return;
    }
    case 'resources/read': {
      const r = [...RESOURCES, UI_RESOURCE].find((x) => x.uri === params?.uri);
      if (!r || (r === UI_RESOURCE && !existsSync(UI_FILE))) {
        replyError(id, -32002, `Resource not found: ${params?.uri}`);
        return;
      }
      reply(id, { contents: [{ uri: r.uri, mimeType: r.mimeType, text: r.read(), ...(r.meta ? { _meta: r.meta } : {}) }] });
      return;
    }
    case 'prompts/list':
      reply(id, { prompts: PROMPTS.map(({ text, ...p }) => p) });
      return;
    case 'prompts/get': {
      const p = PROMPTS.find((x) => x.name === params?.name);
      if (!p) {
        replyError(id, -32602, `Unknown prompt: ${params?.name}`);
        return;
      }
      const args = params?.arguments ?? {};
      const missing = p.arguments.filter((a) => a.required && !str(args[a.name])).map((a) => a.name);
      if (missing.length) {
        replyError(id, -32602, `Missing required arguments: ${missing.join(', ')}`);
        return;
      }
      reply(id, {
        description: p.description,
        messages: [{ role: 'user', content: { type: 'text', text: p.text(args) } }],
      });
      return;
    }
    default:
      if (isNotification) return;
      replyError(id, -32601, `Method not found: ${method}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let message;
    try {
      message = JSON.parse(trimmed);
    } catch (error) {
      replyError(null, -32700, `Parse error: ${error.message}`);
      return;
    }
    try {
      await handleMessage(message);
    } catch (error) {
      replyError(message?.id ?? null, -32603, error?.message || 'internal error');
    }
  });
  process.stderr.write('spec-drift-auditor MCP server started (stdio)\n');
}
