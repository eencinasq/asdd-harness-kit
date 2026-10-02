#!/usr/bin/env node
/**
 * harness-status.mjs — compact project health dashboard (v3.0).
 * Reads generated registry.json and per-slice manifests.
 * Usage: node .harness/scripts/harness-status.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function readJson(rel) {
  const p = join(root, rel);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 16).replace('T', ' ');
}

function pad(s, w) {
  return String(s).padEnd(w);
}

const registry = readJson('.harness/state/registry.json');
const slices = Array.isArray(registry?.slices) ? registry.slices : [];

console.log('');
console.log('== Active Slices ==');
if (slices.length === 0) {
  console.log('  (none)');
} else {
  console.log(`  ${pad('Slice', 18)} ${pad('Phase', 16)} ${pad('Status', 12)} ${pad('Features', 10)} Dissents`);
  for (const s of slices) {
    const dissents = s.open_dissents ? `${s.open_dissents}` : '—';
    console.log(`  ${pad(s.slice_id, 18)} ${pad(s.phase || '—', 16)} ${pad(s.status || '—', 12)} ${pad(String(s.active_features || 0), 10)} ${dissents}`);
  }
}

console.log('');
console.log('== Active Work (derived from sessions) ==');
let anyActive = false;
for (const s of slices) {
  const manifest = readJson(`.harness/state/slices/${s.slice_id}/manifest.json`);
  const active = manifest?.active_features || [];
  if (active.length === 0) continue;
  anyActive = true;
  console.log(`  [${s.slice_id}]`);
  for (const f of active) {
    const handoff = f.handoff_from ? ` (from ${f.handoff_from})` : '';
    console.log(`    • ${f.id} @${f.human || f.owner}${handoff}`);
  }
}
if (!anyActive) console.log('  (none)');

console.log('');
console.log('== Contributors ==');
for (const s of slices) {
  const manifest = readJson(`.harness/state/slices/${s.slice_id}/manifest.json`);
  const contributors = manifest?.contributors || [];
  if (contributors.length === 0) continue;
  console.log(`  [${s.slice_id}] ${contributors.join(', ')}`);
}

console.log('');
console.log('== Gate Summary ==');
for (const s of slices) {
  const manifest = readJson(`.harness/state/slices/${s.slice_id}/manifest.json`);
  const gates = manifest?.gates || {};
  const gateStr = Object.entries(gates)
    .map(([phase, g]) => `${phase}:${g.status}`)
    .join(' ');
  if (gateStr) {
    console.log(`  [${s.slice_id}] ${gateStr}`);
  }
}

console.log('');
