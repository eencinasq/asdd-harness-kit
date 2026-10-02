#!/usr/bin/env node
/**
 * harness-status.mjs — compact project health dashboard.
 * Usage: node .harness/scripts/harness-status.mjs
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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

function ageHours(iso) {
  if (!iso) return Infinity;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return Infinity;
  return (Date.now() - d.getTime()) / 36e5;
}

function pad(s, w) {
  return String(s).padEnd(w);
}

const manifest = readJson('.harness/state/manifest.json');
const slices = Array.isArray(manifest?.active_slices) ? manifest.active_slices : [];

console.log('');
console.log('== Active Slices ==');
if (slices.length === 0) {
  console.log('  (none)');
} else {
  console.log(`  ${pad('Slice', 18)} ${pad('Phase', 16)} ${pad('Status', 12)} Features`);
  for (const s of slices) {
    let featCount = 0;
    let inProg = 0;
    const featPath = s.features || `.harness/features/${s.slice_id}.features.json`;
    if (existsSync(join(root, featPath))) {
      const fd = readJson(featPath);
      const list = Array.isArray(fd?.features) ? fd.features : [];
      featCount = list.length;
      inProg = list.filter((f) => f.status === 'in_progress').length;
    }
    const featStr = featCount ? `${featCount} (${inProg} in_progress)` : '—';
    console.log(`  ${pad(s.slice_id, 18)} ${pad(s.phase || '—', 16)} ${pad(s.status || '—', 12)} ${featStr}`);
  }
}

console.log('');
console.log('== Locks ==');
const locksDir = join(root, '.harness/state/locks');
if (!existsSync(locksDir)) {
  console.log('  (no locks directory)');
} else {
  const files = readdirSync(locksDir).filter((n) => n.endsWith('.lock'));
  if (files.length === 0) {
    console.log('  (none held)');
  } else {
    console.log(`  ${pad('Lock', 22)} ${pad('Agent', 16)} ${pad('Started', 18)} Stale?`);
    for (const name of files) {
      const lock = readJson(`.harness/state/locks/${name}`);
      const sliceId = lock?.slice || name.replace('.lock', '');
      const slice = slices.find((s) => s.slice_id === sliceId);
      const stale = slice?.status === 'DONE' ? 'YES (slice DONE)' : ageHours(lock?.started) > 24 ? 'YES (>24h)' : 'no';
      console.log(`  ${pad(name, 22)} ${pad(lock?.agent || '—', 16)} ${pad(fmtDate(lock?.started), 18)} ${stale}`);
    }
  }
}

console.log('');
console.log('== Features (in_progress) ==');
let anyInProgress = false;
for (const s of slices) {
  const featPath = s.features || `.harness/features/${s.slice_id}.features.json`;
  if (!existsSync(join(root, featPath))) continue;
  const fd = readJson(featPath);
  const active = (fd?.features || []).filter((f) => f.status === 'in_progress');
  if (active.length) {
    anyInProgress = true;
    console.log(`  [${s.slice_id}]`);
    for (const f of active) {
      const owner = f.owner ? ` @${f.owner}` : '';
      console.log(`    • ${f.id}${owner}: ${f.title}`);
    }
  }
}
if (!anyInProgress) console.log('  (none)');

console.log('');
