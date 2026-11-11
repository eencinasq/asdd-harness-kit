import type { CommentChange, CommentsCheck, InlineComment, ParsedComments, ReviewEvent } from '../pr-review.types.ts';
import { INLINE_WORD_LIMIT, REVIEW_EVENTS, SUMMARY_WORD_LIMIT } from '../pr-review.types.ts';

const isReviewEvent = (value: string): value is ReviewEvent => (REVIEW_EVENTS as readonly string[]).includes(value);

export const wordCount = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;

export const commentKey = (comment: InlineComment): string =>
	`${comment.path}:${comment.start_line ?? comment.line}-${comment.line}`;

export const similarity = (a: string, b: string): number => {
	if (a === b) return 1;
	if (!a.length || !b.length) return 0;
	const aTokens = new Set(a.split(/\s+/));
	const bTokens = new Set(b.split(/\s+/));
	let overlap = 0;
	for (const token of aTokens) {
		if (bTokens.has(token)) overlap += 1;
	}
	return (2 * overlap) / (aTokens.size + bTokens.size);
};

export const unifiedDiff = (original: string, edited: string): string => {
	const a = original.split('\n');
	const b = edited.split('\n');
	const lines = ['--- original', '+++ edited'];
	const max = Math.max(a.length, b.length);
	for (let i = 0; i < max; i += 1) {
		const left = a[i];
		const right = b[i];
		if (left === right) continue;
		if (left !== undefined) lines.push(`- ${left}`);
		if (right !== undefined) lines.push(`+ ${right}`);
	}
	return lines.join('\n');
};

