import type { Finding, RuleMeta, SpecDriftItem, SpecDriftReport } from '../analysis.types.ts';
import { countBy } from './count-by.ts';

const SEVERITY_RANK: Record<string, number> = { ERROR: 0, WARNING: 1, INFO: 2 };

/** Compare the rule catalog (the encoded spec) with live findings: clean vs drifting rules. */
export const buildDriftReport = (rules: readonly RuleMeta[], findings: readonly Finding[]): SpecDriftReport => {
	const byRule = countBy(findings, 'checkId');
	const items: SpecDriftItem[] = rules.map((rule) => {
		const violationCount = byRule[rule.id] ?? 0;
		return {
			ruleId: rule.id,
			severity: rule.severity,
			category: rule.category,
			adr: rule.adr,
			message: rule.message,
			pack: rule.pack,
			violationCount,
			status: violationCount > 0 ? 'drifting' : 'clean',
			samplePaths: findings
				.filter((f) => f.checkId === rule.id)
				.slice(0, 5)
				.map((f) => `${f.path}:${f.startLine}`),
		};
	});

	const drifting = items
		.filter((i) => i.status === 'drifting')
		.toSorted(
			(a, b) =>
				(SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) || b.violationCount - a.violationCount,
		);

	return {
		totalRules: items.length,
		cleanRules: items.filter((i) => i.status === 'clean').length,
		driftingRules: drifting.length,
		items,
		topDrifts: drifting.slice(0, 15),
	};
};
