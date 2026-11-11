import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { fileExcerpt, MAX_READ_LINES, MAX_SEARCH_LINES, searchResult } from './code-reading.ts';

const SHA = 'abcdef0123456789';
const file = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n');

describe('fileExcerpt', () => {
	test('pages of 200 lines, with a pointer to the next page', () => {
		assert.equal(MAX_READ_LINES, 200);
		const page = fileExcerpt({ file: 'a.ts', sha: SHA, text: file(450) });
		const lines = page.split('\n');
		assert.equal(lines[0], 'a.ts @ abcdef01 (lines 1-200 of 450)');
		assert.equal(lines.length, 1 + 200 + 1);
		assert.equal(lines[200], '  200  line 200');
		assert.equal(lines.at(-1), '… 250 more line(s): call again with startLine=201');

		const last = fileExcerpt({ file: 'a.ts', sha: SHA, text: file(450), startLine: 401 });
		assert.match(last, /^a\.ts @ abcdef01 \(lines 401-450 of 450\)/);
		assert.doesNotMatch(last, /more line/);
	});

	test('an explicit range is honoured but still capped at one page', () => {
		assert.match(fileExcerpt({ file: 'a.ts', sha: SHA, text: file(450), startLine: 10, endLine: 12 }), /lines 10-12/);
		assert.match(fileExcerpt({ file: 'a.ts', sha: SHA, text: file(450), startLine: 1, endLine: 400 }), /lines 1-200/);
	});

	test('a short file comes back whole', () => {
		const whole = fileExcerpt({ file: 'a.ts', sha: SHA, text: file(5) });
		assert.match(whole, /lines 1-5 of 5/);
		assert.doesNotMatch(whole, /more line/);
	});
});

describe('searchResult', () => {
	test('50 matches at most; truncation tells the agent to narrow the search', () => {
		assert.equal(MAX_SEARCH_LINES, 50);
		const lines = Array.from({ length: 50 }, (_, i) => `src/a.ts:${i + 1}:x`);
		const out = searchResult({ pattern: 'x', sha: SHA, lines, truncated: true });
		assert.match(out, /^50\+ match\(es\) for "x" at abcdef01/);
		assert.match(out, /narrow the pattern or pass paths\.$/);
	});

	test('no match, and long lines are cut', () => {
		assert.equal(
			searchResult({ pattern: 'y', sha: SHA, lines: [], truncated: false }),
			'No match for "y" at abcdef01.',
		);
		const out = searchResult({ pattern: 'z', sha: SHA, lines: [`a.min.js:1:${'z'.repeat(1000)}`], truncated: false });
		assert.ok((out.split('\n')[1] ?? '').length <= 301);
	});
});
