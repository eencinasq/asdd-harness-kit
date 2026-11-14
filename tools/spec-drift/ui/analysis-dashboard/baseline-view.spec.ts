import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Finding, ScanSummary } from '../../src/analysis/analysis.types.ts';
import { baselineHint, defaultBaselineFilter, matchesBaseline } from './baseline-view.ts';

const summary = (baseline: ScanSummary['baseline']) => ({ baseline }) as ScanSummary;
const finding = (baseline?: 'new' | 'existing') => ({ checkId: 'r', baseline }) as Finding;

test('spec-drift-adoption REQ-001: the dashboard leads with new findings when there is a baseline', () => {
	const b = {
		file: '.semgrep/baseline.json',
		created_at: '2026-11-01T00:00:00Z',
		entries: 42,
		new: 3,
		existing: 40,
		resolved: 2,
	};
	assert.equal(baselineHint(summary(b)), '3 new · 40 existing · 2 resolved since the baseline of 2026-11-01');
	assert.equal(baselineHint(summary({ ...b, resolved: null })), '3 new · 40 existing since the baseline of 2026-11-01');
	assert.equal(baselineHint(summary(null)), null);
	assert.equal(defaultBaselineFilter(summary(b)), 'new');
	assert.equal(defaultBaselineFilter(summary(null)), 'all');
	assert.equal(matchesBaseline(finding('existing'), 'new'), false);
	assert.equal(matchesBaseline(finding('new'), 'new'), true);
	assert.equal(matchesBaseline(finding('existing'), 'all'), true);
});
