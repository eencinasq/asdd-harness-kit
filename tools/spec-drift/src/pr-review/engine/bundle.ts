/**
 * Deterministic file bundling: group by resolved rule doc first, then:
 *
 * - **Size-aware.** A group holds files up to a diff budget (what the agent is shown at once), not a
 *   fixed file count, so no file of a group is cut off.
 * - **Locality.** Within a rule, files are taken in path order, so a directory (a feature) tends to
 *   stay in one group.
 * - **Large files are split, not skipped.** A file whose diff exceeds the budget becomes several
 *   groups, each with a run of hunks (`span` = the new-side lines it covers).
 * - Test files (tests checklist) come last: production code first.
 */
import { splitFileDiff } from './hunks.ts';
import { effectivePath } from './parse-diff.ts';
import { loadSystemRules, TESTS_DOC } from './system-rules.ts';
import type { FileDiff, FileGroup, LineSpan } from './types.ts';

/** Diff characters shown to the agent per group (~5k tokens). */
export const GROUP_DIFF_BUDGET = 20_000;
/** Upper bound of files per group, even when they are small. */
const MAX_FILES_PER_GROUP = 10;

export type BundleOptions = {
	readonly reviewTests?: boolean;
	readonly disable?: readonly string[];
	readonly budget?: number;
};

type Unit = {
	readonly diff: FileDiff;
	readonly chars: number;
	readonly span?: LineSpan;
	readonly part?: { readonly index: number; readonly total: number };
};

/** One file → one unit, or one unit per run of hunks when the file is over budget. */
const unitsOf = (diff: FileDiff, budget: number): Unit[] => {
	if (diff.diff.length <= budget) return [{ diff, chars: diff.diff.length }];
	const { header, hunks } = splitFileDiff(diff.diff, { maxHunkChars: budget });
	if (hunks.length === 0) return [{ diff, chars: diff.diff.length }];
	type Hunk = (typeof hunks)[number];
	const runs: Hunk[][] = [];
	let run: Hunk[] = [];
	let size = header.length;
	for (const hunk of hunks) {
		if (run.length > 0 && size + hunk.text.length > budget) {
			runs.push(run);
			run = [];
			size = header.length;
		}
		run.push(hunk);
		size += hunk.text.length;
	}
	if (run.length) runs.push(run);
	if (runs.length === 1) return [{ diff, chars: diff.diff.length }];
	return runs.map((r, index) => ({
		diff,
		chars: header.length + r.reduce((s, h) => s + h.text.length, 0),
		span: { start: r[0]?.newStart ?? 1, end: r.at(-1)?.newEnd ?? 1 },
		part: { index: index + 1, total: runs.length },
	}));
};

export const bundleDiffs = (diffs: readonly FileDiff[], options: BundleOptions = {}): readonly FileGroup[] => {
	if (diffs.length === 0) return [];
	const budget = options.budget ?? GROUP_DIFF_BUDGET;

	const rules = loadSystemRules();
	type Bucket = {
		readonly ruleDocId: string;
		readonly rulePattern: string;
		readonly ruleMarkdown: string;
		readonly diffs: FileDiff[];
	};
	const buckets = new Map<string, Bucket>();

	for (const diff of diffs) {
		const filePath = effectivePath(diff);
		const detail = rules.resolveDetail(filePath, {
			content: diff.diff,
			...(options.reviewTests !== undefined ? { reviewTests: options.reviewTests } : {}),
			...(options.disable ? { disable: options.disable } : {}),
		});
		// A rule doc the profile disabled entirely: the files are not reviewed by the model.
		if (!detail.text.trim()) continue;
		// Same rule text may come from different patterns; key by docId + pattern
		// so the prompt can show which glob applied, while still sharing text.
		const key = `${detail.docId}::${detail.pattern}`;
		const existing = buckets.get(key);
		if (existing) {
			existing.diffs.push(diff);
		} else {
			buckets.set(key, {
				ruleDocId: detail.docId,
				rulePattern: detail.pattern,
				ruleMarkdown: detail.text,
				diffs: [diff],
			});
		}
	}

	const order = (b: Bucket) => `${b.ruleDocId === TESTS_DOC ? '1' : '0'}${b.ruleDocId}`;
	const groups: FileGroup[] = [];
	for (const bucket of [...buckets.values()].toSorted((a, b) => order(a).localeCompare(order(b)))) {
		const base = bucket.ruleDocId.replace(/\.md$/, '');
		const units = bucket.diffs
			.toSorted((a, b) => effectivePath(a).localeCompare(effectivePath(b)))
			.flatMap((d) => unitsOf(d, budget));

		// Pack whole files up to the budget; each part of a split file is a group of its own.
		const packed: Unit[][] = [];
		let current: Unit[] = [];
		let size = 0;
		const close = () => {
			if (current.length) packed.push(current);
			current = [];
			size = 0;
		};
		for (const unit of units) {
			if (unit.part) {
				close();
				packed.push([unit]);
				continue;
			}
			if (current.length >= MAX_FILES_PER_GROUP || (current.length > 0 && size + unit.chars > budget)) close();
			current.push(unit);
			size += unit.chars;
		}
		close();

		const numbered = packed.length > 1;
		packed.forEach((members, i) => {
			const first = members[0];
			const files = members.map((m) => effectivePath(m.diff));
			const label = first?.part
				? `${base} · ${files[0]} (part ${first.part.index}/${first.part.total})`
				: `${base}${numbered ? ` (${i + 1})` : ''}`;
			groups.push({
				label,
				files,
				diffs: members.map((m) => m.diff),
				ruleDocId: bucket.ruleDocId,
				rulePattern: bucket.rulePattern,
				ruleMarkdown: bucket.ruleMarkdown,
				...(first?.span ? { span: first.span } : {}),
			});
		});
	}
	return groups;
};
