import assert from 'node:assert/strict';
import { test } from 'node:test';

import { costSummary, parseCalls, reviewCost } from './review-cost.ts';

const at = (min: number) => new Date(Date.UTC(2026, 10, 14, 10, min)).toISOString();

test('spec-drift-demand REQ-003: the cost counts the calls since the last start, their text, and the minutes', () => {
	const calls = parseCalls(
		[
			JSON.stringify({ tool: 'pr_review_start', chars: 999, at: at(0) }),
			'not json',
			JSON.stringify({ tool: 'pr_review_start', chars: 4000, at: at(10) }),
			JSON.stringify({ tool: 'pr_review_next_group', chars: 2000, at: at(12) }),
			JSON.stringify({ tool: 'pr_review_submit_findings', chars: 400, at: at(15) }),
			JSON.stringify({ tool: 'pr_review_next_group', chars: 1600, at: at(18) }),
		].join('\n'),
	);
	assert.equal(calls.length, 5, 'corrupt lines are skipped');
	assert.deepEqual(reviewCost(calls, new Date(at(40))), {
		minutes: 30,
		calls: 4,
		byTool: { pr_review_start: 1, pr_review_next_group: 2, pr_review_submit_findings: 1 },
		chars: 8000,
		estTokens: 2000,
	});
	assert.deepEqual(reviewCost([], new Date()), { minutes: null, calls: 0, byTool: {}, chars: 0, estTokens: 0 });
});

test('spec-drift-demand REQ-003: the metrics report the medians of the reviews that have a cost', () => {
	const c = (minutes: number, calls: number, estTokens: number) => ({
		minutes,
		calls,
		byTool: {},
		chars: estTokens * 4,
		estTokens,
	});
	assert.equal(
		costSummary([c(10, 8, 1000), undefined, c(30, 12, 3000), c(20, 10, 2000)]),
		'- Cost (median of 3 review(s)): 20 min · 10 tool calls · ~2000 tokens of tool output (estimate: characters / 4)',
	);
	assert.equal(costSummary([undefined]), '');
});
