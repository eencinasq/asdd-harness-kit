/**
 * Spec drift sensor (DRIFT-01 … DRIFT-07) — shared by validators/spec-drift.mjs,
 * check-spec-drift.mjs, audit-codebase.mjs, and the spec-drift-auditor MCP server.
 *
 * Pure reads: harness files, git (via spawnSync), test files. Never writes.
 * Design: https://github.com/eencinasq/asdd-harness-kit#spec-drift-and-codebase-audit
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { contractFindings, contractSeverity } from './validators/features.mjs';
import { normalizeScopePath } from './validators/paths.mjs';

export const EXEMPT_PREFIXES = [
  '.harness/state',
  '.harness/features',
  '.harness/specs',
  '.harness/knowledge',
  '.harness/audits',
  '.harness/progress',
  '.harness/PROGRESS.md',
];

const SPEC_DOCS = ['intent.md', 'design.md', 'tasks.md', 'spec.md'];
const EDIT_PHASES = ['implementation', 'qa'];
const REQUIREMENT_PHASES = ['qa', 'knowledge'];
const DEFAULT_TEST_GLOBS = [
  '**/*.test.*',
  '**/*.spec.*',
  '**/test/**',
  '**/tests/**',
  '**/__tests__/**',
  '**/test-*.sh',
];
const SHA_RE = /^[0-9a-f]{7,40}$/i;
const UNFILLED = new Set(['', '…', '...', 'unfilled']);

// ------------------------------------------------------------------ git

function git(root, args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
}

function lines(out) {
  return (out ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
}

export function isGitRepo(root) {
  return git(root, ['rev-parse', '--is-inside-work-tree'])?.trim() === 'true';
}

function hasCommit(root, ref) {
  return git(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]) !== null;
}

export function resolveBase(root, explicit, target = 'HEAD') {
  const candidates = [
    explicit,
    process.env.HARNESS_DRIFT_BASE,
    readBinding(root, '.harness/steering/quality-gates.project.md', 'Drift base branch')[0],
    'origin/HEAD',
    'origin/main',
    'main',
    'origin/master',
    'master',
  ].filter(Boolean);
  if (!hasCommit(root, target)) return null;
  for (const ref of candidates) {
    if (!hasCommit(root, ref)) continue;
    const mergeBase = git(root, ['merge-base', ref, target])?.trim();
    if (mergeBase) return { ref, sha: mergeBase };
  }
  return null;
}

/** Files changed on the branch (base...HEAD) plus staged, unstaged, and untracked changes. */
export function changedFiles(root, base, target = 'HEAD') {
  const out = new Set();
  if (base?.sha) {
    for (const f of lines(git(root, ['diff', '--name-only', '--relative', `${base.sha}...${target}`]))) out.add(f);
  }
  if (target === 'HEAD') {
    if (hasCommit(root, 'HEAD')) {
      for (const f of lines(git(root, ['diff', '--name-only', '--relative', 'HEAD']))) out.add(f);
    }
    for (const f of lines(git(root, ['ls-files', '--others', '--exclude-standard']))) out.add(f);
  }
  return [...out].sort();
}

// ------------------------------------------------------------- bindings

/**
 * Backtick values on the line that starts with `label:` in a binding file.
 * Unfilled slots (`…`, empty, `unfilled`) yield [].
 */
