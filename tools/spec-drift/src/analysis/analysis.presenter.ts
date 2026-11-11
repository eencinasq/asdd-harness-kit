import type { RulePack, ScanSummary } from './analysis.types.ts';

/** Plain-text summary for hosts that do not render the dashboard. */
const toText = (summary: ScanSummary): string => {
	const lines = [
		`${summary.engine.name} ${summary.mode} — ${summary.findingCount} finding(s)`,
		`Spec drift: ${summary.drift.driftingRules}/${summary.drift.totalRules} rules violating`,
	];
	if (summary.status === 'failed') {
		lines.push(
			`${summary.engine.name} failed (exit ${summary.exitCode}): ${summary.stderrTail.slice(-400) || 'no output'}`,
		);
	}
	lines.push(
		'',
		'Pack | Result',
		...summary.packSummaries.map((row) => `- ${row.title} (${row.description}): ${row.resultLabel}`),
		'',
		'Top drifts:',
		...summary.drift.topDrifts
			.slice(0, 8)
			.map(
				(d) =>
					`- [${d.severity}] ${d.ruleId} ×${d.violationCount}` +
					(d.adr ? ` (${d.adr})` : '') +
					(d.samplePaths[0] ? ` @ ${d.samplePaths[0]}` : ''),
			),
	);
	if (summary.findingCount === 0 && summary.status === 'ok') {
		lines.push('', 'No violations — architecture/standards match the encoded spec.');
	}
	return lines.join('\n');
};

/** Tool result: text fallback for the model + structuredContent for the dashboard. */
export const presentScan = (summary: ScanSummary) => ({
	content: [{ type: 'text' as const, text: toText(summary) }],
	structuredContent: summary as unknown as Record<string, unknown>,
});

export const presentPacks = (rulesDir: string, packs: readonly RulePack[]) => {
	const rows = packs.map(({ id, kind, path, set }) => ({ id, kind, path, set }));
	return {
		content: [
			{
				type: 'text' as const,
				text: rows.length
					? rows
							.map((p) => `- ${p.id} (${p.kind}${p.kind === 'file' && p.set ? ` in ${p.set}` : ''}): ${p.path}`)
							.join('\n')
					: `No rule packs found (no rules under ${rulesDir}/).`,
			},
		],
		structuredContent: { packs: rows },
	};
};
