/**
 * Review quality metrics (pure). The agent's draft is snapshotted (`.original/comments.md`); what the
 * human publishes is the ground truth. Per published review we record how many drafted comments
 * were kept, edited or removed — by severity and by checklist item — so prompt or rule changes can be
 * judged by data instead of impressions.
 */
import type { ReviewFinding } from '../engine';
import type { CommentsCheck } from '../pr-review.types.ts';

type Tally = { drafted: number; kept: number; edited: number; removed: number };
const tally = (): Tally => ({ drafted: 0, kept: 0, edited: 0, removed: 0 });

/** The tally for `key`, created on first use. */
const tallyOf = (map: Record<string, Tally>, key: string): Tally => {
	const existing = map[key];
	if (existing) return existing;
	const created = tally();
	map[key] = created;
	return created;
};

export type PublishMetrics = {
	readonly at: string;
	readonly project: string;
	readonly pr: number;
	readonly revision: number;
	readonly mode: 'submitted' | 'pending';
	readonly event: string;
	readonly suggestedEvent?: string;
	readonly comments: Tally & { readonly added: number };
	readonly summaryEdited: boolean;
	readonly bySeverity: Readonly<Record<string, Tally>>;
	readonly byRule: Readonly<Record<string, Tally>>;
	readonly verification?: { readonly confirmed: number; readonly plausible: number; readonly rejected: number };
	readonly requirements?: Readonly<Record<string, number>>;
};

/** The comments.md key a finding becomes (see commentKey in comments-format). */
const findingKey = (f: ReviewFinding): string => {
	const line = f.endLine || f.startLine;
	const start = f.endLine && f.endLine !== f.startLine ? f.startLine : line;
	return `${f.path}:${start}-${line}`;
};

export const buildPublishMetrics = (options: {
	readonly project: string;
	readonly pr: number;
	readonly revision: number;
	readonly pending: boolean;
	readonly event: string;
	readonly suggestedEvent?: string;
	readonly check: CommentsCheck;
	readonly findings: readonly ReviewFinding[];
	/** Rule doc of the group each file belongs to (used when a finding cites no checklist item). */
	readonly ruleOfFile: (path: string) => string | undefined;
	readonly requirements?: Readonly<Record<string, number>>;
	readonly now?: Date;
}): PublishMetrics => {
	const byKey = new Map(options.findings.map((f) => [findingKey(f), f]));
	const comments = { ...tally(), added: 0 };
	const bySeverity: Record<string, Tally> = {};
	const byRule: Record<string, Tally> = {};
	for (const change of options.check.changes) {
		if (change.kind === 'added') {
			comments.added += 1;
			continue;
		}
		const outcome = change.kind === 'unchanged' ? 'kept' : change.kind === 'edited' ? 'edited' : 'removed';
		const finding = byKey.get(change.key);
		const path = change.key.replace(/:\d+-\d+$/, '');
		const severity = finding?.severity ?? 'unknown';
		// The checklist item the finding cites (python.performance), else the rule doc of its group.
		const rule = finding?.ruleId ?? options.ruleOfFile(finding?.path ?? path) ?? 'unknown';
		for (const t of [comments, tallyOf(bySeverity, severity), tallyOf(byRule, rule)]) {
			t.drafted += 1;
			t[outcome] += 1;
		}
	}
	const verdicts = options.findings.filter((f) => f.verdict);
	return {
		at: (options.now ?? new Date()).toISOString(),
		project: options.project,
		pr: options.pr,
		revision: options.revision,
		mode: options.pending ? 'pending' : 'submitted',
		event: options.event,
		...(options.suggestedEvent ? { suggestedEvent: options.suggestedEvent } : {}),
		comments,
		summaryEdited: options.check.summaryChange.kind !== 'unchanged',
		bySeverity,
		byRule,
		...(verdicts.length
			? {
					verification: {
						confirmed: verdicts.filter((f) => f.verdict === 'confirmed').length,
						plausible: verdicts.filter((f) => f.verdict === 'plausible').length,
						rejected: verdicts.filter((f) => f.verdict === 'rejected').length,
					},
				}
			: {}),
		...(options.requirements ? { requirements: options.requirements } : {}),
	};
};

