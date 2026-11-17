#!/usr/bin/env node
/**
 * asdd gate-decide — append a Tech Lead override session for a WARN gate (ui-gate-decisions / G19).
 * Usage: asdd gate-decide <slice-id> --phase <phase> --note "<text>"
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * @param {string} root
 * @returns {string}
 */
export function resolveDecidedBy(root) {
  const env = process.env.HARNESS_AUTHOR?.trim();
  if (env) return env;
  const r = spawnSync('git', ['config', 'user.name'], { cwd: root, encoding: 'utf8' });
  if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  return 'local';
}

function parseArgs(argv) {
  const out = { sliceId: null, phase: null, note: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--phase' && argv[i + 1]) out.phase = argv[++i];
    else if (a.startsWith('--phase=')) out.phase = a.slice('--phase='.length);
    else if (a === '--note' && argv[i + 1]) out.note = argv[++i];
    else if (a.startsWith('--note=')) out.note = a.slice('--note='.length);
    else if (!a.startsWith('-') && !out.sliceId) out.sliceId = a;
  }
  return out;
}

function nextSessionName(sessionsDir, phase) {
  const files = existsSync(sessionsDir) ? readdirSync(sessionsDir).filter((f) => f.endsWith('.json')) : [];
  let max = 0;
  for (const f of files) {
    const n = Number(f.match(/^(\d+)/)?.[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  const num = String(max + 1).padStart(3, '0');
  return `${num}-override-${phase}.json`;
}

/**
 * @param {{ root: string, sliceId: string, phase: string, note: string, author?: string, sync?: boolean }} opts
 */
export function runGateDecide(opts) {
  const root = opts.root;
  const sliceId = opts.sliceId;
  const phase = opts.phase;
  const note = String(opts.note ?? '').trim();
  const author = opts.author ?? resolveDecidedBy(root);
  const doSync = opts.sync !== false;

  if (!sliceId || !/^[a-z0-9_-]+$/.test(sliceId)) {
    return { ok: false, error: 'invalid slice-id', decided_by: author };
  }
  if (!phase || !/^[a-z0-9_-]+$/.test(phase)) {
    return { ok: false, error: 'invalid --phase', decided_by: author };
  }
  if (!note) {
    return { ok: false, error: 'mandatory --note required', decided_by: author };
  }

  const sliceDir = join(root, '.harness/state/slices', sliceId);
  const sessionsDir = join(sliceDir, 'sessions');
  const manifestPath = join(sliceDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    return { ok: false, error: `slice not found: ${sliceId}`, decided_by: author };
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    return { ok: false, error: 'unreadable manifest', decided_by: author };
  }
  const gate = manifest.gates?.[phase];
  if (!gate || gate.status !== 'WARN') {
    return { ok: false, error: `no pending WARN gate for ${sliceId}/${phase}`, decided_by: author };
  }
  if (gate.acknowledged_by) {
    return { ok: false, error: `gate already acknowledged by ${gate.acknowledged_by}`, decided_by: author };
  }

  mkdirSync(sessionsDir, { recursive: true });
  const now = new Date().toISOString();
  const fileName = nextSessionName(sessionsDir, phase);
  const session = {
    schema_version: '1.0',
    session_id: `sess-${sliceId}-${fileName.slice(0, 3)}`,
    timestamp: now,
    agent: 'human',
    human: author,
    slice_id: sliceId,
    event_type: 'override',
    phase,
    note,
    evidence: `gate-decide by ${author}`,
    concerns: [],
  };
  writeFileSync(join(sessionsDir, fileName), `${JSON.stringify(session, null, 2)}\n`);

  let syncOutput = '';
  if (doSync) {
    const bin = join(dirname(fileURLToPath(import.meta.url)), '../../bin/asdd.mjs');
    const r = spawnSync(process.execPath, [bin, 'sync', '--slice', sliceId], {
      cwd: root,
      encoding: 'utf8',
      env: process.env,
    });
    syncOutput = `${r.stdout || ''}${r.stderr || ''}`;
    if (r.status !== 0) {
      return {
        ok: false,
        error: `session written but sync failed (exit ${r.status})`,
        output: syncOutput,
        session_file: fileName,
        decided_by: author,
      };
    }
  }

  return {
    ok: true,
    slice_id: sliceId,
    phase,
    decided_by: author,
    session_file: fileName,
    output: syncOutput,
  };
}

async function main(argv) {
  const { sliceId, phase, note } = parseArgs(argv);
  if (!sliceId || !phase) {
    console.error('Usage: asdd gate-decide <slice-id> --phase <phase> --note "<text>"');
    process.exit(2);
  }
  const result = runGateDecide({ root: process.cwd(), sliceId, phase, note });
  if (!result.ok) {
    console.error(`FAIL  ${result.error}`);
    if (result.output) process.stderr.write(result.output);
    process.exit(1);
  }
  console.log(
    `OK  override ${result.slice_id}/${result.phase} by ${result.decided_by} → ${result.session_file}`,
  );
  if (result.output) process.stdout.write(result.output);
}

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err?.message || err);
    process.exit(1);
  });
}
