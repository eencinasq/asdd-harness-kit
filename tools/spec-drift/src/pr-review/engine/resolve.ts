/**
 * Anchor findings on lines GitHub accepts (RIGHT side of the diff). Precision first:
 *
 * 1. **The quoted code decides** (`existingCode`): models quote code more reliably than they count
 *    lines. When the quote appears in the diff, the finding goes there; the line number only picks
 *    between several matches.
 * 2. Otherwise the given line, if GitHub accepts it. A range is trimmed to the lines the diff shows.
 * 3. Otherwise a nearby commentable line (±3) — reported as moved.
 * 4. Otherwise the finding is **not anchored** (the caller reports it). It is never pinned to an
 *    unrelated line.
 *
 * A finding whose anchor moved or whose range was trimmed loses its `suggestionCode`: a GitHub
 * suggestion replaces exactly the commented lines, so applying it elsewhere would corrupt the file.
 * Findings on a renamed file's old path get the new path.
 */
import { createHash } from 'node:crypto';

import { parseHunks } from './hunks.ts';
import { effectivePath } from './parse-diff.ts';
import type { FileDiff, ReviewFinding } from './types.ts';

/** How far a finding without a matching quote may move to the nearest commentable line. */
export const MAX_SNAP_LINES = 3;

const normalizeLine = (line: string): string => line.replace(/\s+/g, ' ').trim();

const splitAndNormalize = (code: string): string[] =>
	code
		.split('\n')
		.map(normalizeLine)
		.filter((l) => l.length > 0);

type IndexedLine = { readonly lineNum: number; readonly content: string; readonly added: boolean };

/** The new side of a file diff, per hunk (what GitHub lets you comment on). */
type NewSide = {
	readonly hunks: readonly (readonly IndexedLine[])[];
	readonly byLine: ReadonlyMap<number, IndexedLine>;
};

const newSides = new WeakMap<FileDiff, NewSide>();

const newSideOf = (diff: FileDiff): NewSide => {
	const cached = newSides.get(diff);
	if (cached) return cached;
	const hunks = parseHunks(diff.diff).map((hunk) => {
		const out: IndexedLine[] = [];
		let newLine = hunk.newStart;
		for (const hl of hunk.lines) {
			if (hl.type === 'deleted') continue;
			out.push({ lineNum: newLine, content: normalizeLine(hl.content), added: hl.type === 'added' });
			newLine += 1;
		}
		return out;
	});
	const byLine = new Map(hunks.flat().map((l) => [l.lineNum, l]));
	const side = { hunks, byLine };
	newSides.set(diff, side);
	return side;
};

export type AnchorOptions = {
	/** Only lines the PR added are commentable ("clean as you code"); context lines are not. */
	readonly addedLinesOnly?: boolean;
};

const commentable = (side: NewSide, line: number, options: AnchorOptions): boolean => {
	const l = side.byLine.get(line);
	return l !== undefined && (!options.addedLinesOnly || l.added);
};

/** Every place where `needle` appears as consecutive new-side lines of one hunk. */
const quoteMatches = (side: NewSide, needle: readonly string[]): { start: number; end: number }[] => {
	const found: { start: number; end: number }[] = [];
	if (needle.length === 0) return found;
	for (const hunk of side.hunks) {
		for (let i = 0; i + needle.length <= hunk.length; i += 1) {
			if (needle.every((text, j) => hunk[i + j]?.content === text)) {
				found.push({ start: hunk[i]?.lineNum ?? 0, end: hunk[i + needle.length - 1]?.lineNum ?? 0 });
			}
		}
	}
	return found;
};

/** Stable id of a finding across reviews: path + rule + the code it is anchored on (not the line number). */
export const findingFingerprint = (finding: ReviewFinding, codeLines: readonly string[]): string =>
	createHash('sha256')
		.update([finding.path, finding.ruleId ?? finding.category ?? '', ...codeLines].join('\n'))
		.digest('hex')
		.slice(0, 16);

export type AnchorResult =
	| { readonly ok: true; readonly finding: ReviewFinding; readonly note?: string }
	| { readonly ok: false; readonly reason: string };

