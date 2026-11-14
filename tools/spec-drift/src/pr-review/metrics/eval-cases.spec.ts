import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, test } from 'node:test';

import { serializeCommentsMarkdown } from '../comments/comments-format.ts';
import type { InlineComment, ParsedComments } from '../pr-review.types.ts';
import { caseFromReview, ruleIdsIn, validateCase } from './eval-cases.ts';
import type { EvalCase } from './eval-score.ts';

const RULE_DOCS = path.resolve(import.meta.dirname, '../engine/rules/rule_docs');
const ruleIds = ruleIdsIn(RULE_DOCS);

const DIFF = [
	'diff --git a/src/a.ts b/src/a.ts',
	'--- a/src/a.ts',
	'+++ b/src/a.ts',
	'@@ -1,3 +1,4 @@',
	' const a = 1;',
	'-const b = 2;',
	'+const b = 3;',
	'+const c = b.x;',
	' export { a };',
	'',
].join('\n');

const base: EvalCase = { id: 'ok', language: 'typescript', category: 'correctness', diff: DIFF, expected: [] };

describe('review-quality REQ-001: validateCase', () => {
	test('a label on an added line with a known rule passes', () => {
		const c = { ...base, expected: [{ path: 'src/a.ts', startLine: 3, ruleId: 'ts_js_tsx_jsx.code-quality-checks' }] };
		assert.ok(ruleIds.has('ts_js_tsx_jsx.code-quality-checks'), 'the rule exists in the docs');
		assert.deepEqual(validateCase(c, 'ok.json', ruleIds), []);
	});

	test('a label on a context line, an unknown rule, a missing file, and missing fields are reported', () => {
		const c = {
			...base,
			id: 'bad',
			language: undefined,
			expected: [
				{ path: 'src/a.ts', startLine: 1 },
				{ path: 'src/a.ts', startLine: 2, ruleId: 'nope.nothing' },
				{ path: 'src/b.ts', startLine: 1 },
			],
		} as unknown as EvalCase;
		const problems = validateCase(c, 'other.json', ruleIds);
		assert.ok(problems.some((p) => /does not match the file name/.test(p)));
		assert.ok(problems.includes('no language'));
		assert.ok(problems.some((p) => /src\/a\.ts:1: not on an added line/.test(p)));
		assert.ok(problems.some((p) => /unknown rule nope\.nothing/.test(p)));
		assert.ok(problems.some((p) => /src\/b\.ts is not in the diff/.test(p)));
	});
});

const comments = (list: InlineComment[]): string => {
	const parsed: ParsedComments = {
		meta: { pr: '7', repo: 'acme/demo', head_sha: 'abc', event: 'COMMENT' },
		comments: list,
		summary: 'Summary.',
	};
	return serializeCommentsMarkdown(parsed);
};

describe('review-quality REQ-004: caseFromReview', () => {
	test('published comments are defects, removed drafts are noise, and no comment text is kept', () => {
		const kept: InlineComment = { path: 'src/a.ts', line: 3, side: 'RIGHT', body: 'b is a number.' };
		const edited: InlineComment = { path: 'src/a.ts', line: 2, side: 'RIGHT', body: 'Draft wording.' };
		const removed: InlineComment = { path: 'src/a.ts', line: 4, side: 'RIGHT', body: 'Noise.' };
		const c = caseFromReview({
			id: 'demo-pr-7',
			diff: DIFF,
			original: comments([kept, edited, removed]),
			published: comments([kept, { ...edited, body: 'Human wording.' }]),
			language: 'typescript',
		});
		assert.deepEqual(
			c.expected.map((d) => `${d.path}:${d.startLine}`),
			['src/a.ts:3', 'src/a.ts:2'],
		);
		assert.deepEqual(c.noise, [{ path: 'src/a.ts', startLine: 4 }]);
		assert.equal(c.category, 'harvested');
		assert.doesNotMatch(JSON.stringify(c), /wording|Noise\.|b is a number/);
	});
});
