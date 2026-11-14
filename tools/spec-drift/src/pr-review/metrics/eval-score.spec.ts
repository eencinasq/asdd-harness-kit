import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { compareWithBaseline, type EvalCase, formatEval, scoreCase, summarizeEval } from './eval-score.ts';

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

describe('review-quality REQ-002: breakdowns and baseline', () => {
	const c = (id: string, language: string, category: string): EvalCase => ({
		id,
		language,
		category,
		diff: '',
		expected: [{ path: 'a', startLine: 1 }],
	});
	test('scores are broken down by language and category', () => {
		const summary = summarizeEval([
			scoreCase(c('a', 'python', 'security'), [{ path: 'a', startLine: 1 }]),
			scoreCase(c('b', 'go', 'security'), [{ path: 'a', startLine: 9 }]),
		]);
		assert.equal(summary.byLanguage?.['python']?.precision, 1);
		assert.equal(summary.byLanguage?.['go']?.precision, 0);
		assert.equal(summary.byCategory?.['security']?.cases, 2);
		assert.match(formatEval(summary), /\| Language \| Cases/);
	});

	test('a precision drop over the limit is a regression; a smaller one is not', () => {
		const baseline = { precision: 0.8, recall: 0.6, f1: 0.69 };
		assert.equal(compareWithBaseline({ precision: 0.74, recall: 0.6, f1: 0.66 }, baseline).regressed, true);
		assert.equal(compareWithBaseline({ precision: 0.76, recall: 0.6, f1: 0.67 }, baseline).regressed, false);
		assert.equal(compareWithBaseline({ precision: 0.8, recall: 0.5, f1: 0.62 }, baseline, 5).regressed, true);
		assert.match(
			compareWithBaseline({ precision: 0.74, recall: 0.6, f1: 0.66 }, baseline).lines[0] ?? '',
			/REGRESSION/,
		);
	});

	test('a false positive on a known-noise label is counted as repeated noise', () => {
		const noisy: EvalCase = { id: 'n', diff: '', expected: [], noise: [{ path: 'a', startLine: 5 }] };
		assert.equal(scoreCase(noisy, [{ path: 'a', startLine: 6 }]).repeatedNoise, 1);
	});
});
