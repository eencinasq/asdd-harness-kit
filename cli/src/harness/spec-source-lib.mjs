/**
 * Experimental spec-as-source pilot (ASDD-ROADMAP P4.4).
 * Opt-in via capabilities.spec_as_source === true. Read-only inventory.
 */
import {
  listSlices,
  mentionedRequirementIds,
  parseRequirements,
  testFiles,
  isGitRepo,
} from './drift-lib.mjs';
import { readProjectConfig } from './stop-mode.mjs';

export function isSpecAsSourceEnabled(root, opts = {}) {
  const config = opts.config !== undefined ? opts.config : readProjectConfig(root);
  return config?.capabilities?.spec_as_source === true;
}

/**
 * @param {string} root
 * @param {{ sliceId?: string, config?: object|null }} [opts]
 */
export function buildSpecSourceInventory(root, opts = {}) {
  if (!isSpecAsSourceEnabled(root, opts)) {
    return {
      enabled: false,
      error: 'spec-as-source is experimental and disabled. Set capabilities.spec_as_source=true in .harness/config/project.json (see cli/docs/guides/spec-as-source.md).',
      items: [],
    };
  }

  const gitAvailable = isGitRepo(root);
  const tests = testFiles(root, gitAvailable);
  let slices = listSlices(root);
  if (opts.sliceId) slices = slices.filter((s) => s.slice_id === opts.sliceId);

  const items = [];
  for (const s of slices) {
    const reqs = parseRequirements(root, s.slice_id).filter((r) => r.must);
    if (!reqs.length) continue;
    const implemented = new Set(s.features.flatMap((f) => (Array.isArray(f.req_ids) ? f.req_ids : [])));
    const mentioned = mentionedRequirementIds(
      root,
      tests,
      reqs.map((r) => r.id),
    );
    for (const r of reqs) {
      items.push({
        slice_id: s.slice_id,
        req_id: r.id,
        in_features: implemented.has(r.id),
        in_tests: mentioned.has(r.id),
        covered: implemented.has(r.id) && mentioned.has(r.id),
      });
    }
  }

  const uncovered = items.filter((i) => !i.covered);
  return {
    enabled: true,
    generated_at: new Date().toISOString(),
    total_must: items.length,
    covered: items.filter((i) => i.covered).length,
    uncovered: uncovered.length,
    items,
    note: 'Pilot only: code remains editable; specs under .harness/ are not a generation SoT by default.',
  };
}

export function formatSpecSourceInventory(inv) {
  if (!inv.enabled) return `FAIL  ${inv.error}\n`;
  const lines = [
    '== spec-source (experimental) ==',
    `  MUST covered  ${inv.covered}/${inv.total_must}`,
    `  ${inv.note}`,
  ];
  for (const i of inv.items.filter((x) => !x.covered).slice(0, 40)) {
    const gaps = [
      !i.in_features ? 'no feature req_ids' : null,
      !i.in_tests ? 'no test mention' : null,
    ]
      .filter(Boolean)
      .join(', ');
    lines.push(`  • ${i.slice_id} ${i.req_id} — ${gaps}`);
  }
  if (inv.uncovered > 40) lines.push(`  … +${inv.uncovered - 40} more`);
  if (!inv.uncovered) lines.push('  (all MUST REQs traced + mentioned)');
  return `${lines.join('\n')}\n`;
}
