import type { Finding, RuleMeta, RuleTestReport } from '../analysis.types.ts';

/**
 * Whether each rule is ready to accept (rule-coverage REQ-004): its test passes and it is not noisy on the repository.
 * No hits is not a flag — a preventive rule may never fire. Pure.
 */

/** A rule with at least this many hits, or hits in this many files, is noisy (design ADR-004). */
export const NOISY_HITS = 50;
export const NOISY_FILES = 20;

/** Folder of the rules and their test fixtures: never scanned as code (rule-coverage REQ-003). */
export const isRulesPath = (rulesDir: string, p: string): boolean => {
	const clean = p.replace(/^\.\//, '');
	return clean === rulesDir || clean.startsWith(`${rulesDir}/`);
};

export type RuleTestStatus = 'passed' | 'failed' | 'missing' | 'unavailable';
export type RuleFlag = 'no-test' | 'test-failed' | 'tests-unavailable' | 'noisy' | 'scan-failed';

export type RuleReadiness = {
	readonly id: string;
	readonly pack: string;
	readonly severity: string;
	readonly adr: string | null;
	readonly test: RuleTestStatus;
	readonly hits: number;
	readonly files: number;
	readonly flags: readonly RuleFlag[];
	readonly ready: boolean;
};

export type ReadinessReport = {
	readonly rules: readonly RuleReadiness[];
	readonly ready: number;
	readonly notReady: number;
	readonly tests: { readonly status: RuleTestReport['status']; readonly message?: string };
	readonly invalidFiles: readonly string[];
	readonly thresholds: { readonly hits: number; readonly files: number };
};

export const testStatusOf = (tests: RuleTestReport, ruleId: string): RuleTestStatus =>
	tests.status !== 'ok' ? 'unavailable' : (tests.byRule[ruleId] ?? 'missing');

export const ruleReadiness = (
	rules: readonly Pick<RuleMeta, 'id' | 'pack' | 'severity' | 'adr'>[],
	findings: readonly Pick<Finding, 'checkId' | 'path'>[],
	tests: RuleTestReport,
	scanOk: boolean,
): ReadinessReport => {
	const hits = new Map<string, { count: number; files: Set<string> }>();
	for (const f of findings) {
		const h = hits.get(f.checkId) ?? { count: 0, files: new Set<string>() };
		h.count += 1;
		h.files.add(f.path);
		hits.set(f.checkId, h);
	}
	const out = rules.map((rule): RuleReadiness => {
		const h = hits.get(rule.id);
		const count = h?.count ?? 0;
		const files = h?.files.size ?? 0;
		const test = testStatusOf(tests, rule.id);
		const flags: RuleFlag[] = [];
		if (test === 'missing') flags.push('no-test');
		if (test === 'failed') flags.push('test-failed');
		if (test === 'unavailable') flags.push('tests-unavailable');
		if (count >= NOISY_HITS || files >= NOISY_FILES) flags.push('noisy');
		if (!scanOk) flags.push('scan-failed');
		return {
			id: rule.id,
			pack: rule.pack,
			severity: rule.severity,
			adr: rule.adr,
			test,
			hits: count,
			files,
			flags,
			ready: flags.length === 0 && test === 'passed',
		};
	});
	out.sort((a, b) => Number(a.ready) - Number(b.ready) || b.hits - a.hits || a.id.localeCompare(b.id));
	const ready = out.filter((r) => r.ready).length;
	return {
		rules: out,
		ready,
		notReady: out.length - ready,
		tests: { status: tests.status, ...(tests.message ? { message: tests.message } : {}) },
		invalidFiles: tests.invalidFiles,
		thresholds: { hits: NOISY_HITS, files: NOISY_FILES },
	};
};
