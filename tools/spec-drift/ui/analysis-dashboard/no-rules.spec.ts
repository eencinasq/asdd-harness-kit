import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { ScanSummary } from '../../src/analysis/analysis.types.ts';
import { noRulesView } from './no-rules.ts';

const summary = (over: Partial<ScanSummary>): ScanSummary =>
	({ engine: { id: 'semgrep', name: 'Semgrep', rulesDir: '.semgrep' }, status: 'ok', ...over }) as ScanSummary;

test('spec-drift-empty REQ-002: a no-rules scan shows the no-rules state with the agent prompt', () => {
	const view = noRulesView(
		summary({ status: 'no-rules', message: 'demo has no rules', generatePrompt: '# Generate .semgrep rules' }),
	);
	assert.deepEqual(view, {
		title: 'No rules — nothing analyzed',
		message: 'demo has no rules',
		prompt: '# Generate .semgrep rules',
	});
	assert.equal(noRulesView(summary({ status: 'ok' })), null, 'a scan with rules renders as before');
});
