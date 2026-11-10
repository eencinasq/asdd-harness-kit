#!/usr/bin/env node
/**
 * Skill profile linter (G-6). Mechanical port of the ratified kit skill
 * profile (.agents/skills/capability-authoring/references/skill-profile.md).
 * Checks a bundle's SKILL.md + asset dirs against the adopted grammar.
 *
 * Run from repo root (kit or consumer; the harness `check` skills validator runs it):
 *   node cli/src/harness/check-skill-profile.mjs              # lint every bundle
 *   node cli/src/harness/check-skill-profile.mjs <dir> [...]  # lint specific bundle dirs
 *
 * Findings print `FAIL  <bundle>: <RULE-ID> <message>`; any finding exits 1.
 * Rule IDs are the profile's S-* where cited, else P-* (profile grammar slot).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const INLINE_CAP_BYTES = 20 * 1024;      // S-008 inline
const PKG_CAP_BYTES = 15 * 1024;         // S-008 packaged SKILL.md
const PKG_CAP_LINES = 500;               // S-008 packaged
const ASSET_DIRS = ['resources', 'references', 'examples', 'scripts'];
const BLOOM_RE = /\[C[1-6][^\]]*×[^\]]*\]/;

function unquote(v) {
  return (v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))
    ? v.slice(1, -1) : v;
}

/** Returns { name, description, tier, hasVersion, body } or { error }. */
export function parseSkill(text) {
  if (!text.startsWith('---\n')) return { error: 'missing frontmatter' };
  const endFm = text.indexOf('\n---\n', 4);
  if (endFm < 0) return { error: 'unterminated frontmatter' };
  const fm = text.slice(4, endFm);
  const body = text.slice(endFm + 5);
  const get = (key) => {
    const line = fm.split('\n').find((l) => l.trimStart().startsWith(`${key}:`));
    return line ? unquote(line.trimStart().slice(key.length + 1).trim()) : '';
  };
  let description = '';
  const lines = fm.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].startsWith('description:')) continue;
    const rest = lines[i].slice('description:'.length).trim();
    if (rest === '>-' || rest === '>' || rest === '|-' || rest === '|') {
      const parts = [];
      for (let j = i + 1; j < lines.length; j += 1) {
        if (lines[j].startsWith('  ')) { if (lines[j].trim()) parts.push(lines[j].trim()); continue; }
        if (lines[j].trim() === '') continue;
        break;
      }
      description = parts.join(' ');
    } else description = unquote(rest);
    break;
  }
  return {
    name: get('name'),
    description,
    tier: get('tier'),
    hasVersion: /^version:/m.test(fm),
    body,
  };
}

