import assert from 'node:assert/strict';
import { test } from 'node:test';

import { overviewText, summarizeRepo } from './repos-overview.ts';
import type { Snapshot } from './trend.ts';

const snap = (at: string, total: number, isNew: number | null = null): Snapshot => ({
	schema_version: '1.0',
	recorded_at: at,
	commit: 'abcdef1234',
	engine: 'semgrep',
	total,
	new: isNew,
	by_severity: {},
	by_rule: {},
	by_adr: {},
	by_pack: {},
	rules: 3,
	adr_coverage: null,
});

test('spec-drift-demand REQ-006: a repository summary has its latest snapshot, trend and audit', () => {
	const s = summarizeRepo({
		name: 'shop',
		root: '/r/shop',
		snapshots: [
			{ file: '2026-10-01.json', snapshot: snap('2026-10-01T00:00:00Z', 20) },
			{ file: '2026-11-01.json', snapshot: snap('2026-11-01T00:00:00Z', 10) },
		],
		audit: {
			file: 'a.json',
			report: {
				generated_at: '2026-11-02',
				findings: [{}, {}],
				summary: { drift_level: 'warning', spec_compliance: 0.9 },
			},
		},
	});
	assert.deepEqual(s.analysis, {
		recordedAt: '2026-11-01T00:00:00Z',
		commit: 'abcdef1234',
		total: 10,
		new: null,
		snapshots: 2,
		direction: 'better',
		change: -0.5,
	});
	assert.deepEqual(s.audit, { generatedAt: '2026-11-02', driftLevel: 'warning', specCompliance: 0.9, findings: 2 });
	assert.equal(s.noData, false);
	const empty = summarizeRepo({ name: 'docs', root: '/r/docs', snapshots: [], audit: null });
	assert.equal(empty.noData, true);
	const text = overviewText([s, empty, { ...empty, name: 'gone', error: 'no such folder' }]);
	assert.match(text, /^3 repositories:/);
	assert.match(text, /- shop: 10 findings, better -50% over 2 snapshot\(s\); audit warning, spec compliance 90%/);
	assert.match(text, /- docs: no data/);
	assert.match(text, /- gone: no such folder/);
});
