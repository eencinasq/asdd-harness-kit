import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { SecurityFinding } from '../../security/findings.ts';
import {
	buildGuidedAuditHostPrompt,
	confirmedToGuidedFinding,
	mapConfirmedGuidedFindings,
} from './guided-audit-map.ts';

const finding = (
	partial: Partial<SecurityFinding> & Pick<SecurityFinding, 'verdict' | 'fingerprint' | 'title'>,
): SecurityFinding => ({
	description: partial.description ?? 'desc',
	trace: partial.trace ?? [{ file: 'src/a.ts', line: 10, kind: 'sink' }],
	evidence: partial.evidence ?? [{ file: 'src/a.ts', line: 10 }],
	severity: partial.severity ?? { overall_severity: 'high' },
	...partial,
});

describe('guided-audit-map (REQ-028 REQ-029)', () => {
	it('maps only confirmed findings with file:line', () => {
		const confirmed = finding({
			verdict: 'confirmed',
			fingerprint: 'fp-1',
			title: 'XSS in handler',
			description: 'Unescaped output',
		});
		const needs = finding({
			verdict: 'needs_validation',
			fingerprint: 'fp-2',
			title: 'Maybe SSRF',
		});
		const rejected = finding({
			verdict: 'rejected',
			fingerprint: 'fp-3',
			title: 'False positive',
		});
		const noLoc = finding({
			verdict: 'confirmed',
			fingerprint: 'fp-4',
			title: 'No location',
			trace: [],
			evidence: [],
		});
		assert.equal(confirmedToGuidedFinding(needs), null);
		assert.equal(confirmedToGuidedFinding(rejected), null);
		assert.equal(confirmedToGuidedFinding(noLoc), null);
		const mapped = mapConfirmedGuidedFindings([needs, confirmed, rejected, noLoc]);
		assert.equal(mapped.length, 1);
		assert.equal(mapped[0]?.fingerprint, 'fp-1');
		assert.equal(mapped[0]?.path, 'src/a.ts');
		assert.equal(mapped[0]?.startLine, 10);
		assert.equal(mapped[0]?.severity, 'ERROR');
		assert.match(mapped[0]?.checkId ?? '', /XSS/);
	});

	it('builds a host prompt that names sync + runId', () => {
		const prompt = buildGuidedAuditHostPrompt({
			pr: 42,
			runId: 'run-3',
			paths: ['src/a.ts', 'src/b.ts'],
			methodologyPrompt: 'Do the audit.',
		});
		assert.match(prompt, /PR #42/);
		assert.match(prompt, /run-3/);
		assert.match(prompt, /pr_review_sync_guided_audit/);
		assert.match(prompt, /src\/a\.ts/);
		assert.match(prompt, /Do the audit/);
	});
});
