#!/usr/bin/env node
/**
 * Fleet linter — SL-* rules over the effective skill fleet
 * (.agents/skills plus module skill trees; flat consumer-side).
 *
 * Decidable subset of skill.linter (Passes 1–2):
 *   SL-101  fleet promotion of S-014 (description negative boundary) — error
 *   SL-102  adjacent pair lacks bilateral cross-exclusion — warning
 *           (token-set Jaccard fallback per spec §4.2; judged-class result)
 *   SL-105  identical >=5-line procedural block in >=2 bundles — error
 *   SL-301  cycle over forward handoff edges — error
 *   SL-302  dangling skill reference (route decls + `that is `x`` + `skill `x``) — error
 *   SL-307  redirect edge with no reverse forward edge — error
 *
 * Edge grammar (parsed from `## Handoff & Convergence`):
 *   forward handoff : `skill: <name>`
 *   redirect        : `redirect → <name>` | `redirect: <name>`
 *   external        : `agent: <name>` | `human:` | `None (terminal)` (no fleet edge)
 *
 * Grandfathered bundles (.harness/config/skill-profile-waivers.json, D-6) stay in the fleet
 * graph (their names still resolve refs) but report no findings of their own.
 *
 * Run from repo root: node cli/src/harness/check-skill-fleet.mjs
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, basename, relative } from 'node:path';

const root = process.cwd();

function fleetDirs(baseDir = root) {
  const dirs = [join(baseDir, '.agents/skills')];
  const mods = join(baseDir, '.agents/modules');
  if (existsSync(mods)) {
    for (const m of readdirSync(mods, { withFileTypes: true })) {
      const s = join(mods, m.name, 'skills');
      if (m.isDirectory() && existsSync(s)) dirs.push(s);
    }
  }
  const out = [];
  for (const d of dirs) {
    if (!existsSync(d)) continue;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory() && existsSync(join(d, e.name, 'SKILL.md'))) {
        out.push(join(d, e.name));
      }
    }
  }
  return out;
}

function unquote(v) {
  return (v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")) ? v.slice(1, -1) : v;
}

function parseBundle(dir) {
  const text = readFileSync(join(dir, 'SKILL.md'), 'utf8');
  const name = basename(dir);
  let description = '';
  if (text.startsWith('---\n')) {
    const end = text.indexOf('\n---\n', 4);
    const fm = text.slice(4, end > 0 ? end : 4).split('\n');
    for (let i = 0; i < fm.length; i += 1) {
      if (!fm[i].startsWith('description:')) continue;
      const rest = fm[i].slice('description:'.length).trim();
      if (rest === '>-' || rest === '>' || rest === '|-' || rest === '|') {
        const parts = [];
        for (let j = i + 1; j < fm.length; j += 1) {
          if (fm[j].startsWith('  ')) { if (fm[j].trim()) parts.push(fm[j].trim()); continue; }
          if (fm[j].trim() === '') continue;
          break;
        }
        description = parts.join(' ');
      } else description = unquote(rest);
      break;
    }
  }
  const hm = text.match(/^## Handoff & Convergence\s*\n([\s\S]*?)(?=^## |\s*$)/m);
  const handoff = hm ? hm[1] : '';
  const forwardMatches = [...handoff.matchAll(/\bskill:\s*`?([a-z0-9-]+)`?/g)];
  // Unconditional routes form the DAG; conditional ones still legitimize SL-307
  // redirects (the target exists whenever the conditional route can be offered).
  const forwardAll = forwardMatches.map((m) => m[1]);
  const forward = forwardMatches
    .filter((m) => !conditionalRef(handoff, m.index + m[0].length))
    .map((m) => m[1]);
  const redirect = [...handoff.matchAll(/\bredirect\s*(?:→|:)\s*`?([a-z0-9-]+)`?/g)]
    .map((m) => m[1])
    .filter((t) => t !== 'none');
  return { dir, name, description, text, handoff, forward, forwardAll, redirect };
}

function conditionalRef(text, idx) {
  // `skill: X (when present|when installed|if present)` — and the bare
  // `X, when present)` comma style — marks an optional module-provided
  // route: not a dangling ref when the module is absent.
  return /(when|if) (present|installed)/i.test(text.slice(idx, idx + 40));
}

function skillRefs(bundle) {
  // Declared route targets + sibling citations that must resolve (SL-302):
  //   `skill: X`, `redirect → X`, `skill `X``, `that is `X``, `use `X``, `load `X``
  const refs = new Set([...bundle.forward, ...bundle.redirect]);
  for (const m of bundle.text.matchAll(/(?:skill|use|load|that is)\s+`([a-z0-9]+(?:-[a-z0-9]+)+)`/g)) {
    if (!conditionalRef(bundle.text, m.index + m[0].length)) refs.add(m[1]);
  }
  for (const m of bundle.description.matchAll(/`([a-z0-9]+(?:-[a-z0-9]+)+)`/g)) {
    if (!conditionalRef(bundle.description, m.index + m[0].length)) refs.add(m[1]);
  }
  return refs;
}

function jaccard(a, b) {
  const tok = (s) => new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3));
  const A = tok(a), B = tok(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const w of A) if (B.has(w)) n += 1;
  return n / (A.size + B.size - n);
}

/** Grandfathered-bundle waiver set (D-6) from .harness/config/skill-profile-waivers.json. */
export function loadWaivers(baseDir = root) {
  const p = join(baseDir, '.harness/config/skill-profile-waivers.json');
  if (!existsSync(p)) return new Set();
  try {
    const doc = JSON.parse(readFileSync(p, 'utf8'));
    return new Set(Array.isArray(doc.waived) ? doc.waived : []);
  } catch {
    return new Set();
  }
}

