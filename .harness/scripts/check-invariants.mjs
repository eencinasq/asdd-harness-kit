#!/usr/bin/env node
/**
 * Harness Engineering invariants (cheap, no Nx).
 * Run from repo root: node .harness/scripts/check-invariants.mjs
 *
 * Supports:
 * - Global manifest schema v2.0 (active_slices array)
 * - Per-slice manifests (state/slices/<id>/manifest.json)
 * - Feature tracker invariants (dependencies, concurrent ownership/scope, evidence)
 * - Orphan slice detection
 * - Stale lock detection
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const errors = [];
const warnings = [];

function fail(msg) {
  errors.push(msg);
}

function warn(msg) {
  warnings.push(msg);
}

function readJson(rel) {
  const p = join(root, rel);
  if (!existsSync(p)) {
    fail(`missing JSON: ${rel}`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    fail(`invalid JSON ${rel}: ${e.message}`);
    return null;
  }
}

function dirExists(rel) {
  return existsSync(join(root, rel));
}

function normalizeScopePath(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const path = value.trim().replaceAll('\\', '/').replace(/\/+/g, '/').replace(/\/$/, '');
  if (!path || path.startsWith('/') || /^[A-Za-z]:/.test(path)) return null;
  const parts = path.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) return null;
  return parts.join('/');
}

function pathsOverlap(left, right) {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function validateFeatureDocument(data, rel) {
  if (data?.schema_version !== '1.0') {
    fail(rel + ': schema_version must be "1.0"');
  }
  if (typeof data?.slice_id !== 'string' || !data.slice_id.trim()) {
    fail(rel + ': slice_id must be a non-empty string');
  }
  if (typeof data?.source_tasks !== 'string' || !data.source_tasks.trim()) {
    fail(rel + ': source_tasks must be a non-empty repository-relative path');
  } else if (!existsSync(join(root, data.source_tasks))) {
    fail(rel + ': source_tasks does not exist: ' + data.source_tasks);
  }
  if (!Array.isArray(data?.features) || data.features.length === 0) {
    fail(rel + ': features must be a non-empty array');
    return;
  }
  for (const feature of data.features) {
    for (const key of ['id', 'title', 'user_visible_behavior', 'status']) {
      if (typeof feature?.[key] !== 'string' || !feature[key].trim()) {
        fail(rel + ': feature ' + (feature?.id ?? '<unknown>') + ' missing ' + key);
      }
    }
    if (!Number.isInteger(feature.priority) || feature.priority < 1) {
      fail(rel + ': feature ' + (feature?.id ?? '<unknown>') + ' priority must be a positive integer');
    }
    if (!Array.isArray(feature.verification) || feature.verification.length < 1) {
      fail(rel + ': feature ' + (feature?.id ?? '<unknown>') + ' missing verification');
    }
  }
}

function validateFeatureExecution(data, rel, sliceId) {
  const list = Array.isArray(data?.features) ? data.features : [];
  const byId = new Map(list.map((feature) => [feature.id, feature]));
  const active = list.filter((feature) => feature.status === 'in_progress');

  for (const feature of list) {
    const dependencies = feature.depends_on ?? [];
    if (!Array.isArray(dependencies)) {
      fail(`${rel}: feature ${feature.id} depends_on must be an array`);
      continue;
    }
    for (const dependencyId of dependencies) {
      const dependency = byId.get(dependencyId);
      if (!dependency) {
        fail(`${rel}: feature ${feature.id} depends on unknown feature ${dependencyId}`);
      } else if (feature.status === 'in_progress' && dependency.status !== 'passing') {
        fail(`${rel}: feature ${feature.id} is in_progress before dependency ${dependencyId} is passing`);
      }
    }
  }

  if (active.length <= 1) return;

  const lockPath = `.harness/state/locks/${sliceId}.lock`;
  if (!existsSync(join(root, lockPath))) {
    fail(`${rel}: concurrent tasks require the slice coordinator lock ${lockPath}`);
  } else {
    const lock = readJson(lockPath);
    if (lock && lock.slice !== sliceId) {
      fail(`${rel}: coordinator lock ${lockPath} identifies slice "${lock.slice}"`);
    }
    if (lock && (typeof lock.agent !== 'string' || !lock.agent.trim())) {
      fail(`${rel}: coordinator lock ${lockPath} needs a non-empty agent identity`);
    }
  }

  const owners = new Set();
  const scopedTasks = [];
  const reserved = ['.harness/state', '.harness/features', '.harness/progress', '.harness/PROGRESS.md'];
  for (const feature of active) {
    if (typeof feature.owner !== 'string' || !feature.owner.trim()) {
      fail(`${rel}: concurrent feature ${feature.id} needs an owner`);
    } else if (owners.has(feature.owner)) {
      fail(`${rel}: concurrent features share owner "${feature.owner}"`);
    } else {
      owners.add(feature.owner);
    }

    if (!Array.isArray(feature.scope_paths) || feature.scope_paths.length === 0) {
      fail(`${rel}: concurrent feature ${feature.id} needs non-empty scope_paths`);
      continue;
    }

    const paths = [];
    for (const rawPath of feature.scope_paths) {
      const normalized = normalizeScopePath(rawPath);
      if (!normalized) {
        fail(`${rel}: feature ${feature.id} has invalid repository-relative scope path "${rawPath}"`);
        continue;
      }
      if (reserved.some((prefix) => pathsOverlap(normalized, prefix))) {
        fail(`${rel}: feature ${feature.id} cannot own shared harness state path "${normalized}"`);
      }
      paths.push(normalized);
    }
    scopedTasks.push({ id: feature.id, paths });
  }

  for (let i = 0; i < scopedTasks.length; i += 1) {
    for (let j = i + 1; j < scopedTasks.length; j += 1) {
      for (const left of scopedTasks[i].paths) {
        for (const right of scopedTasks[j].paths) {
          if (pathsOverlap(left, right)) {
            fail(`${rel}: concurrent features ${scopedTasks[i].id} and ${scopedTasks[j].id} have overlapping scopes: ${left} / ${right}`);
          }
        }
      }
    }
  }
}


// === 1. Banned SoT paths ===

for (const banned of ['.kiro/steering', '.kiro/specs', '.kiro/state']) {
  if (dirExists(banned)) {
    fail(`banned SoT path exists: ${banned} (SoT is .harness/ only)`);
  }
}

// === 2. Global manifest (schema v2.0) ===

const manifest = readJson('.harness/state/manifest.json');
if (manifest) {
  // Global manifest must be schema v2.0
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
              validateFeatureExecution(features, slice.features || sliceManifest.paths.features, slice.slice_id);
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

// === 3. Orphan slice detection ===

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
        warnings.push(`empty slice directories detected for "${sliceName}" (no specs, no manifest)`);
      }
      continue;
    }

    if (!knownSliceIds.has(sliceName)) {
      fail(`orphan slice "${sliceName}" has a manifest but is not in global active_slices`);
    }
  }
}

// === 4. Stale lock detection ===

const locksDir = join(root, '.harness/state/locks');
if (existsSync(locksDir)) {
  for (const name of readdirSync(locksDir)) {
    if (!name.endsWith('.lock')) continue;
    const lockRel = `.harness/state/locks/${name}`;
    const lock = readJson(lockRel);
    if (!lock) continue;

    // Lock for a DONE slice is stale
    const sliceId = lock.slice || name.replace('.lock', '');
    const sliceEntry = Array.isArray(manifest?.active_slices)
      ? manifest.active_slices.find((s) => s.slice_id === sliceId)
      : null;
    if (sliceEntry && sliceEntry.status === 'DONE') {
      fail(`stale lock "${lockRel}" — slice "${sliceId}" is DONE`);
    }
  }
}

// === 5. Features directory scan (global) ===

const featuresDir = join(root, '.harness/features');
if (existsSync(featuresDir)) {
  for (const name of readdirSync(featuresDir)) {
    if (!name.endsWith('.features.json')) continue;
    const rel = `.harness/features/${name}`;
    const data = readJson(rel);
    if (!data) continue;
    validateFeatureDocument(data, rel);
    const list = Array.isArray(data.features) ? data.features : [];
    const sliceId = data.slice_id;
    validateFeatureExecution(data, rel, sliceId);

    // Check features without a corresponding slice in global manifest
    if (sliceId) {
      const knownSliceIds = new Set(
        Array.isArray(manifest?.active_slices) ? manifest.active_slices.map((s) => s.slice_id) : [],
      );
      if (!knownSliceIds.has(sliceId)) {
        warn(`features file "${rel}" references slice "${sliceId}" not in global manifest`);
      }
    }
  }
}

// === 6. Archive validation ===

if (dirExists('.harness/state/archive')) {
  const archive = join(root, '.harness/state/archive');
  for (const name of readdirSync(archive)) {
    if (!name.endsWith('.json')) continue;
    readJson(`.harness/state/archive/${name}`);
  }
}

// === Results ===

if (warnings.length) {
  for (const w of warnings) console.warn(`WARN  ${w}`);
}
if (errors.length) {
  for (const e of errors) console.error(`FAIL  ${e}`);
  process.exit(1);
}
console.log('PASS  harness invariants');
