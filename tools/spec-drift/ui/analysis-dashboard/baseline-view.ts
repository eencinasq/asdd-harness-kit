import type { Finding, ScanSummary } from '../../src/analysis/analysis.types.ts';

/** Dashboard view logic for the baseline (spec-drift-adoption REQ-001). Pure. */

export type BaselineFilter = 'new' | 'all';

/** "3 new · 40 existing · 2 resolved since 2026-11-01", or null without a baseline. */
export const baselineHint = (s: ScanSummary): string | null => {
	const b = s.baseline;
	if (!b) return null;
	const parts = [`${b.new} new`, `${b.existing} existing`, ...(b.resolved === null ? [] : [`${b.resolved} resolved`])];
	return `${parts.join(' · ')} since the baseline of ${b.created_at.slice(0, 10)}`;
};

/** With a baseline, the view starts on new findings: they are what the change introduced. */
export const defaultBaselineFilter = (s: ScanSummary): BaselineFilter => (s.baseline ? 'new' : 'all');

export const matchesBaseline = (finding: Finding, filter: BaselineFilter): boolean =>
	filter === 'all' || finding.baseline !== 'existing';