export function lintFleet(baseDir = root) {
  const waivers = loadWaivers(baseDir);
  const bundles = fleetDirs(baseDir).map((d) => ({ ...parseBundle(d), waived: waivers.has(relative(baseDir, d)) }));
  const names = new Set(bundles.map((b) => b.name));
  const errors = [];
  const warnings = [];
  const err = (rule, b, msg) => { if (!b.waived) errors.push({ rule, msg }); };
  const warn = (rule, msg) => warnings.push({ rule, msg });

  // SL-101 — fleet promotion of S-014
  for (const b of bundles) {
    if (!/Do NOT use/i.test(b.description)) err('SL-101', b, `${b.name}: description lacks the \`Do NOT use\` negative boundary`);
  }

  // SL-302 — dangling skill references
  for (const b of bundles) {
    for (const r of skillRefs(b)) {
      if (!names.has(r)) err('SL-302', b, `${b.name}: references unknown skill \`${r}\``);
    }
  }

  // SL-301 — cycles over forward edges; SL-307 — illegal redirects
  const byName = new Map(bundles.map((b) => [b.name, b]));
  const adj = new Map(bundles.map((b) => [b.name, b.forward.filter((f) => names.has(f))]));
  const state = new Map();
  const stack = [];
  function dfs(n) {
    state.set(n, 1); stack.push(n);
    for (const m of adj.get(n) || []) {
      if (state.get(m) === 1) {
        const cycle = [...stack.slice(stack.indexOf(m)), m];
        if (cycle.some((x) => !byName.get(x)?.waived)) errors.push({ rule: 'SL-301', msg: `handoff cycle: ${cycle.join(' → ')}` });
      } else if (!state.has(m)) dfs(m);
    }
    stack.pop(); state.set(n, 2);
  }
  for (const n of names) if (!state.has(n)) dfs(n);

  for (const b of bundles) {
    for (const r of b.redirect) {
      if (names.has(r)) {
        const target = bundles.find((x) => x.name === r);
        const back = target && target.forwardAll.includes(b.name);
        if (!back) err('SL-307', b, `${b.name}: redirect → ${r} is illegal — no forward edge ${r} → ${b.name}`);
      }
    }
  }

  // SL-105 — identical >=5-line normalized blocks across bundles
  const blockSeen = new Map();
  for (const b of bundles) {
    const lines = b.text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !l.startsWith('---') && !l.startsWith('|'));
    for (let i = 0; i + 5 <= lines.length; i += 1) {
      const key = lines.slice(i, i + 5).join('\n');
      const prev = blockSeen.get(key);
      if (prev && prev !== b.name) err('SL-105', b, `${b.name}: >=5-line block duplicated from ${prev}: "${lines[i].slice(0, 60)}..."`);
      else if (!prev) blockSeen.set(key, b.name);
    }
  }

  // SL-102 — adjacent pairs lacking bilateral cross-exclusion (Jaccard fallback, warning)
  const TAU = 0.30;
  const pos = (d) => d.split(/Do NOT use/i)[0];
  for (let i = 0; i < bundles.length; i += 1) {
    for (let j = i + 1; j < bundles.length; j += 1) {
      const a = bundles[i], b = bundles[j];
      if (a.waived || b.waived) continue;
      const sim = jaccard(pos(a.description), pos(b.description));
      if (sim >= TAU) {
        const locks = a.description.includes(b.name) && b.description.includes(a.name);
        if (!locks) warn('SL-102', `${a.name} ~ ${b.name}: trigger similarity ${sim.toFixed(2)} without bilateral cross-exclusion (judged-class candidate)`);
      }
    }
  }

  return { bundles: bundles.length, waived: bundles.filter((b) => b.waived).length, errors, warnings };
}

export { fleetDirs };

if (process.argv[1] && process.argv[1].endsWith('check-skill-fleet.mjs')) {
  const { bundles, errors, warnings } = lintFleet();
  for (const w of warnings) console.error(`WARN  ${w.rule} ${w.msg}`);
  for (const e of errors) console.error(`FAIL  ${e.rule} ${e.msg}`);
  if (errors.length) { console.error(`FAIL  skill fleet: ${errors.length} error(s), ${warnings.length} warning(s) across ${bundles} bundle(s)`); process.exit(1); }
  console.log(`PASS  skill fleet (${bundles} bundles, ${warnings.length} warning(s))`);
}
