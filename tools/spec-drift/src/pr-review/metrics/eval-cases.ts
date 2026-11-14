/**
 * Evaluation cases (review-quality): checks that a labelled case can score anything (REQ-001), and builds a case from a
 * published review (REQ-004). Pure except `ruleIdsIn`, which reads the rule docs folder.
 */
import fs from 'node:fs';
import path from 'node:path';

import { buildCommentsCheck, commentKey, parseCommentsMarkdown } from '../comments/comments-format.ts';
import { effectivePath, parseDiffText, rightSideLines } from '../engine/index.ts';
import { parseRuleDoc } from '../engine/system-rules.ts';
import type { InlineComment } from '../pr-review.types.ts';
import type { EvalCase, ExpectedDefect } from './eval-score.ts';

/** Every checklist item id (`python.performance`) of the rule docs in `dir`, plus the deterministic checks. */
export const ruleIdsIn = (dir: string): Set<string> => {
	const ids = new Set<string>(['checks.secret-file']);
	for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.md'))) {
		for (const item of parseRuleDoc(file, fs.readFileSync(path.join(dir, file), 'utf8')).items) ids.add(item.id);
	}
	return ids;
};

/**
 * What is wrong with a case, or nothing (review-quality REQ-001): an id that is not its file name, a diff with no file,
 * a label that is not on an added line of its file (a reviewer could not comment there, so it could never be a hit), a
 * rule the checklists do not have, or a missing language or category.
 */
export const validateCase = (evalCase: EvalCase, fileName: string, ruleIds: ReadonlySet<string>): string[] => {
	const problems: string[] = [];
	const at = (d: ExpectedDefect) => `${d.path}:${d.startLine}`;
	if (`${evalCase.id}.json` !== fileName) problems.push(`id "${evalCase.id}" does not match the file name ${fileName}`);
	if (!evalCase.language) problems.push('no language');
	if (!evalCase.category) problems.push('no category');
	if (!Array.isArray(evalCase.expected)) return [...problems, 'expected is not a list'];
	const files = new Map(parseDiffText(evalCase.diff ?? '').map((f) => [effectivePath(f), f]));
	if (files.size === 0) problems.push('the diff has no file');
	for (const [kind, labels] of [
		['defect', evalCase.expected],
		['noise', evalCase.noise ?? []],
	] as const) {
		for (const d of labels) {
			const file = files.get(d.path);
			if (!file) {
				problems.push(`${kind} ${at(d)}: ${d.path} is not in the diff`);
				continue;
			}
			const added = new Set(rightSideLines(file.diff, { addedOnly: true }));
			const end = Math.max(d.startLine, d.endLine ?? d.startLine);
			let onAdded = false;
			for (let line = d.startLine; line <= end; line += 1) onAdded ||= added.has(line);
			if (!onAdded) problems.push(`${kind} ${at(d)}: not on an added line`);
			if (d.ruleId && !ruleIds.has(d.ruleId)) problems.push(`${kind} ${at(d)}: unknown rule ${d.ruleId}`);
		}
	}
	return problems;
};

const labelOf = (c: InlineComment): ExpectedDefect => ({
	path: c.path,
	startLine: c.start_line ?? c.line,
	...(c.start_line !== undefined && c.start_line !== c.line ? { endLine: c.line } : {}),
});

/**
 * A case from a published review (review-quality REQ-004): the published inline comments are the defects (a human
 * kept or edited them), the draft comments the human removed are known noise. Comment text is not copied: the labels
 * are locations, so the case holds the diff and nothing the reviewer wrote.
 */
export const caseFromReview = (options: {
	readonly id: string;
	readonly diff: string;
	/** The agent's draft (`.original/comments.md`). */
	readonly original: string;
	/** What the human published (`comments.md`). */
	readonly published: string;
	readonly language?: string;
}): EvalCase => {
	const original = parseCommentsMarkdown(options.original);
	const published = parseCommentsMarkdown(options.published);
	const check = buildCommentsCheck(published, original);
	const removed = new Set(check.changes.filter((c) => c.kind === 'removed').map((c) => c.key));
	const noise = original.comments.filter((c) => removed.has(commentKey(c))).map(labelOf);
	return {
		id: options.id,
		description: `Harvested from a published review: ${published.comments.length} published comment(s), ${noise.length} removed draft comment(s).`,
		language: options.language ?? 'unknown',
		category: published.comments.length ? 'harvested' : 'clean',
		diff: options.diff,
		expected: published.comments.map(labelOf),
		...(noise.length ? { noise } : {}),
	};
};
