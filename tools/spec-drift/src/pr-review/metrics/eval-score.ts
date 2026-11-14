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
	/** Main language of the change (`typescript`, `python`…): scores are broken down by it. */
	readonly language?: string;
	/** What the case exercises (`security`, `correctness`, `clean`…): scores are broken down by it. */
	readonly category?: string;
	/** Unified diff of the change under review. */
	readonly diff: string;
	readonly expected: readonly ExpectedDefect[];
	/** Draft findings a human removed on a real review (review-quality REQ-004): reporting them again is known noise. */
	readonly noise?: readonly ExpectedDefect[];
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
	readonly language?: string;
	readonly category?: string;
	/** False positives that land on a known-noise label (a draft a human already removed once). */
	readonly repeatedNoise?: number;
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
	const falsePositives = findings.filter((_f, i) => !used.has(i));
	const noise = evalCase.noise ?? [];
	return {
		id: evalCase.id,
		...(evalCase.language ? { language: evalCase.language } : {}),
		...(evalCase.category ? { category: evalCase.category } : {}),
		...(noise.length ? { repeatedNoise: falsePositives.filter((f) => noise.some((n) => overlaps(f, n))).length } : {}),
		expected: evalCase.expected.length,
		produced: findings.length,
		truePositives: used.size,
		falsePositives,
		missed,
	};
};

const ratio = (a: number, b: number): number | undefined => (b === 0 ? undefined : a / b);
const pct = (value: number | undefined): string => (value === undefined ? '—' : `${Math.round(value * 100)}%`);

/** Precision, recall and F1 of a set of cases. */
export type EvalTotals = {
	readonly cases: number;
	readonly precision: number | undefined;
	readonly recall: number | undefined;
	readonly f1: number | undefined;
};

export type EvalSummary = {
	readonly cases: readonly CaseScore[];
	readonly precision: number | undefined;
	readonly recall: number | undefined;
	readonly f1: number | undefined;
	/** Per `language` and per `category` (review-quality REQ-002); cases without the field are `unknown`. */
	readonly byLanguage?: Readonly<Record<string, EvalTotals>>;
	readonly byCategory?: Readonly<Record<string, EvalTotals>>;
};

const totalsOf = (cases: readonly CaseScore[]): EvalTotals => {
	const { precision, recall, f1 } = summarizeEval(cases, { breakdown: false });
	return { cases: cases.length, precision, recall, f1 };
};

const breakdown = (cases: readonly CaseScore[], key: (c: CaseScore) => string | undefined) => {
	const groups = new Map<string, CaseScore[]>();
	for (const c of cases) {
		const k = key(c) ?? 'unknown';
		groups.set(k, [...(groups.get(k) ?? []), c]);
	}
	return Object.fromEntries([...groups].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, totalsOf(v)]));
};

export const summarizeEval = (cases: readonly CaseScore[], { breakdown: split = true } = {}): EvalSummary => {
	const tp = cases.reduce((s, c) => s + c.truePositives, 0);
	const produced = cases.reduce((s, c) => s + c.produced, 0);
	const expected = cases.reduce((s, c) => s + c.expected, 0);
	const precision = ratio(tp, produced);
	const recall = ratio(tp, expected);
	const f1 =
		precision !== undefined && recall !== undefined && precision + recall > 0
			? (2 * precision * recall) / (precision + recall)
			: undefined;
	if (!split) return { cases, precision, recall, f1 };
	return {
		cases,
		precision,
		recall,
		f1,
		byLanguage: breakdown(cases, (c) => c.language),
		byCategory: breakdown(cases, (c) => c.category),
	};
};

/** Points (0–100) a run may lose against its baseline before it counts as a regression. */
export const DEFAULT_MAX_DROP = 5;

export type BaselineComparison = {
	readonly regressed: boolean;
	/** One line per metric: baseline → current (Δ points). */
	readonly lines: readonly string[];
};

/**
 * Compare a run with a saved baseline (review-quality REQ-002): a drop of more than `maxDrop` points in precision or
 * recall is a regression. F1 is shown but does not decide, so a trade of one for the other stays visible.
 */
export const compareWithBaseline = (
	current: Pick<EvalSummary, 'precision' | 'recall' | 'f1'>,
	baseline: Pick<EvalSummary, 'precision' | 'recall' | 'f1'>,
	maxDrop = DEFAULT_MAX_DROP,
): BaselineComparison => {
	let regressed = false;
	const lines = (['precision', 'recall', 'f1'] as const).map((metric) => {
		const before = baseline[metric];
		const after = current[metric];
		if (before === undefined || after === undefined) return `${metric}: ${pct(before)} → ${pct(after)}`;
		const delta = Math.round((after - before) * 100);
		const drop = metric !== 'f1' && -delta > maxDrop;
		if (drop) regressed = true;
		return `${metric}: ${pct(before)} → ${pct(after)} (${delta >= 0 ? '+' : ''}${delta} pts)${drop ? ` — REGRESSION (more than ${maxDrop} pts)` : ''}`;
	});
	return { regressed, lines };
};

const totalsTable = (title: string, rows: Readonly<Record<string, EvalTotals>> | undefined): string[] =>
	rows && Object.keys(rows).length > 1
		? [
				'',
				`| ${title} | Cases | Precision | Recall | F1 |`,
				'| --- | ---: | ---: | ---: | ---: |',
				...Object.entries(rows).map(
					([k, t]) => `| ${k} | ${t.cases} | ${pct(t.precision)} | ${pct(t.recall)} | ${pct(t.f1)} |`,
				),
			]
		: [];

export const formatEval = (summary: EvalSummary): string =>
	[
		`Precision ${pct(summary.precision)} · Recall ${pct(summary.recall)} · F1 ${pct(summary.f1)} over ${summary.cases.length} case(s)`,
		...(() => {
			const repeated = summary.cases.reduce((n, c) => n + (c.repeatedNoise ?? 0), 0);
			return repeated ? [`${repeated} false positive(s) repeat a comment a human already removed (known noise).`] : [];
		})(),
		...totalsTable('Language', summary.byLanguage),
		...totalsTable('Category', summary.byCategory),
		'',
		'| Case | Expected | Found | Hits | False positives | Missed |',
		'| --- | ---: | ---: | ---: | --- | --- |',
		...summary.cases.map(
			(c) =>
				`| ${c.id} | ${c.expected} | ${c.produced} | ${c.truePositives} | ${c.falsePositives.map((f) => `${f.path}:${f.startLine}`).join(', ') || '—'} | ${c.missed.map((m) => `${m.path}:${m.startLine}${m.note ? ` (${m.note})` : ''}`).join(', ') || '—'} |`,
		),
	].join('\n');