export function readBinding(root, rel, label) {
  const p = join(root, rel);
  if (!existsSync(p)) return [];
  const re = new RegExp(`^\\s*(?:[-*]\\s*)?\\**${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:?\\**\\s*:?(.*)$`, 'im');
  const m = readFileSync(p, 'utf8').match(re);
  if (!m) return [];
  // A parenthetical outside backticks documents defaults/examples, not values.
  let value = '';
  let inTick = false;
  for (const c of m[1]) {
    if (c === '`') inTick = !inTick;
    if (c === '(' && !inTick) break;
    value += c;
  }
  return [...value.matchAll(/`([^`]*)`/g)].map((x) => x[1].trim()).filter((v) => !UNFILLED.has(v));
}

// ---------------------------------------------------------------- globs

export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') {
        re += '(?:.*/)?';
        i += 2;
      } else {
        re += '.*';
        i += 1;
      }
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

export function matchesPath(file, mapped) {
  if (mapped.includes('*') || mapped.includes('?')) return globToRegExp(mapped).test(file);
  return file === mapped || file.startsWith(`${mapped}/`);
}

/** True when a literal scope path exists, or when a glob matches at least one project file. */
export function scopeExists(root, scope, listFiles) {
  if (!scope.includes('*') && !scope.includes('?')) return existsSync(join(root, scope));
  const segments = scope.split('/');
  const prefix = segments.slice(0, segments.findIndex((s) => s.includes('*') || s.includes('?'))).join('/');
  if (prefix && !existsSync(join(root, prefix))) return false;
  const re = globToRegExp(scope);
  return listFiles(prefix).some((f) => re.test(f));
}

function fileLister(root, gitAvailable) {
  let tracked = null;
  return (prefix) => {
    if (!gitAvailable) return walk(root, join(root, prefix));
    tracked ??= lines(git(root, ['ls-files', '--cached', '--others', '--exclude-standard']));
    return prefix ? tracked.filter((f) => f.startsWith(`${prefix}/`)) : tracked;
  };
}

export const INSTALLED_VERSIONS = '.harness/config/installed-versions.json';

/** Files the kit installer owns and refreshes on upgrade; empty in the kit repo itself. */
export function harnessManaged(root) {
  const v = readJsonSafe(join(root, INSTALLED_VERSIONS));
  if (!v) return new Set();
  const managed = new Set([INSTALLED_VERSIONS, ...(Array.isArray(v.managed_files) ? v.managed_files : [])]);
  for (const [file, sha] of Object.entries(v.seeded_files ?? {})) {
    try {
      if (createHash('sha256').update(readFileSync(join(root, file))).digest('hex') === sha) managed.add(file);
    } catch {
      // seed deleted or unreadable: no exemption
    }
  }
  return managed;
}

export function isExempt(file, managed) {
  return EXEMPT_PREFIXES.some((p) => file === p || file.startsWith(`${p}/`)) || Boolean(managed?.has(file));
}

// --------------------------------------------------------------- slices

function readJsonSafe(p) {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

export function listSlices(root) {
  const manifest = readJsonSafe(join(root, '.harness/state/manifest.json'));
  const entries = Array.isArray(manifest?.active_slices) ? manifest.active_slices : [];
  return entries
    .map((s) => (typeof s === 'string' ? { slice_id: s } : s))
    .filter((s) => s?.slice_id)
    .map((s) => {
      const perSlice = readJsonSafe(join(root, '.harness/state/slices', s.slice_id, 'manifest.json'));
      const featuresRel = s.features || `.harness/features/${s.slice_id}.features.json`;
      const features = readJsonSafe(join(root, featuresRel));
      return {
        slice_id: s.slice_id,
        phase: perSlice?.phase ?? s.phase ?? 'discovery',
        status: perSlice?.status ?? s.status ?? 'in_progress',
        features: Array.isArray(features?.features) ? features.features : [],
      };
    });
}

function addPathCandidate(out, root, token, baseDir) {
  let t = token.split('#')[0].trim();
  if (!t || /^[a-z]+:/i.test(t) || /[<>\s]/.test(t)) return;
  if (!(t.includes('/') || /\.[A-Za-z0-9]+$/.test(t))) return;
  if (!/^[\w.@\-/*?]+$/.test(t)) return;
  if (baseDir && !t.startsWith('/')) t = relative(root, resolve(baseDir, t)).replaceAll('\\', '/');
  const normalized = normalizeScopePath(t);
  if (normalized) out.add(normalized);
}

/** Paths named by a slice's spec docs (backtick tokens and markdown link targets). */
export function specPaths(root, sliceId) {
  const dir = join(root, '.harness/specs', sliceId);
  const out = new Set();
  for (const name of SPEC_DOCS) {
    const p = join(dir, name);
    if (!existsSync(p)) continue;
    const text = readFileSync(p, 'utf8');
    for (const m of text.matchAll(/`([^`\n]+)`/g)) addPathCandidate(out, root, m[1], null);
    for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) addPathCandidate(out, root, m[1], dir);
  }
  return out;
}

