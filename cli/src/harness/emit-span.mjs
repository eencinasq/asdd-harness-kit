#!/usr/bin/env node
/**
 * `asdd span` — the agent dispatch seam for telemetry (profiling v2 D-8).
 *
 * Reads one span object (JSON) from stdin, fills ids/timestamps via mintSpan
 * (env correlation from HARNESS_TRACE_ID/HARNESS_SPAN_ID), and appends it to
 * .harness/state/telemetry/spans.jsonl. Fail-open: always exits 0 — a broken
 * profiler degrades to silence, never to a slice failure.
 *
 *   echo '{"kind":"turn",...}' | asdd span
 */
import { readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { emit, mintSpan } from './telemetry-lib.mjs';

/** A hook: no arguments, and no import of the argument parser (it must answer whatever else is broken). */
export async function run() {
  let raw = '';
  try {
    raw = readFileSync(0, 'utf8');
  } catch {
    process.exit(0);
  }
  let span;
  try {
    span = JSON.parse(raw);
  } catch {
    process.exit(0);
  }
  if (!span.writer) span.writer = 'asdd-span';
  const minted = mintSpan(span, { env: process.env });
  if (emit(minted, { root: process.cwd() })) {
    process.stdout.write(`SPAN ${minted.span_id}\n`);
  }
  return 0;
}

const isEntry = () => {
  try {
    return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
};
if (isEntry()) process.exitCode = (await run()) ?? process.exitCode;
