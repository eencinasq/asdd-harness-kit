/**
 * Conformance runner (platform v0 §4-5): builds a fixture repo, runs the
 * declared invocation through the bound executor (default: the kit's asdd),
 * normalizes declared nondeterministic fields, and compares exit/output/
 * state effects. Language-neutral by construction — a native executor binds
 * the same fixtures against its own binary via --executor.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, appendFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const KIT = fileURLToPath(new URL('../../..', import.meta.url));
const ASDD = process.env.ASDD_EXECUTOR || join(KIT, 'cli/bin/asdd.mjs');

export function runAsdd(cwd, args, { stdin = null, env = {} } = {}) {
  return spawnSync(process.execPath, [ASDD, ...args], {
    cwd, encoding: 'utf8', timeout: 120000,
    env: { ...process.env, ...env },
    input: stdin ?? undefined,
  });
}

const NORMALIZERS = {
  timestamps: (s) => s.replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, '<TS>'),
  ids: (s) => s.replace(/\b[0-9a-f]{16,32}\b/g, '<ID>'),
  durations: (s) => s.replace(/"duration_ms"\s*:\s*\d+/g, '"duration_ms":<N>'),
  paths: (s) => s.replace(/\/[\w./-]+/g, '<PATH>'),
  bytes: (s) => s.replace(/\d+(\.\d+)?\s*(B|KB|MB|bytes)/g, '<BYTES>'),
};
const normalize = (s, names) => names.reduce((acc, n) => (NORMALIZERS[n] ?? ((x) => x))(acc), s);

export function runFixture(fixture, { keep = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'asdd-conformance-'));
  const log = [];
  for (const step of fixture.setup ?? []) {
    if (step.op === 'install') {
      const r = runAsdd(root, ['install', '.', ...(step.args ?? ['--no-interactive'])]);
      log.push(`install exit=${r.status}`);
      if (r.status !== 0) return { fixture, root, ok: false, step: 'install', log, detail: r.stderr?.slice(0, 400) };
    } else if (step.op === 'slice') {
      const r = runAsdd(root, ['slice', 'init', step.id]);
      log.push(`slice ${step.id} exit=${r.status}`);
    } else if (step.op === 'write') {
      const p = join(root, step.path);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, step.content);
    } else if (step.op === 'append') {
      const p = join(root, step.path);
      mkdirSync(dirname(p), { recursive: true });
      appendFileSync(p, step.content);
    }
  }
  const inv = fixture.invoke;
  const res = runAsdd(root, [inv.cmd, ...(inv.args ?? [])], { stdin: inv.stdin, env: inv.env ?? {} });
  const exp = fixture.expect ?? {};
  const names = fixture.normalize ?? [];
  const failures = [];

  if (exp.exit !== undefined && res.status !== exp.exit)
    failures.push(`exit ${res.status} !== ${exp.exit} (stderr: ${(res.stderr || '').slice(0, 300)})`);
  for (const needle of exp.stdout_contains ?? [])
    if (!res.stdout.includes(needle)) failures.push(`stdout missing ${JSON.stringify(needle)}`);
  if (exp.stdout_json) {
    try {
      const got = JSON.parse(normalize(res.stdout, names));
      for (const [k, v] of Object.entries(exp.stdout_json))
        if (JSON.stringify(got[k]) !== JSON.stringify(v)) failures.push(`stdout_json.${k}: ${JSON.stringify(got[k])} !== ${JSON.stringify(v)}`);
    } catch (e) { failures.push(`stdout not JSON: ${e.message} — ${res.stdout.slice(0, 200)}`); }
  }
  for (const [p, cond] of Object.entries(exp.files ?? {})) {
    const fp = join(root, p);
    if (cond.exists && !existsSync(fp)) failures.push(`file missing: ${p}`);
    if (cond.json) {
      try {
        const got = JSON.parse(readFileSync(fp, 'utf8'));
        for (const [k, v] of Object.entries(cond.json))
          if (JSON.stringify(got[k]) !== JSON.stringify(v)) failures.push(`${p}.${k} mismatch`);
      } catch { failures.push(`file not JSON: ${p}`); }
    }
  }
  if (exp.spans_tail) {
    const sf = join(root, '.harness/state/telemetry/spans.jsonl');
    const lines = existsSync(sf) ? readFileSync(sf, 'utf8').trim().split('\n') : [];
    if (!lines.length) failures.push('spans.jsonl empty');
    else {
      const last = JSON.parse(lines.at(-1));
      for (const [k, v] of Object.entries(exp.spans_tail))
        if (JSON.stringify(last[k]) !== JSON.stringify(v)) failures.push(`spans_tail.${k}: ${JSON.stringify(last[k])} !== ${JSON.stringify(v)}`);
    }
  }
  return { fixture, root, ok: failures.length === 0, failures, log, stdout: res.stdout.slice(0, 600), status: res.status };
}
