/**
 * Read-only multi-repo portfolio view (ASDD-ROADMAP P3.2).
 */
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

export const PORTFOLIO_REL = '.harness/config/portfolio.json';

export function readPortfolioConfig(root, opts = {}) {
  const rel = opts.configPath || PORTFOLIO_REL;
  const p = join(root, rel);
  if (!existsSync(p)) return { path: p, repos: [], missing_config: true };
  try {
    const data = JSON.parse(readFileSync(p, 'utf8'));
    const repos = Array.isArray(data.repos) ? data.repos : [];
    return { path: p, repos, missing_config: false };
  } catch (e) {
    return { path: p, repos: [], missing_config: false, error: String(e.message || e) };
  }
}

function summarizeRegistry(repoRoot) {
  const regPath = join(repoRoot, '.harness/state/registry.json');
  if (!existsSync(regPath)) return { ok: false, reason: 'no_registry' };
  try {
    const reg = JSON.parse(readFileSync(regPath, 'utf8'));
    const slices = Array.isArray(reg.slices) ? reg.slices : [];
    const byStatus = {};
    const byMode = {};
    for (const s of slices) {
      byStatus[s.status || 'unknown'] = (byStatus[s.status || 'unknown'] || 0) + 1;
      byMode[s.mode || 'unknown'] = (byMode[s.mode || 'unknown'] || 0) + 1;
    }
    return {
      ok: true,
      slice_count: slices.length,
      by_status: byStatus,
      by_mode: byMode,
      generated_at: reg.generated_at || null,
    };
  } catch (e) {
    return { ok: false, reason: 'invalid_registry', detail: String(e.message || e) };
  }
}

/**
 * @param {string} root
 * @param {{ configPath?: string, repos?: {id?: string, path: string}[] }} [opts]
 */
export function buildPortfolio(root, opts = {}) {
  const cfg = opts.repos
    ? { path: '(injected)', repos: opts.repos, missing_config: false }
    : readPortfolioConfig(root, opts);
  const entries = [];
  const warns = [];

  if (cfg.error) warns.push(`portfolio config unreadable: ${cfg.error}`);
  if (cfg.missing_config) warns.push(`no ${PORTFOLIO_REL} — add { "repos": [{ "id": "…", "path": "…" }] }`);

  for (const repo of cfg.repos) {
    const id = repo.id || repo.path || 'unnamed';
    const rawPath = repo.path;
    if (typeof rawPath !== 'string' || !rawPath.trim()) {
      warns.push(`repo ${id}: missing path`);
      entries.push({ id, path: null, ok: false, reason: 'missing_path' });
      continue;
    }
    const abs = isAbsolute(rawPath) ? rawPath : resolve(root, rawPath);
    if (!existsSync(abs)) {
      warns.push(`repo ${id}: path missing (${abs})`);
      entries.push({ id, path: abs, ok: false, reason: 'path_missing' });
      continue;
    }
    const summary = summarizeRegistry(abs);
    if (!summary.ok) {
      warns.push(`repo ${id}: ${summary.reason}`);
      entries.push({ id, path: abs, ...summary });
      continue;
    }
    entries.push({ id, path: abs, ...summary });
  }

  return {
    generated_at: new Date().toISOString(),
    config: cfg.path,
    repos: entries,
    warns,
  };
}

export function formatPortfolio(report) {
  const lines = ['== Portfolio (read-only) ==', `  config  ${report.config}`];
  if (!report.repos.length) lines.push('  (no repos listed)');
  for (const r of report.repos) {
    if (!r.ok) {
      lines.push(`  [${r.id}] FAIL  ${r.reason}`);
      continue;
    }
    const st = Object.entries(r.by_status || {})
      .map(([k, v]) => `${k}:${v}`)
      .join(' ');
    const md = Object.entries(r.by_mode || {})
      .map(([k, v]) => `${k}:${v}`)
      .join(' ');
    lines.push(`  [${r.id}] slices:${r.slice_count}  ${st}  |  ${md}`);
  }
  for (const w of report.warns || []) lines.push(`  WARN  ${w}`);
  return `${lines.join('\n')}\n`;
}
