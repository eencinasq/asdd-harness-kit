import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { validateFeatureExecution } from './features.mjs';

export default function validate(ctx) {
  const { root, fail, warn, readJson, dirExists, manifest } = ctx;

  // Global manifest schema v2.0
  if (manifest) {
    if (manifest.schema_version !== '2.0') {
      fail(`global manifest schema_version should be "2.0", got "${manifest.schema_version}"`);
    }
    if (!Array.isArray(manifest.active_slices)) {
      fail('global manifest missing active_slices array');
    }
    if (manifest.active_slices && manifest.active_slices.length === 0) {
      warn('global manifest has no active_slices');
    }

    // Validate each slice reference in global manifest
    if (Array.isArray(manifest.active_slices)) {
      for (const slice of manifest.active_slices) {
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
        // Check referenced paths exist
        if (slice.manifest && !dirExists(slice.manifest)) {
          fail(`slice "${slice.slice_id}" manifest path does not exist: ${slice.manifest}`);
        }
        if (slice.progress && !dirExists(slice.progress)) {
          fail(`slice "${slice.slice_id}" progress path does not exist: ${slice.progress}`);
        }
        if (slice.features && !dirExists(slice.features)) {
          fail(`slice "${slice.slice_id}" features path does not exist: ${slice.features}`);
        }

        // Cross-check per-slice manifest
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

            // Richness check: DONE slices at knowledge should have gates
            if (sliceManifest.status === 'DONE' && sliceManifest.phase === 'knowledge') {
              if (!sliceManifest.gates) {
                warn(`slice "${slice.slice_id}" is DONE at knowledge but has no gates block`);
              }
              if (!sliceManifest.confidence_chain) {
                warn(`slice "${slice.slice_id}" is DONE at knowledge but has no confidence_chain`);
              }
              if (!sliceManifest.ccs) {
                warn(`slice "${slice.slice_id}" is DONE at knowledge but has no ccs score`);
              }
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
      }
    }
  }

  // Project bindings completeness
  const projectConfig = readJson('.harness/config/project.json');
  if (projectConfig && projectConfig.bindings_complete === false) {
    const latePhaseSlices = (manifest?.active_slices || []).filter((s) =>
      ['implementation', 'qa', 'knowledge'].includes(s.phase),
    );
    if (latePhaseSlices.length > 0) {
      fail(`bindings_complete is false but slices are in late phases: ${latePhaseSlices.map((s) => s.slice_id).join(', ')}`);
    } else {
      warn('project bindings are scaffolded but still require project-specific content (bindings_complete = false)');
    }
  }

  // Orphan slice detection
  const slicesDir = join(root, '.harness/state/slices');
  if (existsSync(slicesDir)) {
    const knownSliceIds = new Set(
      Array.isArray(manifest?.active_slices) ? manifest.active_slices.map((s) => s.slice_id) : [],
    );

    for (const name of readdirSync(slicesDir, { withFileTypes: true })) {
      if (!name.isDirectory() || name.name.startsWith('.')) continue;
      const sliceName = name.name;
      const sliceManifestPath = join(slicesDir, sliceName, 'manifest.json');
      if (!existsSync(sliceManifestPath)) {
        // Empty slice directory — check if it has specs
        const specDir = join(root, '.harness/specs', sliceName);
        if (existsSync(specDir) && readdirSync(specDir).length > 0) {
          fail(`orphan slice "${sliceName}" has specs but no state/slices/${sliceName}/manifest.json`);
        } else if (existsSync(specDir)) {
          // Empty specs dir + empty state dir — stale empty directories
          warn(`empty slice directories detected for "${sliceName}" (no specs, no manifest)`);
        }
        continue;
      }

      if (!knownSliceIds.has(sliceName)) {
        fail(`orphan slice "${sliceName}" has a manifest but is not in global active_slices`);
      }
    }
  }
}
