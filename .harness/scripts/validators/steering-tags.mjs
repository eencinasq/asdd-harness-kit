import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PHASES } from '../sync-state.mjs';

// Tag match keys for JIT steering (see .agents/agents/_runtime-template.md):
// slice phases, the optional refactor phase, slice mode, and active roles.
export const STEERING_TAGS = new Set([...PHASES, 'refactor', 'lite', 'review', 'ui']);

export function parseSteeringFrontmatter(text) {
  if (!text.startsWith('---\n')) return null;
  const end = text.indexOf('\n---', 4);
  if (end < 0) return null;
  let inclusion = null;
  const tags = [];
  let inTags = false;
  for (const line of text.slice(4, end).split('\n')) {
    const inc = line.match(/^inclusion:\s*["']?([\w-]+)["']?\s*$/);
    if (inc) { inclusion = inc[1]; inTags = false; continue; }
    if (/^tags:\s*$/.test(line)) { inTags = true; continue; }
    const tag = line.match(/^\s+-\s*["']?([\w-]+)["']?\s*$/);
    if (inTags && tag) { tags.push(tag[1]); continue; }
    if (/^\S/.test(line)) inTags = false;
  }
  return { inclusion, tags };
}

export default function validate(ctx) {
  const { root, fail, warn } = ctx;
  const dir = join(root, '.harness/steering');
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith('.md')) continue;
    const rel = `.harness/steering/${name}`;
    const fm = parseSteeringFrontmatter(readFileSync(join(dir, name), 'utf8'));
    if (!fm || !fm.inclusion) {
      // Project-authored bindings may predate frontmatter; they are not JIT-filtered.
      warn(`${rel}: missing frontmatter inclusion (not JIT-filtered)`);
      continue;
    }
    if (fm.inclusion !== 'always' && fm.inclusion !== 'auto') {
      fail(`${rel}: inclusion must be "always" or "auto" (got "${fm.inclusion}")`);
      continue;
    }
    if (fm.inclusion === 'auto' && fm.tags.length === 0) fail(`${rel}: inclusion "auto" needs at least one tag`);
    for (const tag of fm.tags) {
      if (!STEERING_TAGS.has(tag)) {
        fail(`${rel}: unknown steering tag "${tag}" (allowed: ${[...STEERING_TAGS].join(', ')})`);
      }
    }
  }
}
