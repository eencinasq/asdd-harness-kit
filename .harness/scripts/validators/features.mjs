import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeScopePath, pathsOverlap } from './paths.mjs';

export function validateFeatureDocument(data, rel, fail, root) {
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
  if (!Array.isArray(data?.features)) {
    fail(rel + ': features must be an array');
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

export function validateFeatureExecution(data, rel, sliceId, fail, readJson, root) {
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

export default function validate(ctx) {
  const { root, fail, warn, readJson, manifest } = ctx;
  const featuresDir = join(root, '.harness/features');
  if (!existsSync(featuresDir)) return;

  for (const name of readdirSync(featuresDir)) {
    if (!name.endsWith('.features.json')) continue;
    const rel = `.harness/features/${name}`;
    const data = readJson(rel);
    if (!data) continue;
    validateFeatureDocument(data, rel, fail, root);
    const list = Array.isArray(data.features) ? data.features : [];
    const sliceId = data.slice_id;
    validateFeatureExecution(data, rel, sliceId, fail, readJson, root);

    // Check features without a corresponding slice in global manifest
    if (sliceId) {
      const knownSliceIds = new Set(
        Array.isArray(manifest?.active_slices)
          ? manifest.active_slices.map((s) => typeof s === 'string' ? s : s.slice_id)
          : [],
      );
      if (!knownSliceIds.has(sliceId)) {
        warn(`features file "${rel}" references slice "${sliceId}" not in global manifest`);
      }
    }
  }
}
