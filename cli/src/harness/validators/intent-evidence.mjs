import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { groundingFindings } from '../intake-lib.mjs';

/**
 * INTENT-EVIDENCE (slice intent-intake, REQ-004): an in-progress slice whose intent.md carries a `## Grounding` table
 * (imported from a tracker Intent item) must keep every evidence ref resolvable — `REQ:<slice>/REQ-NNN`, `slice:<id>`,
 * `path:<repo-path>`. Severity: `drift.intent_evidence` in .harness/config/project.json, `warn` (default) or `fail`.
 * Intents without the table (written before tracker intents) and closed slices (DONE, PARKED, ABANDONED, which hold
 * historical evidence, as DRIFT-02 does since SP-003) are not reported.
 */
export default function validate(ctx) {
  const { root, fail, warn, manifest } = ctx;
  if (!manifest || !Array.isArray(manifest.active_slices)) return;

  let severity = 'warn';
  try {
    severity = JSON.parse(readFileSync(join(root, '.harness/config/project.json'), 'utf8')).drift?.intent_evidence === 'fail' ? 'fail' : 'warn';
  } catch {
    severity = 'warn';
  }
  const report = severity === 'fail' ? fail : warn;

  for (const entry of manifest.active_slices) {
    const sliceId = typeof entry === 'string' ? entry : entry?.slice_id;
    if (typeof sliceId !== 'string' || !sliceId.trim()) continue;
    const intent = join(root, '.harness/specs', sliceId, 'intent.md');
    if (!existsSync(intent)) continue;
    let status = typeof entry === 'object' ? entry.status : undefined;
    try {
      status = JSON.parse(readFileSync(join(root, '.harness/state/slices', sliceId, 'manifest.json'), 'utf8')).status ?? status;
    } catch {
      // no per-slice manifest yet: keep the global entry's status
    }
    if (status !== 'in_progress') continue;
    for (const finding of groundingFindings(root, readFileSync(intent, 'utf8'))) {
      report(`INTENT-EVIDENCE ${sliceId}: ${finding} — re-ground the intent or ask the PO/PM (drift.intent_evidence: ${severity})`);
    }
  }
}