export function mappedPaths(root, slice) {
  const out = specPaths(root, slice.slice_id);
  for (const f of slice.features) {
    for (const p of Array.isArray(f.scope_paths) ? f.scope_paths : []) {
      const n = normalizeScopePath(p);
      if (n) out.add(n);
    }
  }
  return [...out];
}

// --------------------------------------------------------- requirements

export function parseRequirements(root, sliceId) {
  const dir = join(root, '.harness/specs', sliceId);
  const file = ['requirements.md', 'spec.md'].map((n) => join(dir, n)).find((p) => existsSync(p));
  if (!file) return [];
  const seen = new Map();
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*(?:[-*]|#{1,6}|\|)?\s*\**\s*(REQ-[A-Za-z0-9-]*\d)\b/);
    if (!m || seen.has(m[1])) continue;
    seen.set(m[1], { id: m[1], must: !/\((SHOULD|COULD|MAY)\)/i.test(line) });
  }
  return [...seen.values()];
}

function walk(root, dir = root, out = [], limit = 20000) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (out.length >= limit) break;
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) walk(root, abs, out, limit);
    else out.push(relative(root, abs).replaceAll('\\', '/'));
  }
  return out;
}

export function trackedFiles(root, gitAvailable = isGitRepo(root)) {
  if (gitAvailable) return lines(git(root, ['ls-files']));
  return walk(root);
}

/** Predicate for test files: the Test file globs binding, else DEFAULT_TEST_GLOBS. */
export function testFileMatcher(root) {
  const bound = readBinding(root, '.harness/steering/quality-gates.project.md', 'Test file globs');
  const globs = (bound.length ? bound : DEFAULT_TEST_GLOBS).map(globToRegExp);
  return (f) => globs.some((re) => re.test(f));
}

export function testFiles(root, gitAvailable) {
  const isTest = testFileMatcher(root);
  const managed = harnessManaged(root);
  return trackedFiles(root, gitAvailable).filter((f) => !isExempt(f, managed) && isTest(f));
}

function mentionedRequirementIds(root, files, ids) {
  const found = new Set();
  if (ids.length === 0) return found;
  const res = ids.map((id) => [id, new RegExp(`\\b${id}\\b`)]);
  for (const f of files) {
    const p = join(root, f);
    let text;
    try {
      if (statSync(p).size > 1024 * 1024) continue;
      text = readFileSync(p, 'utf8');
    } catch {
      continue;
    }
    for (const [id, re] of res) if (!found.has(id) && re.test(text)) found.add(id);
    if (found.size === ids.length) break;
  }
  return found;
}

// ------------------------------------------------------------- findings

export function findingId(f) {
  const key = [f.check, f.slice_id ?? '', f.node ?? '', ...(f.paths ?? [])].join('|');
  return `AUD-${createHash('sha256').update(key).digest('hex').slice(0, 8)}`;
}

function finding(check, severity, fields) {
  const f = { check, severity, slice_id: null, node: null, paths: [], ...fields };
  return { id: findingId(f), ...f };
}

export function linkedSlices(prBranch, prBody, known) {
  const ids = new Set();
  const b = String(prBranch ?? '').match(/^(?:refs\/heads\/)?slice\/([a-z0-9_-]+)(?:\/|$)/);
  if (b) ids.add(b[1]);
  for (const m of String(prBody ?? '').matchAll(/^\s*Slice:\s*([a-z0-9_-]+)\s*$/gim)) ids.add(m[1]);
  return [...ids].filter((id) => known.has(id));
}