export const parseCommentsMarkdown = (text: string): ParsedComments => {
	const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
	if (!match) {
		throw new Error('comments.md: missing front-matter (--- ... ---)');
	}
	const metaRaw = match[1] ?? '';
	const body = match[2] ?? '';
	const meta: Record<string, string> = {};
	for (const line of metaRaw.split('\n')) {
		const idx = line.indexOf(':');
		if (idx === -1) continue;
		const key = line.slice(0, idx).trim();
		const value =
			line
				.slice(idx + 1)
				.split('#', 1)[0]
				?.trim() ?? '';
		meta[key] = value;
	}

	const event = meta['event'] ?? '';
	if (!isReviewEvent(event)) {
		throw new Error(`Invalid event '${event}'. Use one of ${REVIEW_EVENTS.join(', ')}`);
	}

	const sections = body.split(/^## +(\w+)\s*$/m);
	let inlineRaw = '';
	let summary = '';
	for (let i = 1; i < sections.length; i += 2) {
		const name = (sections[i] ?? '').toLowerCase();
		const content = sections[i + 1] ?? '';
		if (name === 'inline') inlineRaw = content;
		else if (name === 'summary') summary = content.trim();
	}

	const comments: InlineComment[] = [];
	const parts = inlineRaw.split(/^### +(\S+?):(\d+)(?:-(\d+))?\s*$/m);
	for (let i = 1; i < parts.length; i += 4) {
		const filePath = parts[i] ?? '';
		const start = Number(parts[i + 1]);
		const endRaw = parts[i + 2];
		const cbody = (parts[i + 3] ?? '').trim();
		const end = endRaw ? Number(endRaw) : undefined;
		comments.push({
			path: filePath,
			line: end ?? start,
			side: 'RIGHT',
			body: cbody,
			...(end !== undefined ? { start_line: start, start_side: 'RIGHT' as const } : {}),
		});
	}

	return {
		meta: {
			pr: meta['pr'] ?? '',
			repo: meta['repo'] ?? '',
			head_sha: meta['head_sha'] ?? '',
			event,
			...meta,
		},
		comments,
		summary,
	};
};

export const validateParsedComments = (parsed: ParsedComments): readonly string[] => {
	const warnings: string[] = [];
	for (const comment of parsed.comments) {
		const n = wordCount(comment.body);
		if (n > INLINE_WORD_LIMIT) {
			warnings.push(`${comment.path}:${comment.line} has ${n} words (limit ${INLINE_WORD_LIMIT})`);
		}
		if (!comment.body) {
			warnings.push(`${comment.path}:${comment.line} is empty`);
		}
	}
	const summaryWords = wordCount(parsed.summary);
	if (summaryWords > SUMMARY_WORD_LIMIT) {
		warnings.push(`Summary has ${summaryWords} words (limit ${SUMMARY_WORD_LIMIT})`);
	}
	if (parsed.meta.event === 'REQUEST_CHANGES' && parsed.comments.length === 0 && !parsed.summary) {
		warnings.push('REQUEST_CHANGES without comments or summary');
	}
	return warnings;
};

export const serializeCommentsMarkdown = (parsed: ParsedComments): string => {
	const lines = [
		'---',
		`pr: ${parsed.meta.pr}`,
		`repo: ${parsed.meta.repo}`,
		`head_sha: ${parsed.meta.head_sha}`,
		`event: ${parsed.meta.event}`,
		'---',
		'',
	];
	if (parsed.comments.length > 0) {
		lines.push('## Inline', '');
		for (const comment of parsed.comments) {
			const heading =
				comment.start_line !== undefined
					? `### ${comment.path}:${comment.start_line}-${comment.line}`
					: `### ${comment.path}:${comment.line}`;
			lines.push(heading, comment.body, '');
		}
	}
	lines.push('## Summary', parsed.summary, '');
	return lines.join('\n');
};

export const buildCommentsCheck = (current: ParsedComments, original: ParsedComments | null): CommentsCheck => {
	const warnings = validateParsedComments(current);
	if (!original) {
		return {
			warnings,
			eventChanged: false,
			currentEvent: current.meta.event,
			changes: current.comments.map((c) => ({
				kind: 'added' as const,
				key: commentKey(c),
				currentBody: c.body,
			})),
			summaryChange: { kind: 'added', key: 'summary', currentBody: current.summary },
			hasOriginal: false,
		};
	}

	const oc = new Map(original.comments.map((c) => [commentKey(c), c]));
	const cc = new Map(current.comments.map((c) => [commentKey(c), c]));
	const changes: CommentChange[] = [];

	for (const [key, comment] of oc) {
		if (!cc.has(key)) {
			changes.push({ kind: 'removed', key, originalBody: comment.body });
		}
	}
	for (const [key, comment] of cc) {
		const prev = oc.get(key);
		if (!prev) {
			changes.push({ kind: 'added', key, currentBody: comment.body });
			continue;
		}
		if (prev.body === comment.body) {
			changes.push({
				kind: 'unchanged',
				key,
				currentBody: comment.body,
				originalBody: prev.body,
			});
		} else {
			changes.push({
				kind: 'edited',
				key,
				similarity: similarity(prev.body, comment.body),
				originalBody: prev.body,
				currentBody: comment.body,
				diff: unifiedDiff(prev.body, comment.body),
			});
		}
	}

	const summaryChange: CommentChange =
		original.summary === current.summary
			? {
					kind: 'unchanged',
					key: 'summary',
					originalBody: original.summary,
					currentBody: current.summary,
				}
			: {
					kind: 'edited',
					key: 'summary',
					similarity: similarity(original.summary, current.summary),
					originalBody: original.summary,
					currentBody: current.summary,
					diff: unifiedDiff(original.summary, current.summary),
				};

	return {
		warnings,
		eventChanged: original.meta.event !== current.meta.event,
		previousEvent: original.meta.event,
		currentEvent: current.meta.event,
		changes,
		summaryChange,
		hasOriginal: true,
	};
};

export const findRiskyEdits = (check: CommentsCheck): readonly CommentChange[] => {
	const risky: CommentChange[] = [];
	for (const change of check.changes) {
		if (change.kind === 'removed') risky.push(change);
		if (change.kind === 'edited' && (change.similarity ?? 1) < 0.55) risky.push(change);
	}
	if (check.summaryChange.kind === 'edited' && (check.summaryChange.similarity ?? 1) < 0.45) {
		risky.push(check.summaryChange);
	}
	return risky;
};
