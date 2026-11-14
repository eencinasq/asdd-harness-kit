import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PHASES, SLICE_MODES } from '../sync-state.mjs';
import { validateFeatureExecution } from './features.mjs';

const VALID_EVENT_TYPES = [
  'phase_started',
  'phase_completed',
  'phase_blocked',
  'feature_started',
  'feature_completed',
  'feature_blocked',
  'dissent',
  'override',
  'checkpoint',
];

function isIso8601(str) {
  if (typeof str !== 'string') return false;
  const d = new Date(str);
  return !isNaN(d.getTime()) && str.includes('T');
}

function validateSessionFile(data, rel, fail) {
  if (typeof data.timestamp !== 'string' || !isIso8601(data.timestamp)) {
    fail(`${rel}: missing or invalid timestamp (ISO-8601 required)`);
  }
  if (!VALID_EVENT_TYPES.includes(data.event_type)) {
    fail(`${rel}: invalid event_type "${data.event_type}"`);
  }
  if (typeof data.slice_id !== 'string' || !data.slice_id.trim()) {
    fail(`${rel}: missing or empty slice_id`);
  }
  if (data.agent !== undefined && (typeof data.agent !== 'string' || !data.agent.trim())) {
    fail(`${rel}: agent must be a non-empty string`);
  }
  if (data.human !== undefined && (typeof data.human !== 'string' || !data.human.trim())) {
    fail(`${rel}: human must be a non-empty string`);
  }
  if (data.phase !== undefined && !PHASES.includes(data.phase)) {
    fail(`${rel}: invalid phase "${data.phase}"`);
  }
  if (data.feature_id !== undefined && (typeof data.feature_id !== 'string' || !data.feature_id.trim())) {
    fail(`${rel}: feature_id must be a non-empty string`);
  }
  if (data.evidence !== undefined && typeof data.evidence !== 'string') {
    fail(`${rel}: evidence must be a string`);
  }
  if (data.concerns !== undefined && !Array.isArray(data.concerns)) {
    fail(`${rel}: concerns must be an array`);
  }
  if (data.handoff_from !== undefined && (typeof data.handoff_from !== 'string' || !data.handoff_from.trim())) {
    fail(`${rel}: handoff_from must be a non-empty string`);
  }
  if (data.scope_paths !== undefined && !Array.isArray(data.scope_paths)) {
    fail(`${rel}: scope_paths must be an array`);
  } else if (Array.isArray(data.scope_paths)) {
    for (const p of data.scope_paths) {
      if (typeof p !== 'string' || !p.trim()) {
        fail(`${rel}: scope_paths must contain non-empty strings`);
        break;
      }
    }
  }
}

