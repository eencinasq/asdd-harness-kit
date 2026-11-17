/** asdd ui shell — aggregate read views (REQ-002); SSE wired in TASK-003. */

const app = document.getElementById('app');
const VIEWS = ['slices', 'pipeline', 'drift', 'learning', 'knowledge'];

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
  const m = data.metrics?.slices || {};
  panel.innerHTML = `
    <p class="meta">Registry ${escapeHtml(data.generated_at || '')} · total ${m.total ?? slices.length}</p>
    <table>
      <thead><tr><th>Slice</th><th>Mode</th><th>Phase</th><th>Status</th><th>Features</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5">(none)</td></tr>'}</tbody>
    </table>
    ${data.progress ? `<h2>PROGRESS</h2><pre>${escapeHtml(data.progress)}</pre>` : ''}
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
    <p class="meta"><a href="/vendor/spec-drift/audit-dashboard.html">Open spec-drift audit dashboard (static)</a></p>
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