const pct = (part: number, whole: number): string => (whole ? `${Math.round((100 * part) / whole)}%` : '—');

const tallyLine = (label: string, t: Tally): string =>
	`- ${label}: ${t.drafted} drafted · kept ${pct(t.kept, t.drafted)} · edited ${pct(t.edited, t.drafted)} · removed ${pct(t.removed, t.drafted)}`;

/** Text report over many published reviews: overall and per severity / rule acceptance. */
export const summarizeMetrics = (records: readonly PublishMetrics[]): string => {
	if (records.length === 0) {
		return 'No published reviews recorded yet. Metrics are written each time a review is published (pending or submitted).';
	}
	const total = tally();
	const bySeverity: Record<string, Tally> = {};
	const byRule: Record<string, Tally> = {};
	let added = 0;
	let summaryEdited = 0;
	let eventChanged = 0;
	const verification = { confirmed: 0, plausible: 0, rejected: 0 };
	const add = (into: Record<string, Tally>, from: Readonly<Record<string, Tally>>) => {
		for (const [key, t] of Object.entries(from)) {
			const target = tallyOf(into, key);
			target.drafted += t.drafted;
			target.kept += t.kept;
			target.edited += t.edited;
			target.removed += t.removed;
		}
	};
	for (const r of records) {
		total.drafted += r.comments.drafted;
		total.kept += r.comments.kept;
		total.edited += r.comments.edited;
		total.removed += r.comments.removed;
		added += r.comments.added;
		if (r.summaryEdited) summaryEdited += 1;
		if (r.suggestedEvent && r.suggestedEvent !== r.event && r.mode === 'submitted') eventChanged += 1;
		add(bySeverity, r.bySeverity);
		add(byRule, r.byRule);
		if (r.verification) {
			verification.confirmed += r.verification.confirmed;
			verification.plausible += r.verification.plausible;
			verification.rejected += r.verification.rejected;
		}
	}
	const noisiest = Object.entries(byRule)
		.filter(([, t]) => t.drafted >= 3)
		.sort(([, a], [, b]) => b.removed / b.drafted - a.removed / a.drafted)
		.slice(0, 5);
	return [
		`Review quality over ${records.length} published review(s) (${records[0]?.at.slice(0, 10)} → ${records.at(-1)?.at.slice(0, 10)})`,
		'',
		tallyLine('Inline comments', total),
		`- Comments the human added: ${added} · summaries rewritten: ${summaryEdited}/${records.length} · verdict changed by the human: ${eventChanged}`,
		verification.confirmed + verification.plausible + verification.rejected
			? `- Verification pass: ${verification.confirmed} confirmed · ${verification.plausible} plausible · ${verification.rejected} rejected before drafting`
			: '',
		'',
		'By severity:',
		...Object.entries(bySeverity).map(([k, t]) => tallyLine(k, t)),
		'',
		'By rule:',
		...Object.entries(byRule)
			.sort(([, a], [, b]) => b.drafted - a.drafted)
			.slice(0, 15)
			.map(([k, t]) => tallyLine(k, t)),
		...(noisiest.length
			? [
					'',
					'Most often removed (rules with ≥3 comments) — candidates to tune:',
					...noisiest.map(([k, t]) => tallyLine(k, t)),
				]
			: []),
	]
		.filter((l, i, all) => l !== '' || all[i - 1] !== '')
		.join('\n');
};

/** Parse metrics.jsonl, skipping corrupt lines. */
export const parseMetricsLog = (text: string): PublishMetrics[] =>
	text
		.split('\n')
		.filter(Boolean)
		.flatMap((line) => {
			try {
				return [JSON.parse(line) as PublishMetrics];
			} catch {
				return [];
			}
		});
