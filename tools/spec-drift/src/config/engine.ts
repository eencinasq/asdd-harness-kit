/**
 * The analysis engine (spec-drift-demand REQ-005, ADR-005): `SPEC_DRIFT_ENGINE=semgrep` (default) or `codeql`. Read when
 * the modules are defined, like the toolsets, so an unknown name fails at startup.
 */
export const ENGINES = ['semgrep', 'codeql'] as const;
export type EngineName = (typeof ENGINES)[number];
export const ENGINE_ENV = 'SPEC_DRIFT_ENGINE';

export const parseEngine = (raw: string | undefined): EngineName => {
	const name = (raw ?? '').trim().toLowerCase() || 'semgrep';
	if (!(ENGINES as readonly string[]).includes(name)) {
		throw new Error(`${ENGINE_ENV}: unknown engine "${raw}". Use: ${ENGINES.join(', ')}.`);
	}
	return name as EngineName;
};
