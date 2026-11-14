import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { RuleTestReport } from '../analysis.types.ts';
import { isRulesPath, NOISY_HITS, ruleReadiness } from './rule-readiness.ts';

const rule = (id: string) => ({ id, pack: 'architecture', severity: 'ERROR' as const, adr: null });
const tests: RuleTestReport = {
	status: 'ok',
	byRule: { 'r.ok': 'passed', 'r.noisy': 'passed', 'r.broken': 'failed' },
	invalidFiles: [],
};

describe('rule-coverage REQ-004: rule readiness', () => {
	test('ready = test passed and not noisy; missing or failed tests and noise are flagged', () => {
		const findings = [
			{ checkId: 'r.ok', path: 'src/a.ts' },
			...Array.from({ length: NOISY_HITS }, (_, i) => ({ checkId: 'r.noisy', path: `src/f${i % 3}.ts` })),
		];
		const report = ruleReadiness(
			[rule('r.ok'), rule('r.noisy'), rule('r.broken'), rule('r.untested')],
			findings,
			tests,
			true,
		);
		const by = Object.fromEntries(report.rules.map((r) => [r.id, r]));
		assert.deepEqual([by['r.ok']?.ready, by['r.ok']?.hits, by['r.ok']?.files], [true, 1, 1]);
		assert.deepEqual(by['r.noisy']?.flags, ['noisy']);
		assert.deepEqual(by['r.broken']?.flags, ['test-failed']);
		assert.deepEqual([by['r.untested']?.test, by['r.untested']?.flags], ['missing', ['no-test']]);
		assert.deepEqual([report.ready, report.notReady], [1, 3]);
		assert.equal(report.rules.at(-1)?.id, 'r.ok', 'not-ready rules first');
	});

	test('a rule with no hits is not flagged; tests that cannot run are never a pass', () => {
		const none = ruleReadiness([rule('r.ok')], [], tests, true);
		assert.equal(none.rules[0]?.ready, true);
		const unavailable = ruleReadiness(
			[rule('r.ok')],
			[],
			{ status: 'unavailable', byRule: {}, invalidFiles: [], message: 'semgrep not found' },
			true,
		);
		assert.deepEqual([unavailable.rules[0]?.test, unavailable.rules[0]?.ready], ['unavailable', false]);
		assert.equal(unavailable.tests.message, 'semgrep not found');
		assert.deepEqual(ruleReadiness([rule('r.ok')], [], tests, false).rules[0]?.flags, ['scan-failed']);
	});
});

describe('rule-coverage REQ-003: the rules folder is not code', () => {
	test('paths under the rules folder are rules paths', () => {
		assert.equal(isRulesPath('.semgrep', '.semgrep/architecture/r.ts'), true);
		assert.equal(isRulesPath('.semgrep', './.semgrep'), true);
		assert.equal(isRulesPath('.semgrep', 'src/.semgrep-notes.ts'), false);
	});
});