export default function validate(ctx) {
  const { root, fail, warn, readJson, dirExists, registry } = ctx;

  const slicesDir = join(root, '.harness/state/slices');
  const sliceDirNames = existsSync(slicesDir)
    ? readdirSync(slicesDir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
        .map((e) => e.name)
    : [];
  const featuresDir = join(root, '.harness/features');
  const hasState =
    sliceDirNames.length > 0 ||
    (existsSync(featuresDir) && readdirSync(featuresDir).some((n) => n.endsWith('.features.json')));

  // AR-2: a missing generated index fails only when state exists to index; zero-slice absence is legitimate.
  if (!registry) {
    if (hasState) fail('generated state missing: .harness/state/registry.json — run: asdd sync');
    else warn('registry.json not found — legitimate on a zero-slice project (run: asdd sync)');
  }

  // Registry schema (the generated global index; global state/manifest.json retired — RV1-AR-1)
  const slices = [];
  if (registry) {
    if (registry.schema_version !== '3.0') {
      fail(`registry schema_version should be "3.0", got "${registry.schema_version}"`);
    }
    if (!Array.isArray(registry.slices)) {
      fail('registry.json missing slices array');
    } else {
      if (registry.slices.length === 0 && hasState) {
        warn('registry lists no slices but state exists — run: asdd sync');
      }
      for (const s of registry.slices) slices.push(typeof s === 'string' ? { slice_id: s } : s);
    }
  }

  // State on disk that the index does not list: a stale or missing regen (orphan detection below refines it).
  const indexed = new Set(slices.map((s) => s.slice_id).filter(Boolean));

    // Validate each slice — indexed slices first, then dirs the index missed
    const allSlices = [...slices];
    for (const name of sliceDirNames) if (!indexed.has(name)) allSlices.push({ slice_id: name });
    for (const slice of allSlices) {
      if (!slice.slice_id) {
        fail('registry slices entry missing slice_id');
        continue;
      }
      if (slice.status && !['DONE', 'in_progress', 'PARKED', 'ABANDONED'].includes(slice.status)) {
        fail(`slice "${slice.slice_id}" has invalid status "${slice.status}" (expected DONE, in_progress, PARKED, or ABANDONED)`);
      }
      if (slice.phase && !PHASES.includes(slice.phase)) {
        fail(`slice "${slice.slice_id}" has invalid phase "${slice.phase}"`);
      }

      const sliceDir = join(root, '.harness/state/slices', slice.slice_id);
      if (indexed.has(slice.slice_id) && !existsSync(sliceDir)) {
        fail(`registry lists slice "${slice.slice_id}" but ${sliceDir.slice(root.length + 1)} is absent — run: asdd sync`);
        continue;
      }
      const v2ManifestPath = join(sliceDir, 'manifest.json');
      const sessionsDir = join(sliceDir, 'sessions');
      const manifestExists = existsSync(v2ManifestPath);
      const manifestData = manifestExists ? readJson(`.harness/state/slices/${slice.slice_id}/manifest.json`) : null;
      const isV2 = manifestData && manifestData.schema_version === '2.0';
      const isV3 = existsSync(sessionsDir);

      if (isV2 && isV3) {
        warn(`slice "${slice.slice_id}" has both v2 manifest and v3 sessions — ambiguous`);
      }

      if (isV2) {
        // Backward compat: validate v2 manifest using old rules
        if (slice.manifest && !dirExists(slice.manifest)) {
          fail(`slice "${slice.slice_id}" manifest path does not exist: ${slice.manifest}`);
        }
        if (slice.progress && !dirExists(slice.progress)) {
          fail(`slice "${slice.slice_id}" progress path does not exist: ${slice.progress}`);
        }
        if (slice.features && !dirExists(slice.features)) {
          fail(`slice "${slice.slice_id}" features path does not exist: ${slice.features}`);
        }

        if (slice.manifest && dirExists(slice.manifest)) {
          const sliceManifest = readJson(slice.manifest);
          if (sliceManifest) {
            if (sliceManifest.schema_version !== '2.0') {
              warn(`slice "${slice.slice_id}" manifest schema_version is "${sliceManifest.schema_version}", expected "2.0"`);
            }
            if (sliceManifest.slice_id !== slice.slice_id) {
              fail(`slice "${slice.slice_id}" manifest slice_id mismatch: ${sliceManifest.slice_id}`);
            }
            if (sliceManifest.mode && !SLICE_MODES.includes(sliceManifest.mode)) {
              fail(`slice "${slice.slice_id}" has invalid mode "${sliceManifest.mode}" (expected ${SLICE_MODES.join(', ')})`);
            }

            // Phase/status consistency with global manifest
            if (sliceManifest.phase && slice.phase && sliceManifest.phase !== slice.phase) {
              warn(`slice "${slice.slice_id}" phase mismatch: global="${slice.phase}" per-slice="${sliceManifest.phase}"`);
            }
            if (sliceManifest.status && slice.status && sliceManifest.status !== slice.status) {
              warn(`slice "${slice.slice_id}" status mismatch: global="${slice.status}" per-slice="${sliceManifest.status}"`);
            }

            // Feature invariants per-slice
            if (sliceManifest.paths?.features && dirExists(sliceManifest.paths.features)) {
              const features = readJson(sliceManifest.paths.features);
              if (features) {
                if (features.slice_id && features.slice_id !== slice.slice_id) {
                  fail(`features.slice_id (${features.slice_id}) != slice_id (${slice.slice_id}) in ${slice.slice_id}`);
                }
                const list = Array.isArray(features.features) ? features.features : [];
                validateFeatureExecution(features, slice.features || sliceManifest.paths.features, slice.slice_id, fail, readJson, root);
                for (const f of list) {
                  if (f.status === 'passing' && !String(f.evidence || '').trim()) {
                    fail(`feature ${f.id} in "${slice.slice_id}" is passing without evidence`);
                  }
                  if (!Array.isArray(f.verification) || f.verification.length < 1) {
                    fail(`feature ${f.id} in "${slice.slice_id}" missing verification`);
                  }
                }

                // Cross-check: if slice is DONE at implementation+, features should be all passing
                if (sliceManifest.phase === 'knowledge' || sliceManifest.phase === 'qa') {
                  const allPassing = list.length > 0 && list.every((f) => f.status === 'passing');
                  if (!allPassing) {
                    const notPassing = list.filter((f) => f.status !== 'passing').map((f) => `${f.id}:${f.status}`);
                    warn(`slice "${slice.slice_id}" is at ${sliceManifest.phase} but features not all passing: ${notPassing.join(', ')}`);
                  }
                }
              }
            }

            // Implementation phase requires features
            if (sliceManifest.phase === 'implementation' && !sliceManifest.paths?.features) {
              fail(`slice "${slice.slice_id}" is in implementation but has no paths.features`);
            }
          }
        }
      } else if (isV3) {
        // v3: validate sessions directory instead of editable manifest
        const sessionFiles = readdirSync(sessionsDir).filter((n) => n.endsWith('.json'));
        if (sessionFiles.length === 0) {
          warn(`slice "${slice.slice_id}" sessions directory is empty`);
        }
        // AR-3/AR-1: session filenames are NNN-<slug>.json forward-only — no merge driver; a duplicated sequence
        // number is a visible collision to rename, never content-merge.
        const seenSeq = new Map();
        for (const sf of sessionFiles) {
          if (!/^\d{3}-.+\.json$/.test(sf)) {
            warn(`slice "${slice.slice_id}" session "${sf}" does not follow NNN-<slug>.json naming (AR-3)`);
          } else {
            const seq = sf.slice(0, 3);
            const prior = seenSeq.get(seq);
            if (prior) {
              warn(`slice "${slice.slice_id}" sessions "${prior}" and "${sf}" share sequence ${seq} — rename one (AR-3: collisions resolve by rename, never merge)`);
            } else {
              seenSeq.set(seq, sf);
            }
          }
          const sessionRel = `.harness/state/slices/${slice.slice_id}/sessions/${sf}`;
          const sessionData = readJson(sessionRel);
          if (sessionData) {
            validateSessionFile(sessionData, sessionRel, fail);
          }
        }

        // v3 feature validation if features path exists
        const featuresPath = slice.features || `.harness/features/${slice.slice_id}.features.json`;
        if (dirExists(featuresPath)) {
          const features = readJson(featuresPath);
          if (features) {
            if (features.slice_id && features.slice_id !== slice.slice_id) {
              fail(`features.slice_id (${features.slice_id}) != slice_id (${slice.slice_id}) in ${slice.slice_id}`);
            }
            const list = Array.isArray(features.features) ? features.features : [];
            validateFeatureExecution(features, featuresPath, slice.slice_id, fail, readJson, root, false);
            for (const f of list) {
              if (f.status === 'passing' && !String(f.evidence || '').trim()) {
                fail(`feature ${f.id} in "${slice.slice_id}" is passing without evidence`);
              }
              if (!Array.isArray(f.verification) || f.verification.length < 1) {
                fail(`feature ${f.id} in "${slice.slice_id}" missing verification`);
              }
            }
          }
        }
      } else {
        // Neither v2 nor v3 — fall back to path checks if specified
        if (slice.manifest && !dirExists(slice.manifest)) {
          fail(`slice "${slice.slice_id}" manifest path does not exist: ${slice.manifest}`);
        }
        if (slice.progress && !dirExists(slice.progress)) {
          fail(`slice "${slice.slice_id}" progress path does not exist: ${slice.progress}`);
        }
        if (slice.features && !dirExists(slice.features)) {
          fail(`slice "${slice.slice_id}" features path does not exist: ${slice.features}`);
        }
      }
    }

  // Project bindings completeness
  const projectConfig = readJson('.harness/config/project.json');
  if (projectConfig && projectConfig.bindings_complete === false) {
    warn('project bindings are scaffolded but still require project-specific content (bindings_complete = false)');
  }

  // Orphan slice detection + AR-2: expected-generated files absent while their state inputs exist.
  for (const sliceName of sliceDirNames) {
    const sliceManifestPath = join(slicesDir, sliceName, 'manifest.json');
    const sliceSessionsDir = join(slicesDir, sliceName, 'sessions');
    const hasV2 = existsSync(sliceManifestPath);
    const hasV3 = existsSync(sliceSessionsDir);

    if (!hasV2 && !hasV3) {
      // Empty slice directory — check if it has specs
      const specDir = join(root, '.harness/specs', sliceName);
      if (existsSync(specDir) && readdirSync(specDir).length > 0) {
        fail(`orphan slice "${sliceName}" has specs but no manifest or sessions`);
      } else if (existsSync(specDir)) {
        // Empty specs dir + empty state dir — stale empty directories
        warn(`empty slice directories detected for "${sliceName}" (no specs, no manifest, no sessions)`);
      }
      continue;
    }

    if (!indexed.has(sliceName)) {
      fail(`orphan slice "${sliceName}" has state but is not in registry.json — run: asdd sync`);
    }
    // Sessions are state; the generated per-slice manifest must be regenerable, not absent.
    if (hasV3 && !hasV2) {
      fail(`generated state missing: .harness/state/slices/${sliceName}/manifest.json — run: asdd sync`);
    }
  }

  // AR-2: learning summaries (tracked inputs) exist but the derived patterns file does not.
  const summariesDir = join(root, '.harness/state/learning/summaries');
  if (
    existsSync(summariesDir) &&
    readdirSync(summariesDir).some((n) => n.endsWith('.json')) &&
    !existsSync(join(root, '.harness/state/learning/patterns.json'))
  ) {
    fail('generated state missing: .harness/state/learning/patterns.json — run: asdd learn');
  }
}
