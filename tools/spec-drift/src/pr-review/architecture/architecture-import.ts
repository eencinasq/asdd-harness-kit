/** Pure merge of resolved architecture findings into an existing comments.md draft. */
import { type ReviewFinding, suggestEvent } from '../engine/index.ts';
import {
	INLINE_WORD_LIMIT,
	type InlineComment,
	type ParsedComments,
	type ReviewEvent,
	type ReviewState,
} from '../pr-review.types.ts';

export type ArchitectureImport = {
	readonly comments: ParsedComments;
	readonly addedInline: number;
	readonly addedToSummary: number;
};

const truncateWords = (text: string, limit: number): string => {
	const words = text.split(/\s+/).filter(Boolean);
	return words.length > limit ? `${words.slice(0, limit).join(' ')}…` : text;
};

/**
 * Add findings as inline comments (low severity goes to the summary instead), skipping duplicates,
 * and escalate the review event when a critical/high finding is added.
 */
export const mergeArchitectureComments = (options: {
	readonly pr: number;
	readonly state: ReviewState;
	readonly existing: ParsedComments | undefined;
	readonly findings: readonly ReviewFinding[];
}): ArchitectureImport => {
	const { pr, state, findings } = options;
	const existing: ParsedComments = options.existing ?? {
		meta: {
			pr: String(pr),
			repo: state.repo || 'unknown/unknown',
			head_sha: state.current.head_sha,
			event: suggestEvent(findings) as ReviewEvent,
		},
		comments: [],
		summary: '',
	};

	const keys = new Set(existing.comments.map((c) => `${c.path}:${c.line}:${c.body.slice(0, 80)}`));
	const inline: InlineComment[] = [];
	const summaryLines: string[] = [];
	for (const f of findings) {
		const line = f.endLine || f.startLine;
		const body = truncateWords(f.content.trim(), INLINE_WORD_LIMIT);
		const key = `${f.path}:${line}:${body.slice(0, 80)}`;
		if (keys.has(key)) continue;
		if (f.severity === 'low') {
			summaryLines.push(`- \`${f.path}:${f.startLine}\` — ${body}`);
			continue;
		}
		inline.push({
			path: f.path,
			line,
			side: 'RIGHT',
			body,
			...(f.endLine && f.endLine !== f.startLine ? { start_line: f.startLine, start_side: 'RIGHT' as const } : {}),
		});
		keys.add(key);
	}

	const summaryParts = [existing.summary.trim()].filter(Boolean);
	if (summaryLines.length) summaryParts.push('', '**Architecture (minor)**', ...summaryLines);

	const event: ReviewEvent = findings.some((f) => f.severity === 'critical' || f.severity === 'high')
		? 'REQUEST_CHANGES'
		: existing.meta.event === 'APPROVE' && (inline.length > 0 || summaryLines.length > 0)
			? 'COMMENT'
			: existing.meta.event;

	return {
		comments: {
			meta: {
				...existing.meta,
				pr: String(pr),
				repo: state.repo || existing.meta.repo,
				head_sha: state.current.head_sha || existing.meta.head_sha,
				event,
			},
			comments: [...existing.comments, ...inline],
			summary: summaryParts.join('\n').trim() || `Imported ${inline.length} architecture finding(s).`,
		},
		addedInline: inline.length,
		addedToSummary: summaryLines.length,
	};
};
