import type { AnalysisService } from './analysis.service.ts';
import type { AdrCoverageResult, RulePack, ScanSummary } from './analysis.types.ts';
import type { ReadinessReport } from './domain/rule-readiness.ts';

/** No rules: say nothing was analyzed, and offer the agent prompt (spec-drift-empty REQ-001, REQ-002). */
const noRulesText = (summary: ScanSummary): string =>
	[
		`${summary.engine.name} ${summary.mode} — no rules, nothing analyzed (not a pass).`,
		summary.message ?? '',
		'',
		'Offer the user to have the agent write rules from this codebase (the dashboard button "Ask the agent to write rules", or the MCP prompt `generate-architecture-rules`). Only if the user agrees, follow:',
		'',
		summary.generatePrompt ?? '',
	].join('\n');

/** Plain-text summary for hosts that do not render the dashboard. */
const toText = (summary: ScanSummary): string => {
	if (summary.status === 'no-rules') return noRulesText(summary);
	const b = summary.baseline;
	const lines = [
		`${summary.engine.name} ${summary.mode} — ${summary.findingCount} finding(s)`,
		...(b
			? [
					`Against the baseline (${b.file}, ${b.created_at.slice(0, 10)}): ${b.new} new, ${b.existing} existing${b.resolved === null ? '' : `, ${b.resolved} resolved`}. Only new findings are drift this change introduced.`,
				]
			: []),
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

const pctText = (value: number | null): string => (value === null ? '—' : `${Math.round(value * 100)}%`);

/** Text for `adr_coverage`: the ratio, the uncovered ADRs and what to do, the dangling references. */
export const presentAdrCoverage = (c: AdrCoverageResult) => {
	const lines = !c.dir
		? [
				'No ADR folder found (the `ADR index` row of .harness/steering/structure.md, .adr-dir, docs/decisions, docs/adr, …).',
				'Without ADR files, coverage cannot be measured.',
			]
		: [
				`ADR coverage: ${c.covered} of ${c.enforceable} enforceable ADR(s) have a rule (${pctText(c.coverage)}) — ${c.total} ADR(s) in ${c.dir}.`,
				...(c.uncovered.length
					? [
							'',
							'No rule enforces:',
							...c.uncovered.map((u) => `- ${u.id} — ${u.title} (${u.path})`),
							'',
							'Offer the user to have the agent encode one: the MCP prompt `write-adr-rule` with its adr_id, or "Ask the agent" in the dashboard (ADRs tab).',
						]
					: []),
				...(c.unidentified.length
					? ['', `Files without an ADR number (not counted): ${c.unidentified.join(', ')}`]
					: []),
			];
	if (c.dangling.length) {
		lines.push(
			'',
			'Rules citing an ADR that does not stand:',
			...c.dangling.map((d) => `- ${d.ruleId} → ${d.adr} (${d.reason})`),
		);
	}
	return {
		content: [{ type: 'text' as const, text: lines.join('\n') }],
		structuredContent: c as unknown as Record<string, unknown>,
	};
};

/** Text for `validate_rules`: what is not ready and why, then the ready rules as a count. */
export const presentReadiness = (r: ReadinessReport & { scan: { status: string; stderrTail: string } }) => {
	const why: Record<string, string> = {
		'no-test': 'no test file with ruleid/ok annotations',
		'test-failed': 'its test fails',
		'tests-unavailable': `tests could not run${r.tests.message ? ` (${r.tests.message})` : ''}`,
		noisy: `noisy (>= ${r.thresholds.hits} hits or >= ${r.thresholds.files} files)`,
		'scan-failed': 'the scan failed',
	};
	const notReady = r.rules.filter((x) => !x.ready);
	const lines = [
		`Rules: ${r.ready} ready, ${r.notReady} not ready (tests: ${r.tests.status}).`,
		...(r.invalidFiles.length ? [`Rule files with errors: ${r.invalidFiles.join(', ')}`] : []),
		...(notReady.length
			? [
					'',
					'Not ready:',
					...notReady.map(
						(x) => `- ${x.id} (${x.hits} hit(s) in ${x.files} file(s)): ${x.flags.map((f) => why[f] ?? f).join('; ')}`,
					),
					'',
					'Fix before accepting: add or fix the rule test next to the rule file, narrow a noisy rule (paths, patterns), then run validate_rules again.',
				]
			: []),
	];
	return {
		content: [{ type: 'text' as const, text: lines.join('\n') }],
		structuredContent: r as unknown as Record<string, unknown>,
	};
};

/** Text for `drift_trend`: the answer first (better / worse / flat), then the biggest moves. */
export const presentTrend = (t: ReturnType<AnalysisServiceTrend>) => {
	const how = { better: 'going down (better)', worse: 'going up (worse)', flat: 'flat', unknown: 'unknown' }[
		t.direction
	];
	const lines = !t.points.length
		? [
				t.source === 'analysis'
					? `No snapshots in ${t.where}. Record one with \`spec-drift record\` (by hand at the end of a sprint, or a scheduled CI job) and commit it.`
					: `No audit reports in ${t.where}. Run \`asdd audit\` (or schedule it in CI).`,
			]
		: [
				`${t.source === 'analysis' ? 'Analysis' : 'Audit'} drift is ${how}: ${t.points.length} point(s), ${t.points[0]?.at.slice(0, 10)} → ${t.points.at(-1)?.at.slice(0, 10)}, ${t.measure === 'new' ? 'new findings' : 'findings'} ${t.points[0]?.[t.measure] ?? '—'} → ${t.points.at(-1)?.[t.measure] ?? '—'}${t.change === null ? '' : ` (${t.change > 0 ? '+' : ''}${Math.round(t.change * 100)}%)`}.`,
				...(t.points.length < 2 ? ['One point is not a trend: record another later.'] : []),
				...(t.changes.length
					? [
							'',
							`Biggest moves by ${t.by}:`,
							...t.changes.map((c) => `- ${c.key}: ${c.first} → ${c.last} (${c.delta > 0 ? '+' : ''}${c.delta})`),
						]
					: []),
			];
	return {
		content: [{ type: 'text' as const, text: lines.join('\n') }],
		structuredContent: t as unknown as Record<string, unknown>,
	};
};

type AnalysisServiceTrend = AnalysisService['trend'];

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
