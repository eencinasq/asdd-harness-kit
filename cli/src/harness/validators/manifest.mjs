import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
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
  if (data.phase !== undefined && !['discovery', 'spec', 'validation', 'domain', 'design', 'task_planning', 'implementation', 'qa', 'knowledge'].includes(data.phase)) {
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
  const { root, fail, warn, readJson, dirExists, manifest } = ctx;

  // Global manifest schema v2.0 or v3.0
  if (manifest) {
    const isV3Global = manifest.schema_version === '3.0';
    const isV2Global = manifest.schema_version === '2.0';
    if (!isV2Global && !isV3Global) {
      fail(`global manifest schema_version should be "2.0" or "3.0", got "${manifest.schema_version}"`);
    }
    if (!Array.isArray(manifest.active_slices)) {
      fail('global manifest missing active_slices array');
    }
    if (manifest.active_slices && manifest.active_slices.length === 0) {
      warn('global manifest has no active_slices');
    }

    // Normalize active_slices to array of { slice_id, ... } objects
    const normalizedSlices = (manifest.active_slices || []).map((s) =>
      typeof s === 'string' ? { slice_id: s } : s,
    );

    // Validate each slice reference in global manifest
    for (const slice of normalizedSlices) {
      if (!slice.slice_id) {
        fail('active_slices entry missing slice_id');
        continue;
      }
      if (slice.status && !['DONE', 'in_progress', 'PARKED', 'ABANDONED'].includes(slice.status)) {
        fail(`slice "${slice.slice_id}" has invalid status "${slice.status}" (expected DONE, in_progress, PARKED, or ABANDONED)`);
      }
      if (slice.phase && !['discovery', 'spec', 'validation', 'domain', 'design', 'task_planning', 'implementation', 'qa', 'knowledge'].includes(slice.phase)) {
        fail(`slice "${slice.slice_id}" has invalid phase "${slice.phase}"`);
      }

      const sliceDir = join(root, '.harness/state/slices', slice.slice_id);
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
            if (sliceManifest.mode && !['full', 'lite', 'escalated'].includes(sliceManifest.mode)) {
              fail(`slice "${slice.slice_id}" has invalid mode "${sliceManifest.mode}" (expected full, lite, or escalated)`);
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
        for (const sf of sessionFiles) {
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
  }

  // Registry validation
  const registryPath = join(root, '.harness/state/registry.json');
  if (existsSync(registryPath)) {
    const registry = readJson('.harness/state/registry.json');
    if (registry) {
      if (!Array.isArray(registry.slices)) {
        fail('registry.json missing slices array');
      } else {
        const activeSliceIds = new Set(
          Array.isArray(manifest?.active_slices)
            ? manifest.active_slices.map((s) => typeof s === 'string' ? s : s.slice_id)
            : [],
        );
        const registrySliceIds = new Set(registry.slices.map((s) => s.slice_id).filter(Boolean));
        for (const sliceId of activeSliceIds) {
          if (!registrySliceIds.has(sliceId)) {
            fail(`slice "${sliceId}" is in global active_slices but missing from registry.json`);
          }
        }
        for (const sliceId of registrySliceIds) {
          if (!activeSliceIds.has(sliceId)) {
            warn(`slice "${sliceId}" is in registry.json but not in global active_slices`);
          }
        }
      }
    }
  } else {
    warn('registry.json not found — skipping registry validation');
  }

  // Project bindings completeness
  const projectConfig = readJson('.harness/config/project.json');
  if (projectConfig && projectConfig.bindings_complete === false) {
    // v3: phase info is in per-slice manifests, not global — skip late-phase check from global
    warn('project bindings are scaffolded but still require project-specific content (bindings_complete = false)');
  }

  // Orphan slice detection
  const slicesDir = join(root, '.harness/state/slices');
  if (existsSync(slicesDir)) {
    const knownSliceIds = new Set(
      Array.isArray(manifest?.active_slices)
        ? manifest.active_slices.map((s) => typeof s === 'string' ? s : s.slice_id)
        : [],
    );

    for (const name of readdirSync(slicesDir, { withFileTypes: true })) {
      if (!name.isDirectory() || name.name.startsWith('.')) continue;
      const sliceName = name.name;
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

      if (!knownSliceIds.has(sliceName)) {
        fail(`orphan slice "${sliceName}" has state but is not in global active_slices`);
      }
    }
  }
}
