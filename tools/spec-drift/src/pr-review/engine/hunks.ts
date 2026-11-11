/** Hunk parsing: line numbers on each side of a file diff. */
import type { Hunk, HunkLine } from './types.ts';

const HUNK_HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

const splitDiffLines = (text: string): string[] =>
	text.split('\n').map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));

export const parseHunks = (rawDiffText: string): readonly Hunk[] => {
	const lines = splitDiffLines(rawDiffText);
	const hunks: Hunk[] = [];
	let current: {
		oldStart: number;
		oldCount: number;
		newStart: number;
		newCount: number;
		lines: HunkLine[];
	} | null = null;
	// Lines still expected by the hunk header: a hunk ends when both are used up, so whatever follows
	// (before the next header) is never taken for diff lines.
	let oldLeft = 0;
	let newLeft = 0;

	const flush = (): void => {
		if (!current) return;
		hunks.push({ ...current, lines: [...current.lines] });
		current = null;
	};

	for (const line of lines) {
		const match = HUNK_HEADER_RE.exec(line);
		if (match) {
			flush();
			current = {
				oldStart: Number(match[1]),
				oldCount: match[2] ? Number(match[2]) : 1,
				newStart: Number(match[3]),
				newCount: match[4] ? Number(match[4]) : 1,
				lines: [],
			};
			oldLeft = current.oldCount;
			newLeft = current.newCount;
			continue;
		}
		if (!current) continue;
		if (line.startsWith('\\ No newline at end of file')) continue;
		if (line.startsWith('diff --git ')) break;
		if (oldLeft <= 0 && newLeft <= 0) continue;

		if (line.startsWith('+')) {
			current.lines.push({ type: 'added', content: line.slice(1) });
			newLeft -= 1;
		} else if (line.startsWith('-')) {
			current.lines.push({ type: 'deleted', content: line.slice(1) });
			oldLeft -= 1;
		} else {
			const content = line.startsWith(' ') ? line.slice(1) : line;
			current.lines.push({ type: 'context', content });
			oldLeft -= 1;
			newLeft -= 1;
		}
	}
	flush();
	return hunks;
};

/**
 * RIGHT-side line numbers GitHub accepts for inline review comments: added and context lines, or
 * only added ones ("clean as you code": comment on what the PR changed).
 */
export const rightSideLines = (
	rawDiffText: string,
	options: { readonly addedOnly?: boolean } = {},
): readonly number[] => {
	const lines = new Set<number>();
	for (const hunk of parseHunks(rawDiffText)) {
		let newLine = hunk.newStart;
		for (const hl of hunk.lines) {
			if (hl.type === 'deleted') continue;
			if (!options.addedOnly || hl.type === 'added') lines.add(newLine);
			newLine += 1;
		}
	}
	return [...lines].toSorted((a, b) => a - b);
};

type HunkText = { readonly text: string; readonly newStart: number; readonly newEnd: number };

/**
 * Cut one hunk into consecutive hunks of at most `maxChars`, each with a valid header (a 3,000-line
 * new file is one hunk; this lets it be reviewed in parts).
 */
const splitHunk = (text: string, maxChars: number): HunkText[] => {
	const [head = '', ...body] = text.replace(/\n$/, '').split('\n');
	const match = HUNK_HEADER_RE.exec(head);
	const single = (): HunkText[] => {
		const newStart = Number(match?.[3] ?? 1);
		const newCount = match?.[4] !== undefined ? Number(match[4]) : 1;
		return [{ text, newStart, newEnd: Math.max(newStart, newStart + newCount - 1) }];
	};
	if (!match || text.length <= maxChars) return single();
	const pieces: HunkText[] = [];
	let oldLine = Number(match[1]);
	let newLine = Number(match[3]);
	let lines: string[] = [];
	let size = 0;
	let pieceOld = oldLine;
	let pieceNew = newLine;
	let oldCount = 0;
	let newCount = 0;
	const flush = () => {
		if (lines.length === 0) return;
		pieces.push({
			text: `@@ -${pieceOld},${oldCount} +${pieceNew},${newCount} @@\n${lines.join('\n')}\n`,
			newStart: pieceNew,
			newEnd: Math.max(pieceNew, pieceNew + newCount - 1),
		});
		lines = [];
		size = 0;
		pieceOld = oldLine;
		pieceNew = newLine;
		oldCount = 0;
		newCount = 0;
	};
	for (const line of body) {
		if (size + line.length + 1 > maxChars && !line.startsWith('\\')) flush();
		lines.push(line);
		size += line.length + 1;
		if (line.startsWith('\\')) continue;
		if (!line.startsWith('+')) {
			oldLine += 1;
			oldCount += 1;
		}
		if (!line.startsWith('-')) {
			newLine += 1;
			newCount += 1;
		}
	}
	flush();
	return pieces;
};

/**
 * A file diff cut at its hunk headers: the header lines, then each hunk's text and new-side span.
 * With `maxHunkChars`, oversized hunks are cut further (deterministically, so callers agree).
 */
export const splitFileDiff = (
	rawDiffText: string,
	options: { readonly maxHunkChars?: number } = {},
): { readonly header: string; readonly hunks: readonly HunkText[] } => {
	const parts = rawDiffText.split(/^(?=@@ )/m);
	const header = parts[0]?.startsWith('@@ ') ? '' : (parts.shift() ?? '');
	const max = options.maxHunkChars ?? Number.POSITIVE_INFINITY;
	return { header, hunks: parts.flatMap((text) => splitHunk(text, max)) };
};
