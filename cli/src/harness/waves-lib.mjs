/**
 * Wave / parallelism planner (ASDD-ROADMAP P3.1).
 * Read-only: owners + depends_on + scope_paths → ready set and concurrent groups.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function scopesOverlap(a, b) {
  const norm = (p) => String(p).replace(/^\/+|\/+$/g, '');
  const aa = norm(a);
  const bb = norm(b);
  if (!aa || !bb) return false;
  return aa === bb || aa.startsWith(`${bb}/`) || bb.startsWith(`${aa}/`);
}

function featureScopesOverlap(fa, fb) {
  const sa = Array.isArray(fa.scope_paths) ? fa.scope_paths : [];
  const sb = Array.isArray(fb.scope_paths) ? fb.scope_paths : [];
  for (const x of sa) for (const y of sb) if (scopesOverlap(x, y)) return true;
  return false;
}

export function loadFeaturesDoc(root, sliceId) {
  const p = join(root, '.harness/features', `${sliceId}.features.json`);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * @param {object[]} features
 * @returns {{ ready: object[], blocked: object[], parallel_groups: object[][], serial: object[], waves: object[][] }}
 */
export function planWaves(features) {
  const list = Array.isArray(features) ? features : [];
  const byId = new Map(list.map((f) => [f.id, f]));
  const ready = [];
  const blocked = [];

  for (const f of list) {
    if (f.status === 'passing' || f.status === 'abandoned') continue;
    if (f.status === 'in_progress') {
      ready.push({ ...f, reason: 'already_in_progress' });
      continue;
    }
    if (f.status !== 'not_started' && f.status !== 'pending' && f.status !== 'blocked') continue;
    const deps = Array.isArray(f.depends_on) ? f.depends_on : [];
    const unmet = deps.filter((id) => {
      const d = byId.get(id);
      return !d || d.status !== 'passing';
    });
    if (unmet.length) blocked.push({ ...f, unmet_deps: unmet });
    else ready.push({ ...f, reason: 'deps_satisfied' });
  }

  // Greedy parallel groups among ready (excluding already in_progress for new dispatch hints)
  const candidates = ready.filter((f) => f.status === 'not_started' || f.status === 'pending');
  const used = new Set();
  const parallel_groups = [];
  const serial = [];

  for (const f of candidates) {
    if (used.has(f.id)) continue;
    const group = [f];
    used.add(f.id);
    const owner = typeof f.owner === 'string' && f.owner.trim() ? f.owner.trim() : null;
    const scopes = Array.isArray(f.scope_paths) && f.scope_paths.length > 0;
    if (!owner || !scopes) {
      serial.push(f);
      continue;
    }
    for (const g of candidates) {
      if (used.has(g.id)) continue;
      const gOwner = typeof g.owner === 'string' && g.owner.trim() ? g.owner.trim() : null;
      const gScopes = Array.isArray(g.scope_paths) && g.scope_paths.length > 0;
      if (!gOwner || !gScopes) continue;
      if (gOwner === owner) continue;
      if (group.some((x) => x.owner === gOwner || featureScopesOverlap(x, g))) continue;
      group.push(g);
      used.add(g.id);
    }
    if (group.length > 1) parallel_groups.push(group);
    else serial.push(f);
  }

  // Topological waves among non-passing features
  const open = list.filter((f) => f.status !== 'passing' && f.status !== 'abandoned');
  const waves = [];
  const placed = new Set(list.filter((f) => f.status === 'passing').map((f) => f.id));
  let guard = open.length + 1;
  while (placed.size < list.filter((f) => f.status !== 'abandoned').length && guard-- > 0) {
    const layer = open.filter((f) => {
      if (placed.has(f.id)) return false;
      const deps = Array.isArray(f.depends_on) ? f.depends_on : [];
      return deps.every((id) => placed.has(id) || !byId.has(id));
    });
    if (layer.length === 0) break;
    waves.push(layer.map((f) => f.id));
    for (const f of layer) placed.add(f.id);
  }

  return {
    ready: ready.map((f) => ({ id: f.id, status: f.status, owner: f.owner || null, reason: f.reason })),
    blocked: blocked.map((f) => ({ id: f.id, status: f.status, unmet_deps: f.unmet_deps })),
    parallel_groups: parallel_groups.map((g) => g.map((f) => f.id)),
    serial: serial.map((f) => f.id),
    waves,
  };
}

export function planWavesForSlice(root, sliceId) {
  const doc = loadFeaturesDoc(root, sliceId);
  if (!doc) return { slice_id: sliceId, error: 'features file missing', plan: null };
  return { slice_id: sliceId, plan: planWaves(doc.features || []) };
}

export function planWavesForRoot(root, sliceId) {
  if (sliceId) return [planWavesForSlice(root, sliceId)];
  const dir = join(root, '.harness/features');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith('.features.json'))
    .map((n) => planWavesForSlice(root, n.replace(/\.features\.json$/, '')));
}

export function formatWavesPlan(results) {
  const lines = [];
  for (const r of results) {
    lines.push(`== waves: ${r.slice_id} ==`);
    if (r.error) {
      lines.push(`  ERROR  ${r.error}`);
      continue;
    }
    const p = r.plan;
    lines.push(`  ready    ${p.ready.map((x) => x.id).join(', ') || '(none)'}`);
    lines.push(`  blocked  ${p.blocked.map((x) => `${x.id}[${x.unmet_deps.join('+')}]`).join(', ') || '(none)'}`);
    if (p.parallel_groups.length) {
      for (const g of p.parallel_groups) lines.push(`  parallel ${g.join(' | ')}`);
    } else {
      lines.push('  parallel (none — need distinct owners + disjoint scope_paths)');
    }
    lines.push(`  serial   ${p.serial.join(', ') || '(none)'}`);
    lines.push(`  layers   ${p.waves.map((w) => w.join('+')).join(' → ') || '(none)'}`);
  }
  return `${lines.join('\n')}\n`;
}
