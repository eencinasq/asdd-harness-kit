import type { ScanSummary } from '../../src/analysis/analysis.types.ts';

/** What the dashboard shows when the repo has no rules for the mode (spec-drift-empty REQ-002); null otherwise. */
export type NoRulesView = { readonly title: string; readonly message: string; readonly prompt: string };

export const noRulesView = (s: ScanSummary): NoRulesView | null =>
	s.status === 'no-rules'
		? {
				title: 'No rules — nothing analyzed',
				message: s.message ?? `No ${s.engine?.rulesDir ?? 'rules'} folder for this mode.`,
				prompt: s.generatePrompt ?? '',
			}
		: null;
