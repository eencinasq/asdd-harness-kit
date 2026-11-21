// ruleid: arch.tools-no-cli-import
import { runDrift } from '../../../../cli/src/harness/drift-lib.mjs';
// ok: arch.tools-no-cli-import
import { runDrift as vendored } from '../harness/drift-lib.mjs';
// ok: arch.tools-no-cli-import
import { CLI_COMMANDS } from './cli/cli.ts';

async function load(): Promise<void> {
	// ruleid: arch.tools-no-cli-import
	await import('../../../.harness/scripts/check-invariants.mjs');
	// ok: arch.tools-no-cli-import
	await import('node:fs');
}
