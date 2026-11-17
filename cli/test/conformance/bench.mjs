#!/usr/bin/env node
/**
 * bench.mjs — platform v0 §5 evidence producer. Measures cold-start + p50/p95
 * wall time for hook-class invocations of the Node reference executor and
 * minimal Go/Rust/C++ spike binaries on the local machine. Output is an
 * evidence JSON — measurements, never language decisions (Q-R7 is human's).
 *
 *   node cli/test/conformance/bench.mjs [--reps 30] [--json]
 *
 * Spike binaries are intentionally minimal (parse stdin, print a verdict) —
 * they bound the *interpreter-vs-native cold-start* delta; they do NOT
 * emulate gate semantics. Estimates are labeled; measured numbers are not.
 */
import { spawnSync, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir, platform, arch, cpus, totalmem } from 'node:os';
import { fileURLToPath } from 'node:url';

const KIT = fileURLToPath(new URL('../../..', import.meta.url));
const ASDD = join(KIT, 'cli/bin/asdd.mjs');
const reps = Number(process.argv[process.argv.indexOf('--reps') + 1] || 25);
const GATE_STDIN = '{"command":"npm test"}';
const dir = mkdtempSync(join(tmpdir(), 'asdd-bench-'));

const SPIKES = {
  go: { src: 'main.go', code: `package main
import ("fmt";"io";"os")
func main(){ b,_:=io.ReadAll(os.Stdin); _=b; fmt.Print("{\\"permission\\":\\"allow\\"}") }
`, bin: 'spike-go', build: (s, b) => `go build -o ${b} ${s}` },
  rust: { src: 'main.rs', code: `use std::io::Read;
fn main(){ let mut s=String::new(); std::io::stdin().read_to_string(&mut s).ok(); print!("{{\\"permission\\":\\"allow\\"}}"); }
`, bin: 'spike-rust', build: (s, b) => `rustc -O -o ${b} ${s}` },
  cpp: { src: 'main.cpp', code: `#include <iostream>
#include <sstream>
int main(){ std::stringstream b; b<<std::cin.rdbuf(); std::cout<<"{\\"permission\\":\\"allow\\"}"; return 0; }
`, bin: 'spike-cpp', build: (s, b) => `clang++ -O2 -o ${b} ${s}` },
};

const measure = (cmd, args, { stdin = null, cwd = dir, warm = false } = {}) => {
  const ts = [];
  if (warm) spawnSync(cmd, args, { cwd, input: stdin, encoding: 'utf8' }); // prime
  for (let i = 0; i < reps; i++) {
    const t0 = performance.now();
    spawnSync(cmd, args, { cwd, input: stdin, encoding: 'utf8' });
    ts.push(performance.now() - t0);
  }
  ts.sort((a, b) => a - b);
  return { min_ms: +ts[0].toFixed(2), p50_ms: +ts[Math.floor(ts.length / 2)].toFixed(2), p95_ms: +ts[Math.floor(ts.length * 0.95) - 1].toFixed(2), n: ts.length };
};

const results = [];
// Node reference: real gate invocation (full boot + hook contract) + --version baseline.
results.push({ target: 'asdd gate (hook payload)', impl: 'node-reference', ...measure(process.execPath, [ASDD, 'gate'], { stdin: GATE_STDIN }), note: 'full consumer gate path — the latency hooks pay' });
results.push({ target: 'asdd --version', impl: 'node-reference', ...measure(process.execPath, [ASDD, '--version']), note: 'boot floor — NOT a gate benchmark' });
results.push({ target: 'asdd verify (hook payload)', impl: 'node-reference', ...measure(process.execPath, [ASDD, 'verify'], { stdin: '{"status":"completed","loop_count":0}' }), note: 'stop-hook path' });

for (const [lang, s] of Object.entries(SPIKES)) {
  const src = join(dir, s.src), bin = join(dir, s.bin);
  writeFileSync(src, s.code);
  const b = spawnSync('sh', ['-c', s.build(src, bin)], { encoding: 'utf8' });
  if (b.status !== 0 || !existsSync(bin)) {
    results.push({ target: `spike gate-payload (${lang})`, impl: lang, skipped: `build failed: ${(b.stderr || '').slice(0, 120)}` });
    continue;
  }
  results.push({ target: `spike gate-payload (${lang})`, impl: lang, ...measure(bin, [], { stdin: GATE_STDIN }), note: 'minimal binary — bounds interpreter-vs-native cold-start, not gate semantics' });
}

const node = results.find((r) => r.impl === 'node-reference' && r.target.includes('gate'));
const evidence = {
  schema_version: '1.0',
  generated_at: new Date().toISOString(),
  hardware: { os: `${platform()} ${arch}`, cpu: cpus()[0]?.model ?? 'unknown', cores: cpus().length, mem_gb: Math.round(totalmem() / 2 ** 30), node: process.version },
  method: { reps, measure: 'spawnSync wall time, same stdin payload per target', caveat: 'spikes bound cold-start delta only — they carry no ASDD semantics; projections are labeled estimates' },
  hook_budget_ms: 15,
  results,
  verdict: {
    node_gate_p95_ms: node?.p95_ms ?? null,
    native_gate_p95_ms: Math.min(...results.filter((r) => r.p95_ms && r.impl !== 'node-reference').map((r) => r.p95_ms), Infinity) || null,
    note: 'a native executor at parity removes the interpreter boot on every fail-closed hook invocation',
  },
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(evidence, null, 2));
} else {
  console.log(`BENCH ${evidence.hardware.os} · ${evidence.hardware.cpu} · reps=${reps}`);
  for (const r of results) {
    if (r.skipped) { console.log(`  ${r.impl.padEnd(14)} SKIPPED ${r.skipped}`); continue; }
    console.log(`  ${r.impl.padEnd(14)} ${r.target.padEnd(36)} p50 ${String(r.p50_ms).padStart(8)} ms · p95 ${String(r.p95_ms).padStart(8)} ms · min ${r.min_ms}`);
  }
  console.log(`  budget ${evidence.hook_budget_ms} ms (proposed) — node gate p95 ${evidence.verdict.node_gate_p95_ms} ms vs best spike p95 ${evidence.verdict.native_gate_p95_ms} ms`);
}