/**
 * Run the drift checks.
 *
 * @param {object} opts
 * @param {string} opts.root
 * @param {string} [opts.base]          base ref (default: binding → origin/HEAD → main …)
 * @param {string} [opts.target]        target ref (default HEAD + working tree)
 * @param {string[]} [opts.sliceIds]    restrict DRIFT-01/03/04 to these slices (any phase)
 * @param {string} [opts.prBranch]      enables DRIFT-07
 * @param {string} [opts.prBody]        enables DRIFT-07
 * @param {boolean} [opts.includeContract=true]  report DRIFT-06 (check-invariants reports it itself)
 * @param {boolean} [opts.requirementChecks]     force DRIFT-03/04 regardless of phase
 */
export function runDrift(opts) {
  const { root, includeContract = true } = opts;
  const findings = [];
  const notes = [];
  const slices = listSlices(root);
  const known = new Set(slices.map((s) => s.slice_id));
  const gitAvailable = isGitRepo(root);
  const prContext = Boolean(opts.prBranch || opts.prBody);
  const linked = prContext ? linkedSlices(opts.prBranch, opts.prBody, known) : [];

  const requested = opts.sliceIds?.length
    ? slices.filter((s) => opts.sliceIds.includes(s.slice_id))
    : null;
  const editSlices = requested ?? slices.filter((s) =>
    s.status === 'in_progress' &&
    (EDIT_PHASES.includes(s.phase) || s.features.some((f) => f.status === 'in_progress')));
  const passing = slices.flatMap((s) => s.features.filter((f) => f.status === 'passing').map((f) => ({ s, f })));

  const target = opts.target || 'HEAD';
  const base = gitAvailable ? resolveBase(root, opts.base, target) : null;
  const changed = gitAvailable ? changedFiles(root, base, target) : [];
  const managed = harnessManaged(root);
  const changedProduct = changed.filter((f) => !isExempt(f, managed));

  const needsGit = editSlices.length > 0 || prContext || passing.some(({ f }) => SHA_RE.test(String(f.evidence_commit ?? '')));
  if (!gitAvailable && needsGit) {
    findings.push(finding('DRIFT-00', 'warn', { message: 'not a git work tree; DRIFT-01, DRIFT-02, and DRIFT-07 skipped' }));
  }

  // DRIFT-01 — changed product files must be mapped by an editing slice.
  // A test file that names a REQ of an editing slice is mapped by that REQ.
  if (gitAvailable && editSlices.length) {
    const mapped = editSlices.flatMap((s) => mappedPaths(root, s));
    const isTest = testFileMatcher(root);
    const reqIds = [...new Set(editSlices.flatMap((s) => parseRequirements(root, s.slice_id).map((r) => r.id)))];
    const unmapped = changedProduct.filter((f) =>
      !mapped.some((m) => matchesPath(f, m)) &&
      !(isTest(f) && mentionedRequirementIds(root, [f], reqIds).size > 0));
    for (const f of unmapped) {
      findings.push(finding('DRIFT-01', 'fail', {
        paths: [f],
        node: `file:${f}`,
        message: `${f} changed but is not mapped by ${editSlices.map((s) => s.slice_id).join(', ')} (intent/design/tasks/spec or scope_paths)`,
      }));
    }
  }

  // DRIFT-02 — passing features whose owned files changed after evidence_commit
  // DRIFT-05 — passing features whose scope paths do not exist
  const listFiles = fileLister(root, gitAvailable);
  for (const { s, f } of passing) {
    const scopes = (Array.isArray(f.scope_paths) ? f.scope_paths : []).map(normalizeScopePath).filter(Boolean);
    const node = `feature:${s.slice_id}:${f.id}`;
    for (const p of scopes) {
      if (!scopeExists(root, p, listFiles)) {
        findings.push(finding('DRIFT-05', 'fail', {
          slice_id: s.slice_id, node, paths: [p],
          message: `passing feature ${f.id} owns ${p}, which does not exist`,
        }));
      }
    }
    const sha = String(f.evidence_commit ?? '');
    if (!gitAvailable || !SHA_RE.test(sha) || scopes.length === 0) continue;
    if (!hasCommit(root, sha)) {
      findings.push(finding('DRIFT-02', 'fail', {
        slice_id: s.slice_id, node,
        message: `passing feature ${f.id} has evidence_commit ${sha}, which is not in this repository`,
      }));
      continue;
    }
    const drifted = new Set([
      ...lines(git(root, ['diff', '--name-only', '--relative', sha, '--', ...scopes])),
      ...lines(git(root, ['ls-files', '--others', '--exclude-standard', '--', ...scopes])),
    ]);
    if (drifted.size) {
      findings.push(finding('DRIFT-02', 'fail', {
        slice_id: s.slice_id, node, paths: [...drifted].sort(),
        message: `passing feature ${f.id} changed after evidence_commit ${sha.slice(0, 12)}; set it back to in_progress and rerun verification`,
      }));
    }
  }

  // DRIFT-03 / DRIFT-04 — requirement coverage and test mentions
  const reqSlices = requested ?? slices.filter((s) => s.status === 'in_progress');
  let mustTotal = 0;
  let mustCovered = 0;
  let tests = null;
  for (const s of reqSlices) {
    const reqs = parseRequirements(root, s.slice_id);
    if (reqs.length === 0) continue;
    tests ??= testFiles(root, gitAvailable);
    const implemented = new Set(s.features.flatMap((f) => (Array.isArray(f.req_ids) ? f.req_ids : [])));
    const mentioned = mentionedRequirementIds(root, tests, reqs.map((r) => r.id));
    const emit = opts.requirementChecks || REQUIREMENT_PHASES.includes(s.phase);
    for (const r of reqs) {
      const node = `req:${s.slice_id}:${r.id}`;
      if (r.must) {
        mustTotal += 1;
        if (implemented.has(r.id) && mentioned.has(r.id)) mustCovered += 1;
      }
      if (!emit) continue;
      if (r.must && !implemented.has(r.id)) {
        findings.push(finding('DRIFT-03', 'fail', {
          slice_id: s.slice_id, node,
          message: `MUST requirement ${r.id} has no feature listing it in req_ids`,
        }));
      }
      if (!mentioned.has(r.id)) {
        findings.push(finding('DRIFT-04', 'warn', {
          slice_id: s.slice_id, node,
          message: `no test file mentions ${r.id}`,
        }));
      }
    }
  }

  // DRIFT-06 — feature contract (same rule as validators/features.mjs)
  if (includeContract) {
    const severity = contractSeverity(root);
    for (const s of slices) {
      for (const f of s.features) {
        for (const message of contractFindings(f)) {
          findings.push(finding('DRIFT-06', severity, {
            slice_id: s.slice_id, node: `feature:${s.slice_id}:${f.id}`, message: message.replace(/ \(DRIFT-06\)$/, ''),
          }));
        }
      }
    }
  }

  // DRIFT-07 — a PR that changes product files must name an active slice
  if (prContext && gitAvailable && changedProduct.length && linked.length === 0) {
    findings.push(finding('DRIFT-07', 'fail', {
      paths: changedProduct.slice(0, 20),
      message: 'pull request changes product files but names no active slice (branch slice/<id>/… or "Slice: <id>" in the body)',
    }));
  }

  if (gitAvailable && !base) notes.push('no base branch found; only working-tree changes were analyzed');

  const hasFail = findings.some((f) => f.severity === 'fail');
  const hasWarn = findings.some((f) => f.severity === 'warn');
  return {
    findings,
    summary: {
      files_analyzed: changedProduct.length,
      spec_compliance: mustTotal ? Number((mustCovered / mustTotal).toFixed(4)) : null,
      must_requirements: mustTotal,
      drift_level: hasFail ? 'blocking' : hasWarn ? 'warning' : 'clean',
      base: base?.ref ?? null,
      target,
      git: gitAvailable,
      slices: editSlices.map((s) => s.slice_id),
      linked_slices: linked,
    },
    notes,
  };
}
