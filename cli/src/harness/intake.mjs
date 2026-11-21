#!/usr/bin/env node
/**
 * asdd intake — import a tracker Intent item as a slice (slice intent-intake, P6.4).
 *
 * The engineer's agent reads the Intent item with the tracker MCP and saves its body; this command validates it against
 * cli/skills/external-trackers/references/intent-format.md, re-checks its grounding refs against the current code,
 * writes `.harness/specs/<slice>/intent.md`, and initializes the slice in the item's `mode` with a `source` block on the
 * `001` session. Offline: it reads a local file or stdin, never the network.
 *
 * Usage: asdd intake --from <file|-> --ref <item-url> [--accept-stale] [--dry-run] [--json]
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseIntentItem, renderIntentMd, sessionSource, staleRefs, validateIntentItem } from './intake-lib.mjs';
import { parseCommand, runMain } from './commands.mjs';

export async function run(argv = process.argv.slice(2)) {
  const root = process.cwd();
  const { values } = parseCommand('intake', argv);
  const flag = (name) => Boolean(values[name.slice(2)]);
  const value = (name) => values[name.slice(2)];
  const asJson = flag('--json');
  const USAGE = 'Usage: asdd intake --from <file|-> --ref <item-url> [--accept-stale] [--dry-run] [--json]';

  function stop(lines, code = 1) {
    if (asJson) process.stdout.write(`${JSON.stringify({ ok: false, errors: lines }, null, 2)}\n`);
    for (const l of lines) console.error(`FAIL  ${l}`);
    process.exit(code);
  }

  const from = value('--from');
  const ref = value('--ref');
  if (!from || !ref) stop([USAGE], 2);
  if (from !== '-' && (/^[a-z][a-z0-9+.-]*:\/\//i.test(from) || !existsSync(from))) {
    stop([`--from must be a local file or "-" (stdin); got ${from}`], 2);
  }

  const text = from === '-' ? readFileSync(0, 'utf8') : readFileSync(from, 'utf8');
  const parsed = parseIntentItem(text);
  const { errors, warnings } = validateIntentItem(parsed);
  for (const w of warnings) if (!asJson) console.error(`WARN  ${w}`);
  if (errors.length) stop(errors);

  const sliceId = parsed.block.slice_id;
  // The slice index is the generated registry.json (global state/manifest.json retired — RV1-AR-1); it may be absent on a
  // fresh clone, so the slice dirs and specs are checked too.
  const stateDir = join(root, '.harness/state');
  if (!existsSync(stateDir)) stop(['no harness here: .harness/state is missing (run asdd install)']);
  let registered = [];
  try {
    registered = JSON.parse(readFileSync(join(stateDir, 'registry.json'), 'utf8')).slices ?? [];
  } catch {
    registered = [];
  }
  if (
    existsSync(join(stateDir, 'slices', sliceId)) ||
    existsSync(join(root, '.harness/specs', sliceId, 'intent.md')) ||
    registered.some((s) => (typeof s === 'string' ? s : s?.slice_id) === sliceId)
  ) {
    stop([`slice "${sliceId}" already exists; an Intent item is imported once (amend the slice instead)`]);
  }

  const stale = staleRefs(root, parsed.grounding);
  if (stale.length && !flag('--accept-stale')) {
    stop([
      `stale grounding refs (the code moved since shaping): ${stale.map((s) => `row ${s.row} ${s.ref}`).join(', ')}`,
      'ask the PO/PM to re-ground the Intent item, or re-run with --accept-stale to record them in ## Source',
    ]);
  }

  let trackerType;
  try {
    trackerType = JSON.parse(readFileSync(join(root, '.harness/config/project.json'), 'utf8')).tracker?.type;
  } catch {
    trackerType = undefined;
  }
  const source = sessionSource(parsed, { ref, trackerType });
  const intentRel = `.harness/specs/${sliceId}/intent.md`;
  const plan = { ok: true, slice_id: sliceId, mode: parsed.block.mode, intent: intentRel, source, stale, warnings };

  if (flag('--dry-run')) {
    if (asJson) process.stdout.write(`${JSON.stringify({ ...plan, dry_run: true }, null, 2)}\n`);
    else console.log(`DRY   would create slice "${sliceId}" (${parsed.block.mode}) and ${intentRel}`);
    process.exit(0);
  }

  const modeFlag = { full: ['--full'], hotfix: ['--hotfix'], lite: [] }[parsed.block.mode];
  const init = spawnSync(
    process.execPath,
    [join(import.meta.dirname, 'init-slice.mjs'), sliceId, ...modeFlag, '--source-json', JSON.stringify(source)],
    { cwd: root, encoding: 'utf8' },
  );
  if (init.status !== 0) stop([`asdd slice init failed: ${(init.stderr || init.stdout).trim()}`]);

  writeFileSync(join(root, intentRel), renderIntentMd(parsed, { ref, stale }));

  if (asJson) process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  else {
    console.log(`CREATE ${intentRel}`);
    console.log(`OK    slice "${sliceId}" (${parsed.block.mode}) from ${ref}${stale.length ? ` — ${stale.length} stale ref(s) recorded` : ''}`);
    console.log(`Next: ${parsed.block.mode === 'hotfix' ? 'fill the TASK-001 stub feature' : 'start the slice\'s first phase from intent.md'}, then asdd sync`);
  }
}

await runMain(import.meta.url, run);
