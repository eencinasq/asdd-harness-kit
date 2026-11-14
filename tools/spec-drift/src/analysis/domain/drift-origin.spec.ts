import assert from 'node:assert/strict';
import { test } from 'node:test';

import { describeOrigin, parseBlamePorcelain, parseLogLine, prFromSubject } from './drift-origin.ts';

const SHA = 'a'.repeat(40);

test('spec-drift-demand REQ-001: blame porcelain gives the last change, with the PR from the subject', () => {
	const porcelain = [
		`${SHA} 3 3 1`,
		'author Ada',
		'author-mail <ada@example.com>',
		'author-time 1700000000',
		'author-tz +0000',
		'summary feat: add the query (#12)',
		'filename src/a.ts',
		'\tconst rows = db.query(sql);',
	].join('\n');
	const blame = parseBlamePorcelain(porcelain);
	assert.deepEqual(blame, {
		sha: SHA,
		author: 'Ada',
		date: '2023-11-14T22:13:20.000Z',
		subject: 'feat: add the query (#12)',
		pr: 12,
		committed: true,
	});
	assert.equal(parseBlamePorcelain(`${'0'.repeat(40)} 1 1 1\nauthor Not Committed Yet\nsummary x`)?.committed, false);
	assert.equal(parseBlamePorcelain('fatal: no such path'), null);
});

test('spec-drift-demand REQ-001: log lines and PR subjects parse; the text explains both commits', () => {
	const log = parseLogLine([SHA, 'Bo', '2026-01-02T03:04:05+00:00', 'Merge pull request #7 from org/x'].join('\x1f'));
	assert.deepEqual(log, {
		sha: SHA,
		author: 'Bo',
		date: '2026-01-02T03:04:05+00:00',
		subject: 'Merge pull request #7 from org/x',
		pr: 7,
	});
	assert.equal(parseLogLine('garbage'), null);
	assert.equal(prFromSubject('fix (#3) in the middle'), null);
	const text = describeOrigin({ path: 'src/a.ts', line: 3, lastChange: log, committed: true, introduced: log });
	assert.match(text, /^src\/a\.ts:3\nLast change: aaaaaaaaaa by Bo on 2026-01-02 \(PR #7\)/);
	assert.match(
		describeOrigin({ path: 'a', line: 1, lastChange: null, committed: false, introduced: null }),
		/not committed yet[\s\S]*not found/,
	);
});
