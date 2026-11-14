/**
 * Hill chart sensor (ASDD-ROADMAP P2.3): features may declare hill uphill|downhill.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const HILL_VALUES = new Set(['uphill', 'downhill']);

export function readFeaturesDoc(root, sliceId) {
  const p = join(root, '.harness/features', `${sliceId}.features.json`);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Features that are still climbing (uphill) and not yet passing/abandoned.
 */
export function listUphillFeatures(root, opts = {}) {
  const slicesDir = join(root, '.harness/state/slices');
  const registryPath = join(root, '.harness/state/registry.json');
  let sliceIds = opts.sliceIds;
  if (!sliceIds) {
    if (existsSync(registryPath)) {
      try {
        const reg = JSON.parse(readFileSync(registryPath, 'utf8'));
        sliceIds = (reg.slices || []).map((s) => s.slice_id).filter(Boolean);
      } catch {
        sliceIds = [];
      }
    } else if (existsSync(slicesDir)) {
      sliceIds = readdirSync(slicesDir);
    } else {
      sliceIds = [];
    }
  }

  const out = [];
  for (const sliceId of sliceIds) {
    const doc = readFeaturesDoc(root, sliceId);
    if (!doc || !Array.isArray(doc.features)) continue;
    const manifestPath = join(root, '.harness/state/slices', sliceId, 'manifest.json');
    let phase = null;
    let status = null;
    if (existsSync(manifestPath)) {
      try {
        const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
        phase = m.phase;
        status = m.status;
      } catch {
        /* ignore */
      }
    }
    for (const f of doc.features) {
      if (f?.hill !== 'uphill') continue;
      if (f.status === 'passing' || f.status === 'abandoned') continue;
      out.push({
        slice_id: sliceId,
        feature_id: f.id,
        status: f.status,
        phase,
        slice_status: status,
        title: f.title || f.id,
      });
    }
  }
  return out;
}

/**
 * Late-cycle uphill findings for asdd check (WARN).
 */
export function lateUphillFindings(root) {
  return listUphillFeatures(root).filter((u) => u.phase === 'qa' || u.phase === 'knowledge');
}
