// ruleid: arch.harness-no-agents-import
import { lintFleet } from '../../.agents/skills/x.mjs';
// ok: arch.harness-no-agents-import
import { runDrift } from './drift-lib.mjs';

// ruleid: arch.cli-no-tools-import
import { audit } from '../../tools/spec-drift/src/harness/drift-lib.mjs';
// ok: arch.cli-no-tools-import
import { join } from 'node:path';

async function load() {
  // ruleid: arch.harness-no-agents-import
  await import('../../.agents/mcp/sync-runtime-mcp.cjs');
  // ok: arch.harness-no-agents-import
  await import('./telemetry-lib.mjs');
}
