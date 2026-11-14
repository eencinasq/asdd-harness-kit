import type { AdrCoverageResult, RuleTestReport } from '../../src/analysis/analysis.types.ts';

/** Dashboard view logic for rule tests and ADR coverage (rule-coverage REQ-002, REQ-005). Pure. */

export type Badge = { readonly label: string; readonly tone: 'tone-success' | 'tone-danger' | 'tone-warning' | '' };

/** The test badge of one rule: passed, failed, no test, or tests not run. */
export const testBadge = (tests: RuleTestReport | undefined, ruleId: string): Badge | null => {
	if (!tests) return null;
	if (tests.status !== 'ok') return { label: 'tests not run', tone: '' };
	const result = tests.byRule[ruleId];
	if (result === 'passed') return { label: 'test passed', tone: 'tone-success' };
	if (result === 'failed') return { label: 'test failed', tone: 'tone-danger' };
	return { label: 'no test', tone: 'tone-warning' };
};

export type AdrCoverageView = {
	readonly headline: string;
	readonly tone: 'tone-success' | 'tone-warning' | '';
	/** Uncovered ADRs, each with the prompt the "Ask the agent" action sends. */
	readonly uncovered: readonly {
		readonly id: string;
		readonly title: string;
		readonly path: string;
		readonly prompt: string;
	}[];
	readonly covered: readonly { readonly id: string; readonly title: string; readonly rules: readonly string[] }[];
	readonly dangling: readonly { readonly ruleId: string; readonly adr: string; readonly reason: string }[];
	readonly exempt: number;
};

export const adrCoverageView = (c: AdrCoverageResult | null | undefined): AdrCoverageView | null => {
	if (!c) return null;
	if (!c.dir) {
		return {
			headline: 'No ADR folder found — coverage cannot be measured.',
			tone: '',
			uncovered: [],
			covered: [],
			dangling: c.dangling,
			exempt: 0,
		};
	}
	const pct = c.coverage === null ? '—' : `${Math.round(c.coverage * 100)}%`;
	return {
		headline: `${c.covered} of ${c.enforceable} enforceable ADRs have a rule (${pct}) · ${c.total} in ${c.dir}`,
		tone: c.coverage === 1 ? 'tone-success' : c.enforceable ? 'tone-warning' : '',
		uncovered: c.uncovered,
		covered: c.adrs
			.filter((a) => a.id !== null && a.rules.length > 0)
			.map((a) => ({ id: a.id as string, title: a.title, rules: a.rules })),
		dangling: c.dangling,
		exempt: c.adrs.filter((a) => a.exempt).length,
	};
};
