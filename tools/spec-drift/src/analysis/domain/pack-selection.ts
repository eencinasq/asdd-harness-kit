import type { RulePack, ScanMode } from '../analysis.types.ts';

/** Shape of a pack id accepted in tool input (also keeps option-like values out of engine CLIs). */
export const PACK_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;

/** Mode → the top-level set it scans; `all` / `spec-drift` scan every set. */
const SETS_FOR_MODE: Partial<Record<ScanMode, string>> = {
	architecture: 'architecture',
	standards: 'standards',
};

export class UnknownPackError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'UnknownPackError';
	}
}

/**
 * Packs to run for a mode; an explicit selection wins. Unknown ids fail with the list of what exists,
 * so the model can correct itself. Engine-neutral: works on whatever packs the engine discovered.
 */
export const packsForMode = (
	mode: ScanMode,
	available: readonly RulePack[],
	selected?: readonly string[],
	rulesDir = 'rules',
): RulePack[] => {
	const byId = new Map(available.map((p) => [p.id, p]));
	const known = () => [...byId.keys()].join(', ') || `(none — no rules found under ${rulesDir}/)`;
	if (selected && selected.length > 0) {
		return selected.map((id) => {
			const pack = byId.get(id);
			if (!pack) throw new UnknownPackError(`Unknown rule pack '${id}'. Available: ${known()}.`);
			return pack;
		});
	}
	const sets = available.filter((p) => p.kind === 'set');
	const wanted = SETS_FOR_MODE[mode];
	if (wanted === undefined) {
		// Every set, plus rule files that sit directly in the rules folder.
		return [...sets, ...available.filter((p) => p.kind === 'file' && p.set === '')];
	}
	const set = byId.get(wanted);
	if (set?.kind !== 'set') {
		throw new UnknownPackError(`No ${rulesDir}/${wanted}/ folder for mode '${mode}'. Available packs: ${known()}.`);
	}
	return [set];
};

/** Every rule file covered by the selected packs (a set and its files may both be selected). */
export const ruleFilesOf = (packs: readonly RulePack[]): string[] => [...new Set(packs.flatMap((p) => p.files))].sort();
