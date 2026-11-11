/**
 * Context the reviewer gets on top of the rules (pure): the group's own diff, comments already on
 * the PR (so the review adds, not repeats), and on re-reviews what changed since last time.
 */
import { similarity } from '../comments/comments-format.ts';
import { GROUP_DIFF_BUDGET } from '../engine/bundle.ts';
import { splitFileDiff } from '../engine/hunks.ts';
import type { LineSpan, ReviewFinding } from '../engine/types.ts';
import type { InlineComment } from '../pr-review.types.ts';

/**
 * Per-group diff budget (~5k tokens). Beyond it whole files are left out and named, and the agent
 * reads them with pr_review_read_file only if it needs to.
 */
export const MAX_GROUP_DIFF_CHARS = GROUP_DIFF_BUDGET;

const sectionPath = (section: string): string => {
	const header = /^diff --git a\/(.+?) b\/(.+?)$/m.exec(section);
	return header?.[2] ?? header?.[1] ?? '';
};

/** The `diff --git` sections of `files`, wrapped as untrusted data and cut between files. */
export const diffForFiles = (
	diff: string,
	files: readonly string[],
	maxChars = MAX_GROUP_DIFF_CHARS,
	span?: LineSpan,
): string => {
	const wanted = new Set(files);
	const sections = diff
		.split(/^(?=diff --git )/m)
		.filter((section) => {
			const header = /^diff --git a\/(.+?) b\/(.+?)$/m.exec(section);
			return header ? wanted.has(header[2] ?? '') || wanted.has(header[1] ?? '') : false;
		})
		.map((section) => (span ? hunksInSpan(section, span, maxChars) : section));
	const shown: string[] = [];
	const left: string[] = [];
	let size = 0;
	for (const section of sections) {
		if (size + section.length <= maxChars) {
			shown.push(section);
			size += section.length;
		} else if (shown.length === 0) {
			// One file larger than the budget: its first lines, cut at a line end.
			const cut = section.slice(0, maxChars);
			shown.push(cut.slice(0, Math.max(cut.lastIndexOf('\n'), 0)));
			size = maxChars;
			left.push(`${sectionPath(section)} (rest of the file)`);
		} else {
			left.push(sectionPath(section));
		}
	}
	const text = shown.join('').trimEnd();
	if (!text) return '';
	const note = left.length
		? `\n[diff budget reached — not shown: ${left.join(', ')}. Read them with pr_review_read_file.]`
		: '';
	return `<diff files="${files.length}" source="untrusted">\n${text}${note}\n</diff>`;
};

/** Keep only the hunks of a file section that overlap `span` (one part of a split file). */
const hunksInSpan = (section: string, span: LineSpan, maxChars: number): string => {
	const { header, hunks } = splitFileDiff(section, { maxHunkChars: maxChars });
	return (
		header +
		hunks
			.filter((h) => h.newEnd >= span.start && h.newStart <= span.end)
			.map((h) => h.text)
			.join('')
	);
};

/** A review comment already on the PR (from any reviewer). */
export type ExistingComment = {
	readonly path: string;
	readonly line: number;
	readonly body: string;
	readonly author: string;
};

export const existingCommentsSection = (comments: readonly ExistingComment[]): string =>
	comments.length
		? [
				`## Comments already on the PR (${comments.length})`,
				'Do not repeat these. Add a finding only if it says something new; you may note where you agree.',
				'<existing-comments source="untrusted">',
				...comments
					.slice(0, 40)
					.map((c) => `- ${c.path}:${c.line} (@${c.author}): ${c.body.replace(/\s+/g, ' ').slice(0, 200)}`),
				'</existing-comments>',
			].join('\n')
		: '';

/** Drop findings that restate a comment already on the same lines. */
export const withoutDuplicates = (
	findings: readonly ReviewFinding[],
	existing: readonly ExistingComment[],
): { readonly kept: ReviewFinding[]; readonly duplicates: { finding: ReviewFinding; of: ExistingComment }[] } => {
	const kept: ReviewFinding[] = [];
	const duplicates: { finding: ReviewFinding; of: ExistingComment }[] = [];
	for (const finding of findings) {
		const of = existing.find(
			(c) =>
				c.path === finding.path &&
				c.line >= finding.startLine - 3 &&
				c.line <= (finding.endLine || finding.startLine) + 3 &&
				similarity(c.body, finding.content) >= 0.5,
		);
		if (of) duplicates.push({ finding, of });
		else kept.push(finding);
	}
	return { kept, duplicates };
};

/** Re-review: what changed since the reviewed head, and the previous inline comments to re-check. */
export const reReviewSection = (options: {
	readonly previousHeadSha: string;
	readonly changedSinceLastReview?: readonly string[];
	readonly previousComments: readonly InlineComment[];
}): string => {
	const lines = ['## Re-review', `Previous review at \`${options.previousHeadSha.slice(0, 8)}\`.`];
	if (options.changedSinceLastReview) {
		lines.push(
			options.changedSinceLastReview.length
				? `Changed since then (focus here; elsewhere keep the previous findings unless still wrong): ${options.changedSinceLastReview.slice(0, 60).join(', ')}`
				: 'No file changed since the previous review head.',
		);
	} else {
		lines.push('Could not compute what changed since then (history rewritten?) — review everything.');
	}
	if (options.previousComments.length) {
		lines.push(
			'',
			'Previous inline comments — for each, say in the summary whether it is addressed:',
			...options.previousComments
				.slice(0, 40)
				.map((c) => `- ${c.path}:${c.line}: ${c.body.replace(/\s+/g, ' ').slice(0, 160)}`),
		);
	}
	return lines.join('\n');
};

/**
 * What changed since the previous review of this PR, by finding fingerprint (path + rule + anchored
 * code — stable when lines move): new, still open, and gone (fixed, or no longer reported).
 */
export const sinceLastReviewSection = (
	current: readonly ReviewFinding[],
	previous: readonly ReviewFinding[] | undefined,
): string => {
	if (!previous) return '';
	const before = new Map(previous.filter((f) => f.fingerprint).map((f) => [f.fingerprint, f]));
	const now = new Set(current.map((f) => f.fingerprint).filter(Boolean));
	const fresh = current.filter((f) => !f.fingerprint || !before.has(f.fingerprint));
	const open = current.filter((f) => f.fingerprint && before.has(f.fingerprint));
	const gone = [...before.values()].filter((f) => !now.has(f.fingerprint));
	const item = (f: ReviewFinding) =>
		`- \`${f.startLine > 0 ? `${f.path}:${f.startLine}` : f.path}\` ${f.content.trim().replace(/\s+/g, ' ').slice(0, 120)}`;
	return [
		'## Since the last review',
		`${fresh.length} new · ${open.length} still open · ${gone.length} gone (fixed or no longer reported).`,
		...(open.length ? ['', '**Still open**', ...open.map(item)] : []),
		...(gone.length ? ['', '**Gone**', ...gone.map(item)] : []),
	].join('\n');
};
