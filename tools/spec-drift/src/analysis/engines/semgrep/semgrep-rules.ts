import { parse } from 'yaml';

import type { RuleMeta, Severity } from '../../analysis.types.ts';

/** Folders under `.semgrep/` that hold test fixtures, not rules. */
export const IGNORED_SETS = new Set(['tests', 'test', 'fixtures', '__tests__']);

const RULE_FILE = /\.ya?ml$/i;
export const isRuleFile = (name: string): boolean => RULE_FILE.test(name);

/** `01-boundaries.yml` → `boundaries`, `coding-standards.yaml` → `coding-standards`. */
export const packIdFromFile = (fileName: string): string =>
	fileName
		.replace(RULE_FILE, '')
		.replace(/^\d+[-_.]/, '')
		.toLowerCase();

/** Semgrep severities (legacy ERROR/WARNING/INFO and the newer CRITICAL…LOW) → engine-neutral. */
export const toSeverity = (value: unknown, fallback: Severity = 'INFO'): Severity => {
	switch (typeof value === 'string' ? value.toUpperCase() : '') {
		case 'ERROR':
		case 'CRITICAL':
		case 'HIGH':
			return 'ERROR';
		case 'WARNING':
		case 'MEDIUM':
			return 'WARNING';
		case 'INFO':
		case 'LOW':
		case 'INVENTORY':
		case 'EXPERIMENT':
			return 'INFO';
		default:
			return fallback;
	}
};

type RawRule = {
	readonly id?: unknown;
	readonly severity?: unknown;
	readonly message?: unknown;
	readonly mode?: unknown;
	readonly metadata?: Record<string, unknown>;
};

const asString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

/** `metadata.adr`, or an `adr` one level down (e.g. `metadata.mmlc.adr`); string or list. */
export const adrOf = (metadata: unknown): string | null => {
	if (!metadata || typeof metadata !== 'object') return null;
	const read = (value: unknown): string | null => {
		if (typeof value === 'string') return value;
		if (Array.isArray(value)) return value.filter((x) => typeof x === 'string').join(', ') || null;
		return null;
	};
	const record = metadata as Record<string, unknown>;
	if ('adr' in record) return read(record['adr']);
	for (const nested of Object.values(record)) {
		if (nested && typeof nested === 'object' && 'adr' in nested)
			return read((nested as Record<string, unknown>)['adr']);
	}
	return null;
};

/**
 * Rules declared in one Semgrep YAML file. Invalid YAML yields no rules (Semgrep itself reports the
 * error in its output) rather than failing the whole scan.
 */
export const parseRuleCatalog = (
	yaml: string,
	context: { readonly pack: string; readonly set: string },
): RuleMeta[] => {
	let doc: unknown;
	try {
		doc = parse(yaml);
	} catch {
		return [];
	}
	const rules = (doc as { rules?: unknown } | null)?.rules;
	if (!Array.isArray(rules)) return [];
	return rules.flatMap((raw: RawRule) => {
		const id = asString(raw?.id);
		if (!id) return [];
		const message = (asString(raw.message) ?? '').replace(/\s+/g, ' ').trim();
		return [
			{
				id,
				severity: toSeverity(raw.severity, 'WARNING'),
				message,
				category: asString(raw.metadata?.['category']) ?? (context.set || 'rules'),
				adr: adrOf(raw.metadata),
				pack: context.pack,
				mode: raw.mode === 'taint' ? 'taint' : 'search',
			},
		];
	});
};
