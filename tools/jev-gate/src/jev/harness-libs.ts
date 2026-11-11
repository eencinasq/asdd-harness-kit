import * as commandGate from '../harness/command-gate.mjs';
import * as gates from './gates/jev-gates.mjs';

/**
 * The Jev gates live in this server (`src/jev/gates/`): Jev is not part of the harness or the ASDD pipeline. Only the
 * pattern-only command check (`command-gate.mjs`) and the env loader are vendored from the kit's `cli/src/harness`.
 */

/** A gate verdict as the tools report it: the payload, and whether it failed (unavailable is never a pass). */
export type Verdict = { readonly payload: Record<string, unknown>; readonly failed: boolean };

export type JevLibs = {
	readonly gates: {
		statusVerdict(root: string, options: { health: boolean }): Promise<Verdict>;
		shapeUpVerdict(root: string, pitch: Record<string, unknown> | string, appetite?: string): Promise<Verdict>;
		earsVerdict(root: string, requirement: string): Promise<Verdict>;
		scopeVerdict(root: string, scope: unknown): Promise<Verdict>;
	};
	readonly commandGate: {
		checkCommandSafety(command: string, options?: { override?: boolean }): Promise<Record<string, unknown>>;
	};
};

/** Bundled with the server: no runtime lookup of the project's harness CLI. */
export const jevLibs: JevLibs = {
	gates: gates as unknown as JevLibs['gates'],
	commandGate: commandGate as unknown as JevLibs['commandGate'],
};
