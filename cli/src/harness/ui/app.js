/** asdd ui shell — aggregate read views (REQ-002); SSE wired in TASK-003. */

const app = document.getElementById('app');
const VIEWS = ['slices', 'pipeline', 'drift', 'learning', 'knowledge', 'gates', 'insights'];

app.innerHTML = `
  <nav class="tabs" role="tablist" aria-label="Views"></nav>
  <section id="panel" class="panel" aria-live="polite"></section>
`;

const tabs = app.querySelector('.tabs');
const panel = app.querySelector('#panel');
let active = 'slices';

for (const id of VIEWS) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = id[0].toUpperCase() + id.slice(1);
  btn.dataset.view = id;
  btn.setAttribute('role', 'tab');
  btn.addEventListener('click', () => show(id));
  tabs.appendChild(btn);
}

function setSelected() {
  for (const btn of tabs.querySelectorAll('button')) {
    btn.setAttribute('aria-selected', btn.dataset.view === active ? 'true' : 'false');
  }
}

async function show(id) {
  active = id;
  setSelected();
  panel.innerHTML = '<p class="meta">Loading…</p>';
  try {
    if (id === 'slices') await renderSlices();
    else if (id === 'pipeline') await renderPipeline();
    else if (id === 'drift') await renderDrift();
    else if (id === 'learning') await renderLearn();
    else if (id === 'knowledge') renderKnowledge();
    else if (id === 'gates') await renderGates();
    else if (id === 'insights') await renderInsights();
  } catch (err) {
    panel.innerHTML = `<p class="meta">Error: ${escapeHtml(String(err.message || err))}</p>`;
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function renderSlices() {
  const data = await fetch('/api/status').then((r) => r.json());
  const slices = data.slices || [];
  const rows = slices
    .map(
      (s) => `<tr>
      <td>${escapeHtml(s.slice_id)}</td>
      <td>${escapeHtml(s.mode)}</td>
      <td>${escapeHtml(s.phase)}</td>
      <td>${escapeHtml(s.status)}</td>
      <td>${escapeHtml(s.active_features ?? 0)}</td>
    </tr>`,
    )
    .join('');
  const metrics = data.metrics || {};
  const m = metrics.slices || {};
  panel.innerHTML = `
    <p class="meta">Registry ${escapeHtml(data.generated_at || '')} · total ${escapeHtml(m.total ?? slices.length)}</p>
    ${metricCards(metrics)}
    <table>
      <thead><tr><th>Slice</th><th>Mode</th><th>Phase</th><th>Status</th><th>Features</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5">(none)</td></tr>'}</tbody>
    </table>
    ${data.progress ? `<h2>PROGRESS</h2><pre>${escapeHtml(data.progress)}</pre>` : ''}
  `;
}

const pct = (v) => (typeof v === 'number' && Number.isFinite(v) ? `${Math.round(v * 100)}%` : '—');

/** Slices tab: the pipeline metric cards already in /api/status (lite share, escalation, stop FAILs, medians, patterns). */
function metricCards(metrics) {
  const s = metrics.slices || {};
  const stop = metrics.stop_fail || {};
  const codes = Object.entries(stop.by_code || {})
    .sort((a, b) => b[1] - a[1])
    .map(([code, n]) => `${escapeHtml(code)}×${escapeHtml(n)}`)
    .join(', ');
  const medians = Object.entries(metrics.phase_median_hours || {})
    .map(([phase, h]) => `${escapeHtml(phase)} ${escapeHtml(h)}h`)
    .join(' · ');
  const card = (label, value, detail = '') =>
    `<div class="card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${detail ? `<small>${detail}</small>` : ''}</div>`;
  return `<div class="cards">
    ${card('DONE', `${s.done ?? '—'} / ${s.total ?? '—'}`, `${escapeHtml(s.in_progress ?? 0)} in progress`)}
    ${card('Lite share (lite_share)', pct(s.lite_share), 'of DONE, never escalated')}
    ${card('Escalation rate (escalation_rate)', pct(s.escalation_rate))}
    ${card('Stop FAILs (stop_fail)', stop.episodes ?? 0, codes || 'none')}
    ${card('Open patterns (open_patterns)', metrics.open_patterns ?? 0)}
  </div>
  ${medians ? `<p class="meta">Phase medians (phase_median_hours): ${medians}</p>` : ''}`;
}

/** Absent or failed source: say so and name the command that produces the data (REQ-004). */
function missing(model) {
  const error = model.error ? `<br/>${escapeHtml(model.error)}` : '';
  return `<p class="meta missing">${escapeHtml(model.hint || 'No data.')}${error}</p>`;
}

let activationWindow = '30';

/** Insights tab (ui-insights): guidance activation, skill-eval results, cost and tokens. */
async function renderInsights() {
  panel.innerHTML = `
    <section id="ins-activation"><h2>Guidance activation</h2><p class="meta">Loading…</p></section>
    <section id="ins-eval"><h2>Skill evals</h2><p class="meta">Loading…</p></section>
    <section id="ins-cost"><h2>Cost and tokens</h2><p class="meta">Loading…</p></section>
  `;
  await Promise.all([renderActivation(), renderSkillEval(false), renderCost()]);
}

async function renderActivation() {
  const box = panel.querySelector('#ins-activation');
  if (!box) return;
  const data = await fetch(`/api/insights/activation?window=${encodeURIComponent(activationWindow)}`).then((r) => r.json());
  const runtimes = data.runtimes || [];
  const options = ['7', '30', '90', 'all']
    .map((w) => `<option value="${w}"${w === activationWindow ? ' selected' : ''}>${w === 'all' ? 'all (tail)' : `${w} days`}</option>`)
    .join('');
  const head = runtimes.map((r) => `<th>${escapeHtml(r.runtime)}<br/><small>${escapeHtml(r.measured)}</small></th>`).join('');
  const rows = (data.items || [])
    .map((i) => {
      const cells = runtimes
        .map((r) => {
          if (r.measured !== 'observed') return `<td class="muted">${escapeHtml(r.measured)}</td>`;
          return `<td>${escapeHtml(i.loads?.by_runtime?.[r.runtime] ?? 0)}</td>`;
        })
        .join('');
      const flag = i.never_loaded ? '<span class="flag">never loaded</span>' : escapeHtml(i.loads?.total ?? 0);
      return `<tr class="${i.never_loaded ? 'never' : ''}">
        <td><code>${escapeHtml(i.path)}</code></td>
        <td>${escapeHtml(i.type)}${i.inclusion ? ` · ${escapeHtml(i.inclusion)}` : ''}</td>
        <td>${flag}</td>${cells}</tr>`;
    })
    .join('');
  const extra = (data.extra || []).length
    ? `<p class="meta">Loaded but not installed: ${(data.extra || []).map((e) => `<code>${escapeHtml(e.path)}</code>`).join(', ')}</p>`
    : '';
  box.innerHTML = `
    <h2>Guidance activation</h2>
    <div class="row">
      <label>Window <select id="act-window">${options}</select></label>
      <span class="meta">${escapeHtml(data.records_in_window ?? 0)} loads · ${escapeHtml(data.never_loaded ?? 0)} never_loaded · ${escapeHtml(data.tail?.lines_read ?? 0)} span lines read</span>
    </div>
    ${data.source === 'present' ? '' : missing(data)}
    <table>
      <thead><tr><th>Steering / skill</th><th>Type</th><th>Loads</th>${head}</tr></thead>
      <tbody>${rows || '<tr><td colspan="3">(nothing installed)</td></tr>'}</tbody>
    </table>
    ${extra}
  `;
  box.querySelector('#act-window')?.addEventListener('change', (ev) => {
    activationWindow = ev.target.value;
    renderActivation();
  });
}

async function renderSkillEval(refresh) {
  const box = panel.querySelector('#ins-eval');
  if (!box) return;
  if (refresh) box.innerHTML = '<h2>Skill evals</h2><p class="meta">Running asdd skill-eval…</p>';
  const data = await fetch(`/api/insights/skill-eval${refresh ? '?refresh=1' : ''}`).then((r) => r.json());
  const regressed = new Set(data.regressed || []);
  const rows = (data.skills || [])
    .flatMap((s) =>
      (s.cases || []).map((c) => {
        const isRegressed = regressed.has(`${s.name}/${c.id}`) || c.delta === 'regressed';
        const state = isRegressed ? '<span class="flag">regressed</span>' : c.ok ? 'pass' : '<span class="flag">fail</span>';
        return `<tr class="${isRegressed ? 'never' : ''}">
          <td>${escapeHtml(s.name)}</td><td>${escapeHtml(c.id)}</td><td>${state}</td>
          <td>${escapeHtml(c.delta ?? '—')}</td><td class="muted">${escapeHtml((c.failures || []).join('; '))}</td></tr>`;
      }),
    )
    .join('');
  const summary =
    data.source === 'present'
      ? `<p class="meta">${escapeHtml(data.passed)}/${escapeHtml(data.total)} pass · ${escapeHtml((data.regressed || []).length)} regressed${
          data.baseline ? ` vs ${escapeHtml(data.baseline)}` : ''
        } · run ${escapeHtml(data.generated_at || '')}</p>`
      : missing(data);
  box.innerHTML = `
    <h2>Skill evals</h2>
    <div class="row"><button type="button" class="primary" id="eval-refresh">Run asdd skill-eval</button></div>
    ${summary}
    ${rows ? `<table><thead><tr><th>Skill</th><th>Case</th><th>Result</th><th>Delta</th><th>Failures</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
  `;
  box.querySelector('#eval-refresh')?.addEventListener('click', () => renderSkillEval(true));
}

async function renderCost() {
  const box = panel.querySelector('#ins-cost');
  if (!box) return;
  const data = await fetch('/api/insights/cost').then((r) => r.json());
  if (data.source !== 'present') {
    box.innerHTML = `<h2>Cost and tokens</h2>${missing(data)}`;
    return;
  }
  const t = data.totals || {};
  const num = (v) => (typeof v === 'number' ? v.toLocaleString() : '—');
  const usd = (v) => (typeof v === 'number' ? `$${v.toFixed(2)}` : 'unknown');
  const table = (title, rows, key) =>
    rows.length
      ? `<h3>${escapeHtml(title)}</h3><table><thead><tr><th>${escapeHtml(key)}</th><th>Input</th><th>Output</th><th>Cache read</th><th>Cache write</th><th>USD</th></tr></thead><tbody>${rows
          .map(
            (r) => `<tr><td>${escapeHtml(r[key] ?? '—')}${r.unknown ? ' <span class="flag">unknown</span>' : ''}</td>
            <td>${escapeHtml(num(r.input_tokens))}</td><td>${escapeHtml(num(r.output_tokens))}</td>
            <td>${escapeHtml(num(r.cache_read_tokens))}</td><td>${escapeHtml(num(r.cache_write_tokens))}</td>
            <td>${escapeHtml(usd(r.usd))}</td></tr>`,
          )
          .join('')}</tbody></table>`
      : '';
  box.innerHTML = `
    <h2>Cost and tokens</h2>
    <div class="cards">
      <div class="card"><span>Input tokens</span><strong>${escapeHtml(num(t.input_tokens))}</strong></div>
      <div class="card"><span>Output tokens</span><strong>${escapeHtml(num(t.output_tokens))}</strong></div>
      <div class="card"><span>Cache read / write</span><strong>${escapeHtml(num(t.cache_read_tokens))} / ${escapeHtml(num(t.cache_write_tokens))}</strong></div>
      <div class="card"><span>USD</span><strong>${escapeHtml(usd(t.usd))}</strong></div>
    </div>
    ${(data.unknown_runtimes || []).length ? `<p class="meta">No token data from: ${escapeHtml(data.unknown_runtimes.join(', '))} (shown as unknown, never estimated).</p>` : ''}
    <p class="meta">Sources: ${escapeHtml((data.sources || []).join(', ') || '—')}</p>
    ${table('By slice', data.by_slice || [], 'slice_id')}
    ${table('By phase', data.by_phase || [], 'phase')}
    ${table('By model', data.by_model || [], 'model')}
    ${table('By runtime', data.by_runtime || [], 'runtime')}
  `;
}

async function renderPipeline() {
  panel.innerHTML = `<iframe class="pipeline" title="ASDD pipeline" src="/api/pipeline"></iframe>`;
}

async function renderDrift() {
  const data = await fetch('/api/drift').then((r) => r.json());
  const findings = data.findings || [];
  const list = findings
    .map((f) => `<li><strong>${escapeHtml(f.severity)}</strong> ${escapeHtml(f.check)} — ${escapeHtml(f.message)}</li>`)
    .join('');
  panel.innerHTML = `
    <p class="meta">drift_level=${escapeHtml(data.summary?.drift_level)} · base=${escapeHtml(data.summary?.base)}</p>
    <ul>${list || '<li>(no findings)</li>'}</ul>
    <p class="meta">Same checks as <code>asdd drift</code>. The spec-drift dashboards are MCP Apps: open them from an MCP host (Cursor, Claude) through the <code>spec-drift</code> server.</p>
  `;
}

async function renderLearn() {
  const data = await fetch('/api/learn').then((r) => r.json());
  const open = data.open || (data.patterns || []).filter((p) => p.status === 'open');
  const rows = open
    .map(
      (p) => `<tr>
      <td>${escapeHtml(p.id)}</td>
      <td>${escapeHtml(p.signature)}</td>
      <td>${escapeHtml(p.status)}</td>
      <td>×${escapeHtml(p.occurrences)}</td>
    </tr>`,
    )
    .join('');
  panel.innerHTML = `
    <p class="meta">Open learning patterns</p>
    <table>
      <thead><tr><th>ID</th><th>Signature</th><th>Status</th><th>Count</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4">(none open)</td></tr>'}</tbody>
    </table>
  `;
}

async function renderGates() {
  const data = await fetch('/api/gates').then((r) => r.json());
  const pending = data.pending || [];
  const rows = pending
    .map(
      (g) => `<tr>
      <td>${escapeHtml(g.slice_id)}</td>
      <td>${escapeHtml(g.phase)}</td>
      <td>${escapeHtml(g.status)}</td>
      <td>${escapeHtml((g.concerns || []).join('; ') || '—')}</td>
      <td>${escapeHtml(g.drift?.drift_level ?? g.drift_level ?? '—')}</td>
      <td>
        <button type="button" class="primary decide" data-slice="${escapeHtml(g.slice_id)}" data-phase="${escapeHtml(g.phase)}">Decide</button>
      </td>
    </tr>`,
    )
    .join('');
  panel.innerHTML = `
    <p class="meta">Pending WARN gates (no acknowledged_by) · ${escapeHtml(data.generated_at || '')}</p>
    <table>
      <thead><tr><th>Slice</th><th>Phase</th><th>Status</th><th>Concerns</th><th>Drift</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6">(none pending)</td></tr>'}</tbody>
    </table>
    <div id="decide-box" class="meta"></div>
  `;
  for (const btn of panel.querySelectorAll('button.decide')) {
    btn.addEventListener('click', () => openDecide(btn.dataset.slice, btn.dataset.phase));
  }
}

function openDecide(sliceId, phase) {
  const box = panel.querySelector('#decide-box');
  if (!box) return;
  box.innerHTML = `
    <form id="decide-form" class="row">
      <strong>${escapeHtml(sliceId)} / ${escapeHtml(phase)}</strong>
      <input type="text" name="note" placeholder="Mandatory note…" required style="flex:1 1 12rem" />
      <button class="primary" type="submit">Submit decision</button>
    </form>
    <pre id="decide-out"></pre>
  `;
  const form = box.querySelector('#decide-form');
  const out = box.querySelector('#decide-out');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const note = String(new FormData(form).get('note') || '').trim();
    out.textContent = 'Submitting…';
    const res = await fetch('/api/gates/decide', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slice_id: sliceId, phase, note }),
    });
    const data = await res.json().catch(() => ({}));
    out.textContent = JSON.stringify({ status: res.status, ...data }, null, 2);
    if (data.ok) show('gates');
  });
}

function renderKnowledge() {
  panel.innerHTML = `
    <form id="kform" class="row" role="search">
      <input type="search" name="q" placeholder="Search knowledge…" required />
      <button class="primary" type="submit">Search</button>
    </form>
    <div id="kresults"></div>
  `;
  const form = panel.querySelector('#kform');
  const out = panel.querySelector('#kresults');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const q = new FormData(form).get('q');
    out.innerHTML = '<p class="meta">Searching…</p>';
    const data = await fetch(`/api/knowledge?q=${encodeURIComponent(String(q))}`).then((r) => r.json());
    if (data.error && !(data.results || []).length) {
      out.innerHTML = `<p class="meta">${escapeHtml(data.error)}</p>`;
      return;
    }
    const results = data.results || [];
    out.innerHTML = results.length
      ? `<ul>${results
          .map(
            (r) =>
              `<li><strong>${escapeHtml(r.id || r.node_id || '')}</strong> (${escapeHtml(r.score?.toFixed?.(3) ?? r.score)})<br/><span class="meta">${escapeHtml((r.text || '').slice(0, 240))}</span></li>`,
          )
          .join('')}</ul>`
      : '<p class="meta">(no hits)</p>';
  });
}

show('slices');

/** REQ-003 — live refresh when `.harness/state/` changes. */
try {
  const es = new EventSource('/events');
  es.addEventListener('reload', () => {
    show(active);
  });
} catch {
  /* EventSource unavailable */
}