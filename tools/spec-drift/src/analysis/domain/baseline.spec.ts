import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { buildBaseline, compareWithBaseline, fingerprintOf, parseBaseline } from './baseline.ts';

describe('spec-drift-adoption REQ-001: baseline', () => {
	test('a fingerprint survives a line move and whitespace, not an edit, another rule or another file', () => {
		const fp = fingerprintOf('r.no-console', 'src/a.ts', '\tconsole.log(x);');
		assert.equal(fingerprintOf('r.no-console', 'src/a.ts', 'console.log(x);   '), fp);
		assert.equal(fingerprintOf('r.no-console', 'src/a.ts', 'console.log(y);') === fp, false);
		assert.equal(fingerprintOf('r.other', 'src/a.ts', 'console.log(x);') === fp, false);
		assert.equal(fingerprintOf('r.no-console', 'src/b.ts', 'console.log(x);') === fp, false);
	});

	test('identical lines are counted: one more is new, one fewer is resolved', () => {
		const a = fingerprintOf('r', 'src/a.ts', 'x();');
		const b = fingerprintOf('r', 'src/b.ts', 'y();');
		const baseline = buildBaseline([a, a, b], 'semgrep', new Date('2026-11-01T00:00:00Z'));
		assert.deepEqual(baseline.fingerprints, { [a]: 2, [b]: 1 });
		const same = compareWithBaseline([a, b, a], baseline, '.semgrep/baseline.json', true);
		assert.deepEqual(same.marks, ['existing', 'existing', 'existing']);
		assert.deepEqual([same.status.new, same.status.existing, same.status.resolved], [0, 3, 0]);
		const more = compareWithBaseline([a, a, a], baseline, '.semgrep/baseline.json', true);
		assert.deepEqual(more.marks, ['existing', 'existing', 'new']);
		assert.equal(more.status.resolved, 1, 'b is gone');
		assert.equal(compareWithBaseline([a], baseline, 'f', false).status.resolved, null, 'a limited scan cannot tell');
	});

	test('a malformed or missing file is no baseline', () => {
		assert.equal(parseBaseline(null), null);
		assert.equal(parseBaseline('nope'), null);
		assert.equal(parseBaseline('{"x":1}'), null);
		const parsed = parseBaseline(JSON.stringify(buildBaseline(['f', 'f'], 'semgrep')));
		assert.equal(parsed?.total, 2);
	});
});
