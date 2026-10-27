/**
 * Shared audit helpers: TL triage (.harness/audits/triage.json), content hashes,
 * and report discovery. Used by audit-codebase.mjs, audit-triage.mjs, and the
 * spec-drift-auditor MCP server (read-only there).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const AUDITS_DIR = '.harness/audits';
export const TRIAGE_FILE = '.harness/audits/triage.json';

function specFilesFor(root, sliceId) {
  return ['requirements.md', 'spec.md']
    .map((n) => `.harness/specs/${sliceId}/${n}`)
    .filter((rel) => existsSync(join(root, rel)));
}

/** Files a finding points to; requirement findings fall back to the slice's requirement file. */
export function findingPaths(root, finding) {
  if (Array.isArray(finding.paths) && finding.paths.length) return finding.paths;
  return finding.slice_id ? specFilesFor(root, finding.slice_id) : [];
}

/** sha256 over the sorted paths and their contents; a missing file hashes as "<missing>". */
export function pathsHash(root, paths) {
  const h = createHash('sha256');
  for (const rel of [...paths].sort()) {
    h.update(rel).update('\0');
    const abs = join(root, rel);
    try {
      if (statSync(abs).isFile()) h.update(readFileSync(abs));
      else h.update('<dir>');
    } catch {
      h.update('<missing>');
    }
    h.update('\0');
  }
  return `sha256:${h.digest('hex')}`;
}

export function loadTriage(root) {
  try {
    const data = JSON.parse(readFileSync(join(root, TRIAGE_FILE), 'utf8'));
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

/**
 * Split findings by TL triage. A dismissal holds only while the finding's files
 * hash the same as when it was dismissed.
 */
export function applyTriage(root, findings, triage = loadTriage(root)) {
  const kept = [];
  const suppressed = [];
  for (const f of findings) {
    const entry = triage[f.id];
    if (entry?.decision === 'dismissed' && entry.paths_hash === pathsHash(root, findingPaths(root, f))) {
      suppressed.push({ ...f, triage: entry });
    } else if (entry?.decision === 'confirmed') {
      kept.push({ ...f, triage: entry });
    } else {
      kept.push(f);
    }
  }
  return { kept, suppressed };
}

/** Audit report files, newest first (timestamped names sort lexically). */
export function listReports(root) {
  const dir = join(root, AUDITS_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith('.json') && n !== 'triage.json')
    .sort()
    .reverse()
    .map((n) => `${AUDITS_DIR}/${n}`);
}

export function latestReport(root) {
  const [rel] = listReports(root);
  if (!rel) return null;
  try {
    return { path: rel, report: JSON.parse(readFileSync(join(root, rel), 'utf8')) };
  } catch {
    return null;
  }
}
