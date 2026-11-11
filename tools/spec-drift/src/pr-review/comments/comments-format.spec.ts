import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
	buildCommentsCheck,
	findRiskyEdits,
	parseCommentsMarkdown,
	serializeCommentsMarkdown,
	validateParsedComments,
} from './comments-format.ts';

const SAMPLE = `---
pr: 42
repo: acme/demo
head_sha: abcdef0123456789
event: REQUEST_CHANGES
---

## Inline

### src/foo.ts:10
Broken contract on the happy path.

### src/bar.ts:20-22
Edge case loses the tenant id.

## Summary
Needs fixes before merge.
`;

describe('comments-format', () => {
	test('parses front-matter, single-line and range comments', () => {
		const parsed = parseCommentsMarkdown(SAMPLE);
		assert.equal(parsed.meta.pr, '42');
		assert.equal(parsed.meta.event, 'REQUEST_CHANGES');
		assert.equal(parsed.comments.length, 2);
		assert.equal(parsed.comments[1]?.start_line, 20);
		assert.equal(parsed.comments[1]?.line, 22);
		assert.deepEqual(validateParsedComments(parsed), []);
	});

	test('round-trips through serialize', () => {
		const parsed = parseCommentsMarkdown(SAMPLE);
		const again = parseCommentsMarkdown(serializeCommentsMarkdown(parsed));
		assert.equal(again.comments.length, 2);
		assert.equal(again.summary, parsed.summary);
	});

	test('flags a rewritten comment as edited and risky', () => {
		const original = parseCommentsMarkdown(SAMPLE);
		const edited = {
			...original,
			comments: original.comments.map((c, i) =>
				i === 0 ? { ...c, body: 'Completely different wording about another bug.' } : c,
			),
		};
		const check = buildCommentsCheck(edited, original);
		assert.ok(check.changes.some((c) => c.kind === 'edited'));
		assert.ok(findRiskyEdits(check).length > 0);
	});

	test('rejects a file without front-matter', () => {
		assert.throws(() => parseCommentsMarkdown('## Inline\n'), /front-matter/);
	});
});
