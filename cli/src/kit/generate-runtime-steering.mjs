#!/usr/bin/env node
/**
 * generate-runtime-steering.mjs — D-12: project runtime steering adapters from the
 * steering registry instead of hand-maintained file lists.
 *
 * Regenerates the marked sections of runtimes/cursor/asdd-steering.mdc:
 *
 *   <!-- steering-gen:always --> ... <!-- steering-gen:end -->  the always-file list
 *   <!-- steering-gen:table  --> ... <!-- steering-gen:end -->  the phase→file work table
 *
 * Both derive from .harness/config/steering.registry.json (kit block): `inclusion`
 * picks the always set; `tags`/`coverage` pick the phase rows. Generated cells list
 * auto files by tag — no row may mandate an auto file for "any work" (G-6).
 *
 *   node cli/src/kit/generate-runtime-steering.mjs          # write
 *   node cli/src/kit/generate-runtime-steering.mjs --check  # exit 1 if committed file is stale
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadSteeringRegistry, parseSteeringFrontmatter } from '../harness/validators/steering-tags.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const TARGET = join(ROOT, 'cli/runtimes/cursor/asdd-steering.mdc');
const MARK = (k) => [`<!-- steering-gen:${k} -->`, '<!-- steering-gen:end -->'];

/** kit entries that are JIT steering files on disk (skip contract-docs/templates). */
export function jitEntries(root = ROOT) {
  const reg = loadSteeringRegistry(root);
  const out = [];
  for (const [path, e] of Object.entries(reg?.entries ?? {})) {
    if (!path.startsWith('.harness/steering/') || !path.endsWith('.md')) continue;
    const abs = join(root, path);
    if (!existsSync(abs)) continue;
    const fm = parseSteeringFrontmatter(readFileSync(abs, 'utf8'));
    if (!fm?.inclusion) continue; // contract-doc / index without JIT frontmatter
    out.push({ name: path.split('/').pop(), inclusion: fm.inclusion, tags: fm.tags ?? [], cls: e.class });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function alwaysList(entries) {
  return entries.filter((e) => e.inclusion === 'always').map((e) => `\`${e.name.replace(/\.md$/, '')}\``).join(', ');
}

/** Phase rows: label → match key → auto files whose tags include it. */
const ROWS = [
  ['Discovery', ['discovery']],
  ['Spec, validation', ['spec', 'validation']],
  ['Domain', ['domain']],
  ['Design, tasks, implementation', ['design', 'task_planning', 'implementation']],
  ['QA, refactor', ['qa', 'refactor']],
  ['Knowledge', ['knowledge']],
];

function workTable(entries) {
  const auto = entries.filter((e) => e.inclusion === 'auto');
  const lines = [
    '| Work | Read (minimum) |',
    '|------|----------------|',
    '| Every turn | the always files above + auto files whose `tags` intersect the phase, `lite`, `review`, or `ui` keys (JIT rule; do not read untagged-for-phase autos) |',
  ];
  for (const [label, keys] of ROWS) {
    const names = auto.filter((e) => keys.some((k) => e.tags.includes(k))).map((e) => `\`${e.name}\``);
    if (names.length) lines.push(`| ${label} | + ${names.join(', ')} |`);
  }
  return lines.join('\n');
}

function splice(text, kind, body) {
  const [open, close] = MARK(kind);
  const i = text.indexOf(open);
  const j = text.indexOf(close, i + open.length);
  if (i < 0 || j < 0 || j < i) throw new Error(`markers ${open} … ${close} not found in ${TARGET}`);
  return `${text.slice(0, i)}${open}\n${body}\n${text.slice(j)}`;
}

export function render(entries) {
  let text = readFileSync(TARGET, 'utf8');
  text = splice(text, 'always', `(always files: ${alwaysList(entries)}; auto files by tag per \`.agents/agents/_runtime-template.md\`)`);
  text = splice(text, 'table', workTable(entries));
  return text;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const next = render(jitEntries());
  if (process.argv.includes('--check')) {
    const cur = readFileSync(TARGET, 'utf8');
    if (cur !== next) {
      console.error('FAIL  asdd-steering.mdc is stale — run scripts/generate-runtime-steering.mjs');
      process.exit(1);
    }
    console.log('PASS  runtime steering projection is current');
  } else {
    writeFileSync(TARGET, next);
    console.log('WROTE  cli/runtimes/cursor/asdd-steering.mdc (registry-derived)');
  }
}
