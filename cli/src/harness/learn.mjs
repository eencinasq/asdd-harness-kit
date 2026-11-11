#!/usr/bin/env node
/**
 * learn.mjs — the self-improving harness loop (QG-LEARN-*).
 *
 *   asdd learn                 # derive patterns, write patterns.json, print open ones
 *   asdd learn --all           # print every pattern, including watching/verified
 *   asdd learn --json          # print patterns.json content
 *   asdd learn --summary       # print only the summary as JSON (used by sync-state)
 *   asdd learn --signatures    # failure-log signatures in use, to reuse verbatim
 *   asdd learn --export [--out <file>]  # lessons on kit-owned controls, for an upstream issue
 *
 * Every run first folds local raw signals into this author's weekly summary
 * (compactSignals); set HARNESS_AUTHOR to name the author (CI: `ci`).
 *   asdd learn --propose LP-…  # scaffold docs/knowledge-base/steering-proposals/SP-NNN.md
 *
 * sync-state.mjs runs the derive step after every state sync. Agents never set a
 * proposal past `proposed`; the Tech Lead records accepted/rejected/applied.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PATTERNS_FILE,
  PROPOSALS_DIR,
  PROPOSAL_TEMPLATE,
  KIT_REPO,
  compactSignals,
  exportLessons,
  failureSignatures,
  nextProposalId,
  writePatterns,
} from './learning-lib.mjs';

const root = process.cwd();
const argv = process.argv.slice(2);

if (argv.includes('-h') || argv.includes('--help')) {
  console.log('Usage: asdd learn [--all | --json | --summary | --signatures | --export [--out <file>] | --propose <LP-id>]');
  process.exit(0);
}

if (argv.includes('--signatures')) {
  const sigs = failureSignatures(root);
  if (!sigs.length) console.log('(no signed failure-log entries yet)');
  for (const s of sigs) console.log(`  ×${String(s.entries).padEnd(3)} ${s.signature}`);
  process.exit(0);
}

const compacted = compactSignals(root);
const data = writePatterns(root);
data.summary.compacted = compacted.compacted;

if (argv.includes('--summary')) {
  console.log(JSON.stringify(data.summary));
  process.exit(0);
}

if (argv.includes('--export')) {
  const { lessons, markdown } = exportLessons(root);
  const outIdx = argv.indexOf('--out');
  const out = outIdx >= 0 ? argv[outIdx + 1] : null;
  if (!out) {
    process.stdout.write(markdown);
    process.exit(0);
  }
  writeFileSync(join(root, out), markdown);
  console.log(`wrote ${lessons.length} lesson(s) to ${out}`);
  // Never sent automatically: review the file, then open the issue yourself.
  if (lessons.length) console.log(`review it, then: gh issue create --repo ${KIT_REPO} --title "Harness lessons" --body-file ${out}`);
  process.exit(0);
}

const proposeIdx = argv.indexOf('--propose');
if (proposeIdx >= 0) {
  const id = argv[proposeIdx + 1];
  const pattern = data.patterns.find((p) => p.id === id);
  if (!pattern) {
    console.error(`pattern ${id ?? '(missing)'} not found — run learn.mjs --all to list pattern IDs`);
    process.exit(1);
  }
  const templatePath = join(root, PROPOSAL_TEMPLATE);
  if (!existsSync(templatePath)) {
    console.error(`missing template ${PROPOSAL_TEMPLATE}`);
    process.exit(1);
  }
  const spId = nextProposalId(root);
  const change = pattern.kind === 'noise' ? 'loosen-sensor' : 'add-guide';
  const evidence = pattern.examples.map((e) => `- ${e}`).join('\n');
  const text = readFileSync(templatePath, 'utf8')
    .replaceAll('{{id}}', spId)
    .replaceAll('{{pattern}}', pattern.id)
    .replaceAll('{{signature}}', pattern.signature)
    .replaceAll('{{kind}}', pattern.kind)
    .replaceAll('{{change}}', change)
    .replaceAll('{{occurrences}}', String(pattern.occurrences))
    .replaceAll('{{slices}}', pattern.slices.join(', ') || '—')
    .replaceAll('{{evidence}}', evidence || '- (none recorded)');
  const rel = `${PROPOSALS_DIR}/${spId}.md`;
  mkdirSync(join(root, PROPOSALS_DIR), { recursive: true });
  writeFileSync(join(root, rel), text, { flag: 'wx' });
  console.log(`created ${rel} for ${pattern.id} (${pattern.signature}) — fill control, change, and success, then ask the Tech Lead to decide`);
  process.exit(0);
}

if (argv.includes('--json')) {
  console.log(JSON.stringify(data, null, 2));
  process.exit(0);
}

const shown = argv.includes('--all') ? data.patterns : data.patterns.filter((p) => p.status === 'open' || p.proposals.some((x) => x.status === 'ineffective'));
const s = data.summary;
console.log(`learning → ${s.patterns} patterns: ${s.open} open, ${s.in_flight} in flight, ${s.verified} verified (${PATTERNS_FILE})`);
if (compacted.compacted) console.log(`compacted ${compacted.compacted} local signal file(s) into ${compacted.summaries.join(', ')}`);
if (s.unsigned_failures) console.log(`note: ${s.unsigned_failures} failure-log entr${s.unsigned_failures === 1 ? 'y has' : 'ies have'} no **Signature:** line and cannot be counted`);
for (const p of shown) {
  const props = p.proposals.length ? ` [${p.proposals.map((x) => `${x.id}:${x.status}`).join(', ')}]` : '';
  const reopened = p.reopened ? ' (reopened: applied change did not stop it)' : '';
  console.log(`  ${p.id}  ${p.status.padEnd(11)} ${p.kind.padEnd(6)} ×${p.occurrences}  ${p.signature}${props}${reopened}`);
}
if (!shown.length) console.log('  (no open patterns)');
const open = data.patterns.filter((p) => p.status === 'open');
if (open.length) console.log(`next: asdd learn --propose ${open[0].id}`);
