/**
 * Self-contained HTML dashboard for `asdd status --html` (P1.2).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computePipelineMetrics } from './pipeline-metrics.mjs';

function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * @param {object} opts
 * @param {string} [opts.root]
 * @param {object} [opts.metrics]
 * @param {object[]} [opts.slices] registry slices
 */
export function renderPipelineHtml(opts = {}) {
  const root = opts.root ?? process.cwd();
  const metrics = opts.metrics ?? computePipelineMetrics({ root });

  let sliceRows = opts.slices;
  if (!sliceRows) {
    const p = join(root, '.harness/state/registry.json');
    try {
      sliceRows = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')).slices ?? [] : [];
    } catch {
      sliceRows = [];
    }
  }

  const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
  const codes = Object.entries(metrics.stop_fail?.by_code ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => `${esc(c)}×${n}`)
    .join(', ') || '—';

  const body = sliceRows
    .map(
      (s) => `<tr>
  <td>${esc(s.slice_id)}</td>
  <td>${esc(s.mode)}</td>
  <td>${esc(s.phase)}</td>
  <td>${esc(s.status)}</td>
  <td>${esc(s.active_features ?? 0)}</td>
  <td>${s.escalation_required ? esc(`${s.escalation_signals} signal(s)`) : '—'}</td>
</tr>`,
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>ASDD pipeline</title>
<style>
  :root { color-scheme: light dark; --fg: #1a1a1a; --muted: #666; --line: #ddd; --bg: #fafafa; }
  @media (prefers-color-scheme: dark) {
    :root { --fg: #eee; --muted: #aaa; --line: #333; --bg: #111; }
  }
  body { font: 14px/1.45 system-ui, sans-serif; margin: 2rem; color: var(--fg); background: var(--bg); }
  h1 { font-size: 1.4rem; margin: 0 0 0.25rem; }
  .meta { color: var(--muted); margin-bottom: 1.5rem; }
  .cards { display: flex; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem; }
  .card { border: 1px solid var(--line); border-radius: 8px; padding: 0.75rem 1rem; min-width: 8rem; }
  .card strong { display: block; font-size: 1.2rem; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border-bottom: 1px solid var(--line); text-align: left; padding: 0.4rem 0.5rem; }
  th { color: var(--muted); font-weight: 600; }
</style>
</head>
<body>
  <h1>ASDD pipeline</h1>
  <p class="meta">Generated ${esc(metrics.generated_at)} · read-only</p>
  <div class="cards">
    <div class="card"><span>Slices</span><strong>${metrics.slices.total}</strong></div>
    <div class="card"><span>DONE</span><strong>${metrics.slices.done}</strong></div>
    <div class="card"><span>Lite share</span><strong>${pct(metrics.slices.lite_share)}</strong></div>
    <div class="card"><span>Escalation</span><strong>${pct(metrics.slices.escalation_rate)}</strong></div>
    <div class="card"><span>Stop FAILs</span><strong>${metrics.stop_fail.episodes}</strong></div>
    <div class="card"><span>Open patterns</span><strong>${metrics.open_patterns}</strong></div>
  </div>
  <p class="meta">Stop FAIL codes: ${codes}</p>
  <table>
    <thead><tr><th>Slice</th><th>Mode</th><th>Phase</th><th>Status</th><th>Features</th><th>Escalation</th></tr></thead>
    <tbody>
${body || '<tr><td colspan="6">No slices</td></tr>'}
    </tbody>
  </table>
</body>
</html>
`;
}
