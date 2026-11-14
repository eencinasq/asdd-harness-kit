/**
 * Convert structured findings into spec-drift comments.md / report pieces.
 */
import { serializeCommentsMarkdown } from '../comments/comments-format.ts';
import type { ReviewEvent } from '../pr-review.types.ts';
import type { CoverageGap, ExcludeReason, ReviewFinding } from './types.ts';

/** Skip reasons that leave code of the PR unreviewed (so the review cannot suggest APPROVE). */
export const GAP_REASONS: readonly ExcludeReason[] = ['too-large', 'secret'];

const GAP_LABEL: Partial<Record<ExcludeReason, string>> = {
	'too-large': 'too large to review',
	secret: 'secrets file, not sent to the reviewer',
};

/** Files the review could not look at (from the skip list). */
export const coverageGaps = (skipped: readonly CoverageGap[] | undefined): CoverageGap[] =>
	(skipped ?? []).filter((s) => GAP_REASONS.includes(s.reason));

const severityRank = (s: ReviewFinding['severity']): number => {
	switch (s) {
		case 'critical':
			return 0;
		case 'high':
			return 1;
		case 'medium':
			return 2;
		case 'low':
			return 3;
		default:
			return 2;
	}
};

/** critical / high / medium → inline; low and file-level findings (no line) → summary. */
const isInline = (f: ReviewFinding): boolean => f.startLine > 0 && severityRank(f.severity) <= 2;

const formatInlineBody = (f: ReviewFinding): string => {
	const bits = [f.content.trim()];
	if (f.suggestionCode?.trim()) {
		bits.push('', '```suggestion', f.suggestionCode.trimEnd(), '```');
	}
	return bits.join('\n');
};

/**
 * Quality gate for the suggested event: critical / high findings → REQUEST_CHANGES; APPROVE only
 * when there are no findings **and** every file of the PR was reviewed; COMMENT otherwise.
 */
export const suggestEvent = (findings: readonly ReviewFinding[], gaps: readonly CoverageGap[] = []): ReviewEvent => {
	if (findings.some((f) => f.severity === 'critical' || f.severity === 'high')) {
		return 'REQUEST_CHANGES';
	}
	if (findings.length === 0 && gaps.length === 0) return 'APPROVE';
	return 'COMMENT';
};

const gapLines = (gaps: readonly CoverageGap[]): string[] =>
	gaps.length
		? [
				'',
				'**Not reviewed** (check these by hand):',
				...gaps.map((g) => `- \`${g.path}\` — ${GAP_LABEL[g.reason] ?? g.reason}`),
			]
		: [];

export const findingsToCommentsMarkdown = (options: {
	readonly pr: number;
	readonly repo: string;
	readonly headSha: string;
	readonly findings: readonly ReviewFinding[];
	readonly event?: ReviewEvent;
	readonly summaryExtra?: string;
	readonly gaps?: readonly CoverageGap[];
}): string => {
	const gaps = options.gaps ?? [];
	const event = options.event ?? suggestEvent(options.findings, gaps);
	const inlines = options.findings.filter(isInline);
	const minors = options.findings.filter((f) => !isInline(f));

	const summaryParts = [
		options.summaryExtra?.trim() || `Automated structured findings: ${options.findings.length} item(s).`,
	];
	if (minors.length) {
		summaryParts.push('', '**Minor / nitpicks**');
		for (const m of minors) {
			const where = m.startLine > 0 ? `${m.path}:${m.startLine}` : m.path;
			summaryParts.push(`- \`${where}\` — ${m.content.trim().replace(/\s*\n\s*/g, ' ')}`);
		}
	}
	summaryParts.push(...gapLines(gaps));

	return serializeCommentsMarkdown({
		meta: {
			pr: String(options.pr),
			repo: options.repo,
			head_sha: options.headSha,
			event,
		},
		comments: inlines.map((f) => ({
			path: f.path,
			line: f.endLine || f.startLine,
			side: 'RIGHT' as const,
			body: formatInlineBody(f),
			...(f.endLine && f.endLine !== f.startLine ? { start_line: f.startLine, start_side: 'RIGHT' as const } : {}),
		})),
		summary: summaryParts.join('\n'),
	});
};

export const findingsToReportSection = (
	findings: readonly ReviewFinding[],
	gaps: readonly CoverageGap[] = [],
): string => {
	const bySev = {
		critical: findings.filter((f) => f.severity === 'critical' || f.severity === 'high'),
		medium: findings.filter((f) => f.severity === 'medium' || !f.severity),
		low: findings.filter((f) => f.severity === 'low'),
	};
	const render = (list: readonly ReviewFinding[]): string =>
		list.length
			? list
					.map(
						(f) =>
							`- **[${f.startLine > 0 ? `${f.path}:${f.startLine}` : f.path}]** (${f.category ?? 'other'}${f.ruleId ? ` · ${f.ruleId}` : ''}${f.source === 'check' ? ' · deterministic check' : ''}) ${f.content.trim()}`,
					)
					.join('\n')
			: '- —';

	return [
		'## Findings',
		'### Critical / major',
		render(bySev.critical),
		'',
		'### Medium',
		render(bySev.medium),
		'',
		'### Minor',
		render(bySev.low),
		...(gaps.length
			? ['', '### Not reviewed', ...gaps.map((g) => `- \`${g.path}\` — ${GAP_LABEL[g.reason] ?? g.reason}`)]
			: []),
	].join('\n');
};
