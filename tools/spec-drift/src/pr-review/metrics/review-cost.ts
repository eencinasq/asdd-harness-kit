/**
 * Review cost and time (spec-drift-demand REQ-003, ADR-003), from the server's side: each review tool call appends
 * `{ tool, chars, at }` to the review's `calls.jsonl`; at publish the calls since the last `pr_review_start` become the
 * cost. Model tokens are not visible to the server: `estTokens` is the returned text at 4 characters per token. Pure.
 */

export type CallRecord = { readonly tool: string; readonly chars: number; readonly at: string };

export type ReviewCost = {
	/** Minutes from the last pr_review_start to the publish. */
	readonly minutes: number | null;
	readonly calls: number;
	readonly byTool: Readonly<Record<string, number>>;
	/** Characters of text the review tools returned. */
	readonly chars: number;
	/** chars / 4: an estimate of the tokens the host read from this server. */
	readonly estTokens: number;
};

export const CALLS_FILE = 'calls.jsonl';
export const CHARS_PER_TOKEN = 4;

export const parseCalls = (text: string): CallRecord[] =>
	text
		.split('\n')
		.filter(Boolean)
		.flatMap((line) => {
			try {
				const r = JSON.parse(line) as CallRecord;
				return typeof r.tool === 'string' && typeof r.chars === 'number' ? [r] : [];
			} catch {
				return [];
			}
		});

export const reviewCost = (calls: readonly CallRecord[], publishedAt: Date): ReviewCost => {
	const lastStart = calls.map((c) => c.tool).lastIndexOf('pr_review_start');
	const run = lastStart >= 0 ? calls.slice(lastStart) : calls;
	const byTool: Record<string, number> = {};
	for (const c of run) byTool[c.tool] = (byTool[c.tool] ?? 0) + 1;
	const chars = run.reduce((n, c) => n + c.chars, 0);
	const started = run[0] ? Date.parse(run[0].at) : Number.NaN;
	return {
		minutes: Number.isNaN(started) ? null : Math.round(((publishedAt.getTime() - started) / 60_000) * 10) / 10,
		calls: run.length,
		byTool,
		chars,
		estTokens: Math.round(chars / CHARS_PER_TOKEN),
	};
};

const median = (values: readonly number[]): number | null => {
	if (!values.length) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
};

/** The cost line of pr_review_metrics; empty when no review recorded a cost. */
export const costSummary = (costs: readonly (ReviewCost | undefined)[]): string => {
	const known = costs.filter((c): c is ReviewCost => Boolean(c));
	if (!known.length) return '';
	const minutes = median(known.map((c) => c.minutes).filter((m): m is number => m !== null));
	return `- Cost (median of ${known.length} review(s)): ${minutes === null ? '—' : `${minutes} min`} · ${median(known.map((c) => c.calls))} tool calls · ~${median(known.map((c) => c.estTokens))} tokens of tool output (estimate: characters / ${CHARS_PER_TOKEN})`;
};