/** Anchor one finding on its file's diff (see the module comment for the order of preference). */
export const anchorFinding = (finding: ReviewFinding, diff: FileDiff, options: AnchorOptions = {}): AnchorResult => {
	const side = newSideOf(diff);
	const path = effectivePath(diff);
	const wanted = finding.startLine > 0 ? finding.startLine : undefined;
	const notes: string[] = [];
	if (path !== finding.path) notes.push(`path ${finding.path} → ${path} (renamed)`);

	const place = (start: number, end: number, moved: boolean, note?: string): AnchorResult => {
		if (note) notes.push(note);
		const code = [];
		for (let line = start; line <= end; line += 1) code.push(side.byLine.get(line)?.content ?? '');
		const { suggestionCode, ...rest } = finding;
		const keepSuggestion = !moved && suggestionCode !== undefined;
		if (moved && suggestionCode?.trim()) notes.push('suggestion dropped: it would replace different lines');
		const placed: ReviewFinding = {
			...rest,
			...(keepSuggestion ? { suggestionCode } : {}),
			path,
			startLine: start,
			endLine: end,
		};
		return {
			ok: true,
			finding: { ...placed, fingerprint: findingFingerprint(placed, code) },
			...(notes.length ? { note: notes.join('; ') } : {}),
		};
	};

	// 1. The quoted code decides.
	const quote = finding.existingCode ? splitAndNormalize(finding.existingCode) : [];
	const matches = quoteMatches(side, quote).filter(
		(m) => !options.addedLinesOnly || commentable(side, m.start, options),
	);
	if (matches.length > 0) {
		const best = matches.reduce((a, b) =>
			wanted !== undefined && Math.abs(b.start - wanted) < Math.abs(a.start - wanted) ? b : a,
		);
		const requestedEnd = finding.endLine > 0 ? finding.endLine : wanted;
		const moved = wanted !== undefined && (best.start !== wanted || best.end !== requestedEnd);
		return place(
			best.start,
			best.end,
			moved,
			moved ? `anchored on the quoted code at line ${best.start} (given ${wanted})` : undefined,
		);
	}
	const quoteMissing = quote.length > 0;

	// 2. The given line, trimmed to what the diff shows.
	if (wanted !== undefined && commentable(side, wanted, options)) {
		const requestedEnd = Math.max(wanted, finding.endLine > 0 ? finding.endLine : wanted);
		let end = wanted;
		while (end < requestedEnd && commentable(side, end + 1, options)) end += 1;
		const trimmed = end < requestedEnd;
		return place(
			wanted,
			end,
			trimmed || quoteMissing,
			[
				trimmed ? `range ${wanted}-${requestedEnd} trimmed to ${wanted}-${end} (the rest is not in the diff)` : '',
				quoteMissing ? 'the quoted code is not in the diff; kept the given line' : '',
			]
				.filter(Boolean)
				.join('; ') || undefined,
		);
	}

	// 3. A nearby commentable line.
	if (wanted !== undefined) {
		for (let distance = 1; distance <= MAX_SNAP_LINES; distance += 1) {
			for (const line of [wanted - distance, wanted + distance]) {
				if (commentable(side, line, options)) {
					return place(line, line, true, `line ${wanted} is not in the diff; moved to ${line}`);
				}
			}
		}
	}

	// 4. Not anchored: never guess.
	return {
		ok: false,
		reason: quoteMissing
			? 'the quoted code is not in the diff'
			: wanted === undefined
				? 'no line and no quoted code (existingCode)'
				: `line ${wanted} is not in the diff`,
	};
};

/** Backwards-compatible form: the anchored finding, or null. */
export const resolveFindingOnDiff = (
	finding: ReviewFinding,
	diff: FileDiff,
	options: AnchorOptions = {},
): ReviewFinding | null => {
	const result = anchorFinding(finding, diff, options);
	return result.ok ? result.finding : null;
};

export const resolveFindings = (
	findings: readonly ReviewFinding[],
	diffs: readonly FileDiff[],
	options: AnchorOptions = {},
): {
	readonly resolved: readonly ReviewFinding[];
	readonly unresolved: readonly ReviewFinding[];
	/** Why each unresolved finding could not be anchored (same order as `unresolved`). */
	readonly reasons: readonly string[];
	/** What changed about anchored findings (moved, trimmed, renamed, suggestion dropped). */
	readonly notes: readonly string[];
} => {
	const byPath = new Map<string, FileDiff>();
	for (const d of diffs) {
		const path = effectivePath(d);
		if (path && path !== '/dev/null') byPath.set(path, d);
		if (d.oldPath && d.oldPath !== '/dev/null' && !byPath.has(d.oldPath)) byPath.set(d.oldPath, d);
	}

	const resolved: ReviewFinding[] = [];
	const unresolved: ReviewFinding[] = [];
	const reasons: string[] = [];
	const notes: string[] = [];
	for (const finding of findings) {
		const diff = byPath.get(finding.path);
		if (!diff) {
			unresolved.push(finding);
			reasons.push('the file is not in the diff');
			continue;
		}
		const result = anchorFinding(finding, diff, options);
		if (result.ok) {
			resolved.push(result.finding);
			if (result.note) notes.push(`${finding.path}:${finding.startLine || '?'} — ${result.note}`);
		} else {
			unresolved.push(finding);
			reasons.push(result.reason);
		}
	}
	return { resolved, unresolved, reasons, notes };
};
