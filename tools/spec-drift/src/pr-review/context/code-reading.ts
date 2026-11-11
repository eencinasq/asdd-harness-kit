/**
 * Output of pr_review_read_file / pr_review_search. Small pages on purpose: the agent asks for more
 * only when it needs it, so a review does not pay for whole files it only glanced at.
 */

/** Lines per pr_review_read_file page. */
export const MAX_READ_LINES = 200;
/** Matches per pr_review_search call. */
export const MAX_SEARCH_LINES = 50;
/** Longer match lines (minified code, data) are cut. */
const MAX_MATCH_CHARS = 300;

/** One page of a file with line numbers, and how to get the next page. */
export const fileExcerpt = (options: {
	readonly file: string;
	readonly sha: string;
	readonly text: string;
	readonly startLine?: number | undefined;
	readonly endLine?: number | undefined;
	readonly maxLines?: number;
}): string => {
	const max = options.maxLines ?? MAX_READ_LINES;
	const lines = options.text.split('\n');
	const from = Math.max(1, options.startLine ?? 1);
	const to = Math.min(lines.length, options.endLine ?? from + max - 1, from + max - 1);
	const body = lines
		.slice(from - 1, to)
		.map((line, i) => `${String(from + i).padStart(5)}  ${line}`)
		.join('\n');
	const more = to < lines.length ? `\n… ${lines.length - to} more line(s): call again with startLine=${to + 1}` : '';
	return `${options.file} @ ${options.sha.slice(0, 8)} (lines ${from}-${to} of ${lines.length})\n${body}${more}`;
};

/** git grep matches as the model reads them. */
export const searchResult = (options: {
	readonly pattern: string;
	readonly sha: string;
	readonly lines: readonly string[];
	readonly truncated: boolean;
}): string => {
	const at = options.sha.slice(0, 8);
	const pattern = JSON.stringify(options.pattern);
	if (options.lines.length === 0) return `No match for ${pattern} at ${at}.`;
	return [
		`${options.lines.length}${options.truncated ? '+' : ''} match(es) for ${pattern} at ${at} (path:line:text):`,
		...options.lines.map((l) => (l.length > MAX_MATCH_CHARS ? `${l.slice(0, MAX_MATCH_CHARS)}…` : l)),
		options.truncated ? `… more matches: narrow the pattern or pass paths.` : '',
	]
		.filter(Boolean)
		.join('\n');
};
