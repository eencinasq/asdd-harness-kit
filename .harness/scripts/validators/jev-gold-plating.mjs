/**
 * Jev gold-plating: git diff of in-progress feature scopes vs intent/spec.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { goldPlatingGate } from '../jev-gates.mjs';
import { isJevEnabled } from '../jev-client.mjs';

function readIntent(root, sliceId) {
  for (const name of ['intent.md', 'spec.md']) {
    const p = join(root, '.harness/specs', sliceId, name);
    if (existsSync(p)) return readFileSync(p, 'utf8');
  }
  return null;
}

function inProgressFeatures(root) {
  const dir = join(root, '.harness/features');
  if (!existsSync(dir)) return [];
  const found = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.features.json')) continue;
    try {
      const data = JSON.parse(readFileSync(join(dir, name), 'utf8'));
      for (const feature of data.features || []) {
        if (feature.status === 'in_progress') {
          found.push({ sliceId: data.slice_id, feature });
        }
      }
    } catch {
      /* skip malformed */
    }
  }
  return found;
}

function gitDiff(root, paths) {
  if (!paths.length) return '';
  try {
    return execFileSync('git', ['diff', '--', ...paths], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 2_000_000
    }).trim();
  } catch {
    return '';
  }
}

export async function validateJevGoldPlating(ctx) {
  const { root, fail, warn } = ctx;
  if (!isJevEnabled()) return;

  const active = inProgressFeatures(root);
  if (active.length === 0) return;

  for (const { sliceId, feature } of active) {
    const intent = readIntent(root, sliceId);
    if (!intent) {
      warn(`No intent.md/spec.md for ${sliceId}, skipping gold-plating`);
      continue;
    }
    const paths = Array.isArray(feature.scope_paths) ? feature.scope_paths : [];
    const diff = gitDiff(root, paths);
    if (!diff) continue;

    const gate = await goldPlatingGate({
      intent: intent.slice(0, 5000),
      diff: diff.slice(0, 5000),
      sliceId
    });
    if (gate.unavailable) {
      fail(`Jev gold-plating unavailable for ${feature.id}: ${gate.result._reason}`);
      continue;
    }
    if (!gate.ok) {
      warn(
        `Jev gold-plating noul ${gate.result.prob_yes} < 0.85 on ${feature.id}. Review diff against spec.`
      );
    }
  }
}
