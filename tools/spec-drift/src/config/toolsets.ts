/**
 * Toolsets (spec-drift-adoption REQ-003): a team loads only the jobs it uses. Each feature module registers its MCP entry
 * classes (tools, prompts, views) only when its toolset is on; services always load, because audit and review use the
 * analysis services. Read when the modules are defined (design ADR-005), so an unknown name fails at startup.
 */
export const TOOLSETS = ['analysis', 'review', 'audit'] as const;
export type Toolset = (typeof TOOLSETS)[number];

export const TOOLSETS_ENV = 'SPEC_DRIFT_TOOLSETS';

/** The toolsets a value names; every toolset when it is unset or empty. */
export const parseToolsets = (raw: string | undefined): Toolset[] => {
	const names = (raw ?? '')
		.split(',')
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean);
	if (!names.length) return [...TOOLSETS];
	const unknown = names.filter((n) => !(TOOLSETS as readonly string[]).includes(n));
	if (unknown.length) {
		throw new Error(
			`${TOOLSETS_ENV}: unknown toolset ${unknown.map((u) => `"${u}"`).join(', ')}. Use: ${TOOLSETS.join(', ')}.`,
		);
	}
	return TOOLSETS.filter((t) => names.includes(t));
};

/** Whether a toolset is on, from the environment the server started with. */
export const toolsetEnabled = (toolset: Toolset, env: NodeJS.ProcessEnv = process.env): boolean =>
	parseToolsets(env[TOOLSETS_ENV]).includes(toolset);

/** The MCP entry classes of a module when its toolset is on, else none. */
export const whenToolset = <T>(toolset: Toolset, entries: readonly T[]): T[] =>
	toolsetEnabled(toolset) ? [...entries] : [];
