/**
 * Offline evaluation of the reviewer (pure): labelled cases (a diff + the defects it really has) vs
 * the findings a review produced. Precision = findings that hit a labelled defect; recall = labelled
 * defects found. Run it before and after any change to the prompt, the rules or the model.
 */

export type ExpectedDefect = {
	readonly path: string;
	readonly startLine: number;
	readonly endLine?: number;
	/** Optional: the checklist item that should catch it. */
	readonly ruleId?: string;
	readonly note?: string;
};

export type EvalCase = {
	readonly id: string;
	readonly description?: string;
	/** Unified diff of the change under review. */
	readonly diff: string;
	readonly expected: readonly ExpectedDefect[];
};

export type ProducedFinding = {
	readonly path: string;
	readonly startLine: number;
	readonly endLine?: number;
	readonly ruleId?: string;
	readonly severity?: string;
};

/** Lines a finding may be off by and still count as the same defect. */
export const LINE_TOLERANCE = 2;

const overlaps = (f: ProducedFinding, e: ExpectedDefect): boolean => {
	if (f.path !== e.path) return false;
	const fEnd = Math.max(f.startLine, f.endLine ?? f.startLine);
	const eEnd = Math.max(e.startLine, e.endLine ?? e.startLine);
	return f.startLine <= eEnd + LINE_TOLERANCE && fEnd >= e.startLine - LINE_TOLERANCE;
};

export type CaseScore = {
	readonly id: string;
	readonly expected: number;
	readonly produced: number;
	readonly truePositives: number;
	readonly falsePositives: readonly ProducedFinding[];
	readonly missed: readonly ExpectedDefect[];
};

/** Match each labelled defect to at most one finding (greedy, in order). */
export const scoreCase = (evalCase: EvalCase, findings: readonly ProducedFinding[]): CaseScore => {
	const used = new Set<number>();
	const missed: ExpectedDefect[] = [];
	for (const expected of evalCase.expected) {
		const hit = findings.findIndex((f, i) => !used.has(i) && overlaps(f, expected));
		if (hit >= 0) used.add(hit);
		else missed.push(expected);
	}
	return {
		id: evalCase.id,
		expected: evalCase.expected.length,
		produced: findings.length,
		truePositives: used.size,
		falsePositives: findings.filter((_f, i) => !used.has(i)),
		missed,
	};
};

const ratio = (a: number, b: number): number | undefined => (b === 0 ? undefined : a / b);
const pct = (value: number | undefined): string => (value === undefined ? '—' : `${Math.round(value * 100)}%`);

export type EvalSummary = {
	readonly cases: readonly CaseScore[];
	readonly precision: number | undefined;
	readonly recall: number | undefined;
	readonly f1: number | undefined;
};

export const summarizeEval = (cases: readonly CaseScore[]): EvalSummary => {
	const tp = cases.reduce((s, c) => s + c.truePositives, 0);
	const produced = cases.reduce((s, c) => s + c.produced, 0);
	const expected = cases.reduce((s, c) => s + c.expected, 0);
	const precision = ratio(tp, produced);
	const recall = ratio(tp, expected);
	const f1 =
		precision !== undefined && recall !== undefined && precision + recall > 0
			? (2 * precision * recall) / (precision + recall)
			: undefined;
	return { cases, precision, recall, f1 };
};

export const formatEval = (summary: EvalSummary): string =>
	[
		`Precision ${pct(summary.precision)} · Recall ${pct(summary.recall)} · F1 ${pct(summary.f1)} over ${summary.cases.length} case(s)`,
		'',
		'| Case | Expected | Found | Hits | False positives | Missed |',
		'| --- | ---: | ---: | ---: | --- | --- |',
		...summary.cases.map(
			(c) =>
				`| ${c.id} | ${c.expected} | ${c.produced} | ${c.truePositives} | ${c.falsePositives.map((f) => `${f.path}:${f.startLine}`).join(', ') || '—'} | ${c.missed.map((m) => `${m.path}:${m.startLine}${m.note ? ` (${m.note})` : ''}`).join(', ') || '—'} |`,
		),
	].join('\n');
