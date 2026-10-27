#!/usr/bin/env node
/**
 * Tech Lead triage of audit findings → .harness/audits/triage.json.
 *
 *   node .harness/scripts/audit-triage.mjs <finding-id> --dismiss --reason "<why>" [--by tl]
 *   node .harness/scripts/audit-triage.mjs <finding-id> --confirm [--reason "..."] [--by tl]
 *   node .harness/scripts/audit-triage.mjs <finding-id> --clear
 *   node .harness/scripts/audit-triage.mjs --list
 *
 * A dismissal stores a content hash of the finding's files; once they change, the
 * finding comes back. Findings are looked up in the latest audit report, then in a
 * fresh drift check. The MCP server never writes this file.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { runDrift } from './drift-lib.mjs';
import { TRIAGE_FILE, findingPaths, latestReport, loadTriage, pathsHash } from './audit-lib.mjs';

function usage(code) {
  console.log('Usage: audit-triage.mjs <finding-id> (--dismiss --reason "<why>" | --confirm | --clear) [--by <who>] | --list');
  process.exit(code);
}

const argv = process.argv.slice(2);
const root = process.cwd();
const triage = loadTriage(root);

if (argv.includes('-h') || argv.includes('--help')) usage(0);
if (argv.includes('--list')) {
  console.log(JSON.stringify(triage, null, 2));
  process.exit(0);
}

const id = argv.find((a) => /^AUD-[0-9a-f]{8}$/.test(a));
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const action = ['--dismiss', '--confirm', '--clear'].filter((a) => argv.includes(a));
if (!id || action.length !== 1) usage(1);

if (action[0] === '--clear') {
  delete triage[id];
} else {
  const finding = [...(latestReport(root)?.report?.findings ?? []), ...runDrift({ root, requirementChecks: true }).findings]
    .find((f) => f.id === id);
  if (!finding) {
    console.error(`finding ${id} not found in the latest audit report or a fresh drift check`);
    process.exit(1);
  }
  const reason = flag('--reason');
  if (action[0] === '--dismiss' && !reason?.trim()) {
    console.error('--dismiss requires --reason "<why>" (cite an ADR or decision when there is one)');
    process.exit(1);
  }
  triage[id] = {
    decision: action[0] === '--dismiss' ? 'dismissed' : 'confirmed',
    check: finding.check,
    reason: reason?.trim() ?? '',
    by: flag('--by') ?? 'tl',
    at: new Date().toISOString(),
    paths_hash: pathsHash(root, findingPaths(root, finding)),
  };
}

const abs = join(root, TRIAGE_FILE);
mkdirSync(dirname(abs), { recursive: true });
writeFileSync(abs, `${JSON.stringify(triage, null, 2)}\n`);
console.log(`${action[0].slice(2)} ${id} → ${TRIAGE_FILE}`);
