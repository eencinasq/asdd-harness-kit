/**
 * The evaluation set in eval/cases (review-quality REQ-001, REQ-003): every case can score, and the set is large and
 * varied enough to mean something. Runs in `pnpm test`, so CI rejects a malformed case.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';

import { prepareReview } from '../engine/index.ts';
import { ruleIdsIn, validateCase } from './eval-cases.ts';
import type { EvalCase } from './eval-score.ts';

const CASES_DIR = path.resolve(import.meta.dirname, '../../../eval/cases');
const ruleIds = ruleIdsIn(path.resolve(import.meta.dirname, '../engine/rules/rule_docs'));

describe('review-quality REQ-001: every case in eval/cases can score', () => {
	const files = fs.readdirSync(CASES_DIR).filter((f) => f.endsWith('.json'));
	for (const file of files) {
		test(file, () => {
			const evalCase = JSON.parse(fs.readFileSync(path.join(CASES_DIR, file), 'utf8')) as EvalCase;
			assert.deepEqual(validateCase(evalCase, file, ruleIds), []);
			assert.ok(
				prepareReview(evalCase.diff).groups.length > 0,
				'the reviewer gets at least one group (no file filtered out)',
			);
		});
	}

	test('review-quality REQ-003: at least 30 cases, 6 languages, a third clean', () => {
		const cases = files.map((f) => JSON.parse(fs.readFileSync(path.join(CASES_DIR, f), 'utf8')) as EvalCase);
		assert.ok(cases.length >= 30, `${cases.length} cases`);
		assert.ok(new Set(cases.map((c) => c.language)).size >= 6, 'languages');
		assert.ok(cases.filter((c) => c.expected.length === 0).length * 3 >= cases.length, 'clean cases');
	});
});