function section(body, title) {
  const part = body.split(/^## /m).find((p) => p.startsWith(title));
  return part === undefined ? null : part.slice(title.length);
}

/** Lint one bundle dir. Returns [{ rule, msg }]. */
export function lintBundle(dir) {
  const out = [];
  const fail = (rule, msg) => out.push({ rule, msg });
  const folder = basename(dir);
  const skillPath = join(dir, 'SKILL.md');
  if (!existsSync(skillPath)) return [{ rule: 'P-BUNDLE', msg: 'no SKILL.md' }];
  const text = readFileSync(skillPath, 'utf8');
  const s = parseSkill(text);
  if (s.error) return [{ rule: 'P-FM', msg: s.error }];

  // Frontmatter rules
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s.name)) fail('S-002', `name "${s.name}" is not kebab-case`);
  if (/^(skill-)|(-skill)$/.test(s.name)) fail('S-002', `name "${s.name}" uses a banned skill-/-skill affix`);
  if (s.name !== folder) fail('S-002', `name "${s.name}" must equal folder "${folder}"`);
  if (s.hasVersion) fail('P-VER', 'version field rejected — stamps live in versions.json');
  if (!s.description) fail('S-004', 'description is empty');
  if (s.description.length > 1024) fail('S-004', `description ${s.description.length} chars > 1024`);
  if (/^(i |we |you |your )/i.test(s.description)) fail('S-013', 'description must be third-person');
  if (!/Use when/i.test(s.description)) fail('S-003', 'description lacks the `Use when` positive trigger');
  if (!/Do NOT use/i.test(s.description)) fail('S-014', 'description lacks the `Do NOT use` negative boundary');
  if (s.tier && !['orchestrator', 'leaf'].includes(s.tier)) fail('S-022', `tier "${s.tier}" must be orchestrator|leaf`);

  const body = s.body;
  if (!/^# /m.test(body)) fail('P-TITLE', 'missing `# ` title heading');

  // S-020 operational boundary in the overview (before first step heading)
  const overview = body.split(/^#{2,4}\s+Step\b/m)[0];
  if (!/boundar|writes/i.test(overview)) fail('S-020', 'overview does not state the operational boundary');

  // S-017/D-4 every step heading carries one [Cn×Type] tag
  const stepHeads = body.match(/^#{2,4}\s+Step\b.*$/gm) || [];
  if (!stepHeads.length) fail('P-PROTO', 'no protocol step headings found');
  for (const h of stepHeads) if (!BLOOM_RE.test(h)) fail('S-017', `step lacks a Bloom tag: ${h.trim().slice(0, 80)}`);

  // Required sections
  if (section(body, 'Verification') === null) fail('S-016', 'missing `## Verification` gate');
  const esc = section(body, 'Escalation Gate');
  if (esc === null) fail('S-009', 'missing `## Escalation Gate`');
  else if (!/context/i.test(esc) || !/option/i.test(esc) || !/recommendation/i.test(esc) || !/decision/i.test(esc)) {
    fail('S-009', 'Escalation Gate lacks the Context → Options → Recommendation → Decision Needed format');
  }
  const hand = section(body, 'Handoff & Convergence');
  if (hand === null) fail('S-021', 'missing `## Handoff & Convergence`');
  else if (!/None \(terminal\)/.test(hand) && !/\b(skill|agent|human)\s*:/.test(hand)) {
    fail('S-021', 'must declare `None (terminal)` or a routed `skill:` | `agent:` | `human:` target');
  }

  // S-005/S-011 relative links only
  if (/\]\(\/|\]\(file:|\]\(~|file:\/\//.test(body)) fail('S-011', 'contains an absolute path or file:// link');

  // S-008 size caps: packaged = any asset dir present
  const packaged = ASSET_DIRS.some((d) => existsSync(join(dir, d)));
  const bytes = statSync(skillPath).size;
  const lines = text.split('\n').length;
  if (packaged) {
    if (lines > PKG_CAP_LINES) fail('S-008', `packaged SKILL.md ${lines} lines > ${PKG_CAP_LINES}`);
    if (bytes > PKG_CAP_BYTES) fail('S-008', `packaged SKILL.md ${bytes}B > ${PKG_CAP_BYTES}B`);
  } else if (bytes > INLINE_CAP_BYTES) {
    fail('S-008', `inline SKILL.md ${bytes}B > ${INLINE_CAP_BYTES}B`);
  }

  // S-018 scripts: shebang + executable
  const scriptsDir = join(dir, 'scripts');
  if (existsSync(scriptsDir)) {
    for (const f of readdirSync(scriptsDir)) {
      const p = join(scriptsDir, f);
      if (!statSync(p).isFile()) continue;
      if (!readFileSync(p, 'utf8').startsWith('#!')) fail('S-018', `scripts/${f}: missing shebang`);
      if (!(statSync(p).mode & 0o111)) fail('S-018', `scripts/${f}: not executable`);
    }
  }
  // S-019 resource templates carry <placeholders>
  const resDir = join(dir, 'resources');
  if (existsSync(resDir)) {
    for (const f of readdirSync(resDir)) {
      const p = join(resDir, f);
      if (!statSync(p).isFile() || !f.endsWith('.md')) continue;
      if (!/<[a-zA-Z][\w-]*>/.test(readFileSync(p, 'utf8'))) fail('S-019', `resources/${f}: no <placeholder> fields`);
    }
  }
  return out;
}

/** All bundle dirs under a repo root: baseline + module skill trees. */
export function bundleDirs(root) {
  const roots = [join(root, '.agents/skills')];
  const mods = join(root, '.agents/modules');
  if (existsSync(mods)) {
    for (const m of readdirSync(mods, { withFileTypes: true })) {
      const sd = join(mods, m.name, 'skills');
      if (m.isDirectory() && existsSync(sd)) roots.push(sd);
    }
  }
  const dirs = [];
  for (const r of roots) {
    if (!existsSync(r)) continue;
    for (const e of readdirSync(r, { withFileTypes: true })) {
      if (e.isDirectory() && existsSync(join(r, e.name, 'SKILL.md'))) dirs.push(join(r, e.name));
    }
  }
  return dirs.sort();
}

/** Grandfathered-bundle waiver set (D-6) from .harness/config/skill-profile-waivers.json. */
export function loadWaivers(root) {
  const p = join(root, '.harness/config/skill-profile-waivers.json');
  if (!existsSync(p)) return new Set();
  try {
    const doc = JSON.parse(readFileSync(p, 'utf8'));
    return new Set(Array.isArray(doc.waived) ? doc.waived : []);
  } catch {
    return new Set();
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const root = process.cwd();
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const dirs = args.length ? args : bundleDirs(root);
  if (!dirs.length) { console.error('FAIL  no skill bundles found'); process.exit(1); }
  const waivers = loadWaivers(root);
  let findings = 0;
  let skipped = 0;
  for (const d of dirs) {
    const rel = d.startsWith(root) ? d.slice(root.length + 1) : d;
    if (waivers.has(rel)) { skipped += 1; console.log(`SKIP  ${rel} (grandfathered waiver)`); continue; }
    for (const f of lintBundle(d)) {
      findings += 1;
      console.log(`FAIL  ${rel}: ${f.rule} ${f.msg}`);
    }
  }
  if (findings) { console.log(`FAIL  skill profile: ${findings} finding(s) across ${dirs.length} bundle(s)`); process.exit(1); }
  console.log(`PASS  skill profile (${dirs.length - skipped} linted, ${skipped} waived)`);
}
