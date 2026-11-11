import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { type EvalCase, formatEval, scoreCase, summarizeEval } from './eval-score.ts';

const evalCase: EvalCase = {
	id: 'py-eval',
	diff: '',
	expected: [
		{ path: 'src/util.py', startLine: 4, note: 'eval on input' },
		{ path: 'src/app.ts', startLine: 6, endLine: 7 },
	],
};

describe('offline evaluation', () => {
	test('a finding within two lines of a labelled defect is a hit; each defect counts once', () => {
		const score = scoreCase(evalCase, [
			{ path: 'src/util.py', startLine: 5 },
			{ path: 'src/util.py', startLine: 4 },
			{ path: 'src/app.ts', startLine: 20 },
		]);
		assert.equal(score.truePositives, 1);
		assert.equal(score.falsePositives.length, 2);
		assert.deepEqual(
			score.missed.map((m) => m.path),
			['src/app.ts'],
		);
	});

	test('precision, recall and F1 across cases', () => {
		const summary = summarizeEval([
			scoreCase(evalCase, [
				{ path: 'src/util.py', startLine: 4 },
				{ path: 'src/app.ts', startLine: 8 },
			]),
			scoreCase({ id: 'clean', diff: '', expected: [] }, [{ path: 'a.ts', startLine: 1 }]),
		]);
		assert.equal(summary.precision, 2 / 3);
		assert.equal(summary.recall, 1);
		assert.match(formatEval(summary), /^Precision 67% · Recall 100% · F1 80% over 2 case\(s\)/);
		assert.match(formatEval(summary), /\| clean \| 0 \| 1 \| 0 \| a\.ts:1 \| — \|/);
		assert.equal(summarizeEval([]).precision, undefined);
	});
});
