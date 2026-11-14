import { createHash } from 'node:crypto';

/**
 * Analysis baseline (spec-drift-adoption REQ-001): the existing findings a Tech Lead accepted, so a scan shows what is
 * new. A finding is identified by rule, path and the normalized text of its line — a moved line keeps its fingerprint, an
 * edited line becomes new. Identical lines are counted, not collapsed. Pure.
 */

/** Inside the rules folder, next to the rules it baselines (`.semgrep/baseline.json`). */
export const BASELINE_FILE = 'baseline.json';

export type BaselineFile = {
	readonly schema_version: '1.0';
	readonly created_at: string;
	readonly engine: string;
	readonly total: number;
	/** fingerprint → how many findings had it. */
	readonly fingerprints: Readonly<Record<string, number>>;
};

export type BaselineStatus = {
	/** Repository-relative path of the baseline file. */
	readonly file: string;
	readonly created_at: string;
	/** Findings recorded in the baseline. */
	readonly entries: number;
	readonly new: number;
	readonly existing: number;
	/** Baseline findings gone; null when the scan was limited (by paths, mode or severity) and cannot tell. */
	readonly resolved: number | null;
};

export const normalizeLine = (text: string): string => text.trim().replace(/\s+/g, ' ');

export const fingerprintOf = (rule: string, path: string, lineText: string): string =>
	createHash('sha256')
		.update(`${rule}\0${path}\0${normalizeLine(lineText)}`)
		.digest('hex')
		.slice(0, 16);

export const buildBaseline = (fingerprints: readonly string[], engine: string, now = new Date()): BaselineFile => {
	const counts: Record<string, number> = {};
	for (const fp of [...fingerprints].sort()) counts[fp] = (counts[fp] ?? 0) + 1;
	return {
		schema_version: '1.0',
		created_at: now.toISOString(),
		engine,
		total: fingerprints.length,
		fingerprints: counts,
	};
};

/** The baseline file, or null when it is missing or not a baseline. */
export const parseBaseline = (text: string | null): BaselineFile | null => {
	if (!text) return null;
	try {
		const raw = JSON.parse(text) as Partial<BaselineFile>;
		if (!raw || typeof raw.fingerprints !== 'object' || raw.fingerprints === null) return null;
		const fingerprints = Object.fromEntries(
			Object.entries(raw.fingerprints).filter(([, n]) => Number.isInteger(n) && (n as number) > 0),
		) as Record<string, number>;
		const total = Object.values(fingerprints).reduce((s, n) => s + n, 0);
		return {
			schema_version: '1.0',
			created_at: String(raw.created_at ?? ''),
			engine: String(raw.engine ?? ''),
			total,
			fingerprints,
		};
	} catch {
		return null;
	}
};

/**
 * Mark each finding (by its fingerprint, in order) `existing` while the baseline still has that fingerprint left, else
 * `new`; count what the baseline had that this scan no longer finds (only meaningful for a whole-repository scan).
 */
export const compareWithBaseline = (
	fingerprints: readonly string[],
	baseline: BaselineFile,
	file: string,
	wholeScan: boolean,
): { marks: ('new' | 'existing')[]; status: BaselineStatus } => {
	const left = new Map(Object.entries(baseline.fingerprints));
	const marks = fingerprints.map((fp) => {
		const n = left.get(fp) ?? 0;
		if (n <= 0) return 'new' as const;
		left.set(fp, n - 1);
		return 'existing' as const;
	});
	const existing = marks.filter((m) => m === 'existing').length;
	const resolved = [...left.values()].reduce((s, n) => s + n, 0);
	return {
		marks,
		status: {
			file,
			created_at: baseline.created_at,
			entries: baseline.total,
			new: marks.length - existing,
			existing,
			resolved: wholeScan ? resolved : null,
		},
	};
};
