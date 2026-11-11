/**
 * Findings as SARIF 2.1.0 — the format GitHub code scanning, CodeQL and most analyzers exchange.
 * Written next to each draft (`findings.sarif`). A human can upload it to code scanning, which then
 * tracks each finding as an alert (stable across commits via `partialFingerprints`) and records why
 * people dismiss alerts: labelled feedback for evaluating the reviewer.
 */
import type { FindingSeverity, ReviewFinding } from './types.ts';

export const SARIF_FILE = 'findings.sarif';
const FINGERPRINT_KEY = 'architectureMcp/v1';

const LEVEL: Record<FindingSeverity, 'error' | 'warning' | 'note'> = {
	critical: 'error',
	high: 'error',
	medium: 'warning',
	low: 'note',
};

const ruleIdOf = (f: ReviewFinding): string => f.ruleId ?? `category.${f.category ?? 'other'}`;

export const findingsToSarif = (options: {
	readonly findings: readonly ReviewFinding[];
	readonly version: string;
}): Record<string, unknown> => {
	const ruleIds = [...new Set(options.findings.map(ruleIdOf))].toSorted();
	return {
		$schema: 'https://json.schemastore.org/sarif-2.1.0.json',
		version: '2.1.0',
		runs: [
			{
				tool: {
					driver: {
						name: 'architecture-mcp-pr-review',
						version: options.version,
						rules: ruleIds.map((id) => ({ id, shortDescription: { text: id } })),
					},
				},
				results: options.findings.map((f) => ({
					ruleId: ruleIdOf(f),
					ruleIndex: ruleIds.indexOf(ruleIdOf(f)),
					level: LEVEL[f.severity ?? 'medium'],
					message: { text: f.content.trim() },
					locations: [
						{
							physicalLocation: {
								artifactLocation: { uri: f.path, uriBaseId: '%SRCROOT%' },
								...(f.startLine > 0
									? { region: { startLine: f.startLine, endLine: Math.max(f.startLine, f.endLine || f.startLine) } }
									: {}),
							},
						},
					],
					...(f.fingerprint ? { partialFingerprints: { [FINGERPRINT_KEY]: f.fingerprint } } : {}),
					properties: {
						...(f.category ? { category: f.category } : {}),
						...(f.confidence !== undefined ? { confidence: f.confidence } : {}),
						...(f.verdict ? { verdict: f.verdict } : {}),
						source: f.source ?? 'model',
					},
				})),
			},
		],
	};
};
