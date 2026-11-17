/**
 * Findings validation for a security audit (security-review REQ-004). The contract is the vendored skill's own
 * `report-schema.json` + `validate-findings.cjs`, loaded as is (design ADR-001: vendor, do not port). On top of it the
 * server checks what only it can: every `trace` / `evidence` location names a file inside the repository and a line that
 * file has.
 */
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { methodologyFile } from './checklists.ts';

type Validator = {
	readonly validateDocument: (findings: unknown, schema: unknown) => string[];
};

export type Verdict = 'confirmed' | 'needs_validation' | 'rejected';
export type SeverityLevel = 'informational' | 'low' | 'medium' | 'high' | 'critical';

type Location = { readonly file: string; readonly line: number; readonly description?: string; readonly kind?: string };

/** The fields the server reads; the rest of a finding is kept as submitted. */
export type SecurityFinding = {
	readonly verdict: Verdict;
	readonly fingerprint: string;
	readonly title: string;
	readonly description: string;
	readonly trace: readonly Location[];
	readonly evidence: readonly Location[];
	readonly severity?: { readonly overall_severity?: SeverityLevel };
	readonly [key: string]: unknown;
};

export type FindingsValidation = {
	readonly ok: boolean;
	readonly errors: readonly string[];
	/** The submitted findings, sorted by fingerprint (the validator requires it). */
	readonly findings: readonly SecurityFinding[];
};

let loaded: { validator: Validator; schema: unknown } | null = null;

const load = (): { validator: Validator; schema: unknown } => {
	if (!loaded) {
		const require = createRequire(import.meta.url);
		const validator = require(methodologyFile('validate-findings.cjs')) as Validator;
		const schema = JSON.parse(readFileSync(methodologyFile('report-schema.json'), 'utf8')) as unknown;
		loaded = { validator, schema };
	}
	return loaded;
};

const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

const fingerprintOf = (v: unknown): string =>
	isRecord(v) && typeof v['fingerprint'] === 'string' ? v['fingerprint'] : '';

const lineCount = (text: string): number =>
	text.length === 0 ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0);

/** `file` resolved inside `repoRoot` (symlinks followed), or null when it leaves the repo or does not exist. */
const insideRepo = (repoRoot: string, file: string): string | null => {
	try {
		const root = realpathSync(repoRoot);
		const real = realpathSync(path.resolve(root, file));
		const rel = path.relative(root, real);
		if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
		return statSync(real).isFile() ? real : null;
	} catch {
		return null;
	}
};

/** Repository checks the schema cannot make: each location exists and its line is inside the file. */
const repoEvidenceErrors = (findings: readonly unknown[], repoRoot: string): string[] => {
	const errors: string[] = [];
	const lines = new Map<string, number | null>();
	findings.forEach((finding, i) => {
		if (!isRecord(finding)) return;
		for (const field of ['trace', 'evidence'] as const) {
			const entries = finding[field];
			if (!Array.isArray(entries)) continue;
			entries.forEach((entry, j) => {
				if (!isRecord(entry) || typeof entry['file'] !== 'string' || typeof entry['line'] !== 'number') return;
				const file = entry['file'];
				if (!lines.has(file)) {
					const real = insideRepo(repoRoot, file);
					lines.set(file, real ? lineCount(readFileSync(real, 'utf8')) : null);
				}
				const count = lines.get(file);
				if (count === null || count === undefined) {
					errors.push(`$[${i}].${field}[${j}].file: ${file} does not exist in the repository`);
				} else if (entry['line'] > count) {
					errors.push(`$[${i}].${field}[${j}].line: line ${entry['line']} is past the end of ${file} (${count} lines)`);
				}
			});
		}
	});
	return errors;
};

/** Validate submitted findings against the vendored contract and the repository; never throws on bad input. */
export const validateSecurityFindings = (findings: unknown, repoRoot: string): FindingsValidation => {
	if (!Array.isArray(findings)) {
		return { ok: false, errors: ['findings must be an array of findings (report-schema.json)'], findings: [] };
	}
	const sorted = [...findings].sort((a, b) => {
		const x = fingerprintOf(a);
		const y = fingerprintOf(b);
		return x < y ? -1 : x > y ? 1 : 0;
	});
	const { validator, schema } = load();
	let errors: string[];
	try {
		errors = [...validator.validateDocument(sorted, schema)];
	} catch {
		errors = ['the findings could not be validated (unexpected validator error)'];
	}
	errors.push(...repoEvidenceErrors(sorted, repoRoot));
	return { ok: errors.length === 0, errors, findings: errors.length ? [] : (sorted as SecurityFinding[]) };
};

/** Overall severity of a confirmed finding; undefined for needs_validation / rejected. */
export const severityOf = (finding: SecurityFinding): SeverityLevel | undefined =>
	finding.verdict === 'confirmed' ? finding.severity?.overall_severity : undefined;
