import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PHASES } from '../sync-state.mjs';

// Tag match keys for JIT steering (see .agents/agents/_runtime-template.md):
// slice phases, the optional refactor phase, slice mode, and active roles.
export const STEERING_TAGS = new Set([...PHASES, 'refactor', 'lite', 'review', 'ui']);

// File classes valid in frontmatter (`kit_steering_rule` — _steering-profile.md).
// Registry-only classes (never frontmatter): artifact_template, contract-doc.
export const STEERING_FILE_CLASSES = new Set(['portable', 'binding', 'module', 'index', 'hybrid-index']);

const RULE_HEADING = /^#{1,4}\s+(?:\d+\.\s*)?(Invariants|Negative Space|Non-Negotiable)/m;

export function parseSteeringFrontmatter(text) {
  if (!text.startsWith('---\n')) return null;
  const end = text.indexOf('\n---', 4);
  if (end < 0) return null;
  let inclusion = null;
  let classification = null;
  const tags = [];
  let inTags = false;
  for (const line of text.slice(4, end).split('\n')) {
    const inc = line.match(/^inclusion:\s*["']?([\w-]+)["']?\s*$/);
    if (inc) { inclusion = inc[1]; inTags = false; continue; }
    const cls = line.match(/^classification:\s*["']?([\w-]+)["']?\s*$/);
    if (cls) { classification = cls[1]; inTags = false; continue; }
    if (/^tags:\s*$/.test(line)) { inTags = true; continue; }
    const tag = line.match(/^\s+-\s*["']?([\w-]+)["']?\s*$/);
    if (inTags && tag) { tags.push(tag[1]); continue; }
    if (/^\S/.test(line)) inTags = false;
  }
  return { inclusion, tags, classification };
}

/** Load kit registry + optional consumer local registry; null when absent. */
export function loadSteeringRegistry(root) {
  const kit = join(root, '.harness/config/steering.registry.json');
  if (!existsSync(kit)) return null;
  let entries = {};
  try {
    const parsed = JSON.parse(readFileSync(kit, 'utf8'));
    entries = { ...(parsed.kit ?? {}) };
  } catch {
    return { entries: null, parseError: true };
  }
  const local = join(root, '.harness/config/steering.registry.local.json');
  if (existsSync(local)) {
    try {
      const parsed = JSON.parse(readFileSync(local, 'utf8'));
      Object.assign(entries, parsed.project ?? parsed.kit ?? {});
    } catch {
      return { entries: null, parseError: true };
    }
  }
  return { entries, parseError: false };
}

/** True when a `_`-file carries rule-shaped headings outside fenced code blocks. */
function hasRuleShapedHeadings(text) {
  let inFence = false;
  for (const line of text.split('\n')) {
    if (line.trimStart().startsWith('```')) { inFence = !inFence; continue; }
    if (!inFence && RULE_HEADING.test(line)) return true;
  }
  return false;
}

/** Basename set (no extension) of registry entries whose inclusion is `always`. */
function alwaysBasenames(entries) {
  return new Set(
    Object.entries(entries)
      .filter(([, e]) => e.inclusion === 'always')
      .map(([p]) => p.split('/').pop().replace(/\.md$/, '')),
  );
}

/** Registry entries that are installable steering rules (portable/module/index/hybrid). */
function portableSet(entries) {
  return new Set(
    Object.entries(entries)
      .filter(([, e]) => ['portable', 'module', 'index', 'hybrid-index'].includes(e.class))
      .map(([p]) => p.split('/').pop()),
  );
}

// ---------------------------------------------------------------- drift checks

/** Names in the segment after `anchor` within its parens group, cut at `;` — `name` or `name.md`, backticked or bare. */
function namesAfter(s, anchor) {
  const groups = s.match(/\([^)]*\)/g) ?? [];
  for (const g of groups) {
    const i = g.indexOf(anchor);
    if (i < 0) continue;
    const seg = g.slice(i + anchor.length).split(';')[0];
    return new Set(
      [...seg.matchAll(/`?([A-Za-z][\w-]*?)(?:\.md)?`?(?=[\s,)+]|$)/g)]
        .map((x) => x[1].replace(/\.md$/, '')),
    );
  }
  return new Set();
}

/** Names inside the first parens group of a line — `name` or `name.md`, backticked or bare. */
function namesIn(s) {
  const m = s.match(/\(([^)]*)\)/);
  if (!m) return new Set();
  return new Set(
    [...m[1].matchAll(/`?([A-Za-z][\w-]*?)(?:\.md)?`?(?=[\s,)+]|$)/g)]
      .map((x) => x[1].replace(/\.md$/, '')),
  );
}

function checkEnumerationDrift(ctx, entries) {
  const { root, fail, warn } = ctx;
  const always = alwaysBasenames(entries);

  // AGENTS.md — project-owned in consumers → warn only.
  const agents = join(root, 'AGENTS.md');
  if (existsSync(agents)) {
    const line = readFileSync(agents, 'utf8').split('\n')
      .find((l) => l.includes('inclusion') && l.includes('always'));
    if (line) {
      const listed = namesIn(line);
      const missing = [...always].filter((n) => !listed.has(n));
      const extra = [...listed].filter((n) => !always.has(n));
      if (missing.length || extra.length) {
        warn(`AGENTS.md always-list drifts from registry (missing: ${missing.join(',') || 'none'}; extra: ${extra.join(',') || 'none'})`);
      }
    }
  }

  // runtimes/cursor/asdd-steering.mdc — kit-managed projection → fail on drift.
  const mdc = join(root, 'runtimes/cursor/asdd-steering.mdc');
  if (existsSync(mdc)) {
    const lines = readFileSync(mdc, 'utf8').split('\n');
    const alwaysLine = lines.find((l) => l.includes('always files'));
    if (alwaysLine) {
      const listed = namesAfter(alwaysLine, 'always files:');
      const missing = [...always].filter((n) => !listed.has(n));
      const extra = [...listed].filter((n) => !always.has(n));
      if (missing.length || extra.length) {
        fail(`asdd-steering.mdc always-list drifts from registry (missing: ${missing.join(',') || 'none'}; extra: ${extra.join(',') || 'none'})`);
      }
    }
    // Recorded G-6: mandated reads for auto files bypass JIT tag filtering.
    const bypass = lines.find((l) => /Any ASDD work/i.test(l));
    if (bypass && /\.md/.test(bypass)) {
      const auto = new Set(
        Object.entries(entries)
          .filter(([, e]) => e.inclusion === 'auto')
          .map(([p]) => p.split('/').pop()),
      );
      const listedMd = [...bypass.matchAll(/`([\w-]+\.md)`/g)].map((x) => x[1]);
      const mandated = listedMd.filter((n) => auto.has(n));
      if (mandated.length) {
        warn(`asdd-steering.mdc mandates reads for auto files bypassing tags: ${mandated.join(', ')} (recorded G-6 — Phase-2 generated projections)`);
      }
      // The row also re-enumerates the always set inline — check it for drift too.
      const listedAlways = listedMd.map((n) => n.replace(/\.md$/, '')).filter((n) => always.has(n));
      const missing = [...always].filter((n) => !listedAlways.includes(n));
      if (missing.length) {
        fail(`asdd-steering.mdc work-table always-list drifts from registry (missing: ${missing.join(',')})`);
      }
    }
  }

  // .harness/steering/README.md portable table — kit-owned → fail on drift.
  const readme = join(root, '.harness/steering/README.md');
  if (existsSync(readme)) {
    const text = readFileSync(readme, 'utf8');
    const sec = text.split(/^## /m).find((s) => /^Portable contracts/.test(s));
    if (sec) {
      const listed = new Set([...sec.matchAll(/`([\w-]+\.md)`/g)].map((x) => x[1]));
      const expected = portableSet(entries);
      expected.delete('README.md'); // the index does not list itself
      const missing = [...expected].filter((n) => !listed.has(n));
      const extra = [...listed].filter((n) => !expected.has(n));
      if (missing.length || extra.length) {
        fail(`steering README portable table drifts from registry (missing: ${missing.join(',') || 'none'}; extra: ${extra.join(',') || 'none'})`);
      }
    }
  }
}

// ------------------------------------------------------------------- validate

export default function validate(ctx) {
  const { root, fail, warn } = ctx;
  const dir = join(root, '.harness/steering');
  if (!existsSync(dir)) return;

  const reg = loadSteeringRegistry(root);
  if (reg?.parseError) {
    fail('steering registry is present but unparseable (.harness/config/steering.registry.json or .local.json)');
    return;
  }
  const entries = reg?.entries ?? null;

  const names = readdirSync(dir).sort();
  for (const name of names) {
    if (!name.endsWith('.md')) continue;
    const rel = `.harness/steering/${name}`;
    const text = readFileSync(join(dir, name), 'utf8');
    const entry = entries?.[rel] ?? null;

    if (name.startsWith('_')) {
      // contract-doc: exempt only when declared (registry or this check's class).
      if (entry?.class === 'contract-doc') continue;
      if (hasRuleShapedHeadings(text)) {
        fail(`${rel}: undeclared contract-doc carries rule-shaped headings — declare it in the registry or remove the headings`);
      } else {
        warn(`${rel}: _-file not declared as contract-doc in steering registry`);
      }
      continue;
    }

    if (entries && !entry) {
      fail(`${rel}: not registered in steering.registry.json (kit block) or steering.registry.local.json (project block)`);
      continue;
    }

    const fm = parseSteeringFrontmatter(text);
    if (!fm || !fm.inclusion) {
      fail(`${rel}: missing frontmatter inclusion (required by kit_steering_rule)`);
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

    if (fm.classification && !STEERING_FILE_CLASSES.has(fm.classification)) {
      fail(`${rel}: classification "${fm.classification}" not in {${[...STEERING_FILE_CLASSES].join(', ')}}`);
    }
    if (entry) {
      if (fm.classification && fm.classification !== entry.class) {
        fail(`${rel}: classification "${fm.classification}" does not match registry class "${entry.class}"`);
      }
      if (!fm.classification) {
        warn(`${rel}: missing classification frontmatter (registry declares "${entry.class}")`);
      }
      if (entry.inclusion && entry.inclusion !== 'none' && entry.inclusion !== fm.inclusion) {
        fail(`${rel}: inclusion "${fm.inclusion}" does not match registry inclusion "${entry.inclusion}"`);
      }
      // Starvation: registry coverage keys must be loadable via tags.
      if (Array.isArray(entry.coverage)) {
        const missing = entry.coverage.filter((k) => !fm.tags.includes(k));
        if (missing.length) {
          warn(`${rel}: coverage keys not reachable via tags (starvation, Phase-2 backlog): ${missing.join(', ')}`);
        }
      }
    } else if (!fm.classification) {
      warn(`${rel}: missing classification frontmatter`);
    }

    // Pseudo-always: an `auto` file whose tags cover all 9 PHASES.
    if (fm.inclusion === 'auto' && PHASES.every((p) => fm.tags.includes(p))) {
      warn(`${rel}: pseudo-always tag set (covers all ${PHASES.length} phases) — resolve per D-4b: reclassify "always" (recorded budget decision) or retag`);
    }
  }

  // Contract↔binding tag symmetry: x.project.md tags ⊆ x.md tags.
  for (const name of names) {
    const m = name.match(/^([\w-]+)\.project\.md$/);
    if (!m) continue;
    const contract = join(dir, `${m[1]}.md`);
    if (!existsSync(contract)) continue;
    const cfm = parseSteeringFrontmatter(readFileSync(contract, 'utf8'));
    const bfm = parseSteeringFrontmatter(readFileSync(join(dir, name), 'utf8'));
    if (!cfm || !bfm) continue;
    const extra = bfm.tags.filter((t) => !cfm.tags.includes(t));
    if (extra.length) {
      warn(`.harness/steering/${name}: binding tags [${extra.join(', ')}] not in contract ${m[1]}.md tags — symmetric coverage or rationale required`);
    }
  }

  if (entries) checkEnumerationDrift(ctx, entries);
}
