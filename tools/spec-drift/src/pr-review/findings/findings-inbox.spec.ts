import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
	analyzerSeverityToFinding,
	collectInboxItems,
	formatInboxComment,
	parseEvidenceRef,
	resolveInboxKeys,
	ticketPinItems,
} from './findings-inbox.ts';

describe('findings inbox (pr-review-dashboard-ux REQ-022…024)', () => {
	it('formats a short comment with source + title and truncates to the word limit', () => {
		const body = formatInboxComment({
			source: 'security',
			title: 'demo.sqli',
			message: 'User input reaches SQL.',
			suggestedFix: 'Use a parameterized query.',
		});
		assert.match(body, /^Security: demo\.sqli\./);
		assert.match(body, /Suggested fix:/);
		assert.ok(body.split(/\s+/).length <= 80);
	});

	it('parses path:line evidence and rejects bare paths', () => {
		assert.deepEqual(parseEvidenceRef('src/a.ts:12'), { path: 'src/a.ts', line: 12 });
		assert.deepEqual(parseEvidenceRef('src/a.ts:12-18'), { path: 'src/a.ts', line: 12 });
		assert.equal(parseEvidenceRef('src/a.ts'), undefined);
	});

	it('collects architecture, security, guided-audit, and pin-able unmet ticket items', () => {
		const items = collectInboxItems({
			architectureFindings: [
				{ checkId: 'arch.x', path: 'a.ts', startLine: 1, endLine: 1, severity: 'WARNING', message: 'm' },
			],
			builtinSecurityFindings: [
				{ checkId: 'sec.y', path: 'b.ts', startLine: 2, endLine: 2, severity: 'ERROR', message: 'm' },
			],
			guidedAuditFindings: [
				{
					fingerprint: 'fp-abc',
					checkId: 'XSS in handler',
					path: 'c.ts',
					startLine: 9,
					endLine: 9,
					severity: 'ERROR',
					message: 'Unescaped',
				},
			],
			requirements: {
				ticket: { source: 'text', text: 't' },
				criteria: [
					{
						id: 'AC-1',
						kind: 'acceptance',
						text: 'Must validate input',
						status: 'unmet',
						evidence: ['src/app.ts:6'],
					},
					{ id: 'AC-2', kind: 'acceptance', text: 'Docs', status: 'unmet', evidence: ['README.md'] },
					{ id: 'AC-3', kind: 'acceptance', text: 'Ok', status: 'met', evidence: ['src/app.ts:1'] },
				],
				signals: { testFiles: [], docFiles: [], migrationFiles: [], configFiles: [] },
				status: 'done',
				unrelatedChanges: [],
			},
		});
		assert.equal(items.length, 4);
		assert.equal(items[0]?.key, 'arch:0');
		assert.equal(items[0]?.defaultChecked, false);
		assert.equal(items[1]?.key, 'sec-builtin:0');
		assert.equal(items[1]?.defaultChecked, true);
		assert.equal(items[2]?.key, 'sec-audit:fp-abc');
		assert.equal(items[2]?.defaultChecked, true);
		assert.equal(items[3]?.key, 'ticket:AC-1');
		assert.equal(ticketPinItems(undefined).length, 0);
	});

	it('maps analyzer severities and resolves keys', () => {
		assert.equal(analyzerSeverityToFinding('ERROR'), 'high');
		assert.equal(analyzerSeverityToFinding('WARNING'), 'medium');
		const items = collectInboxItems({
			architectureFindings: [{ checkId: 'a', path: 'a.ts', startLine: 1, endLine: 1, severity: 'ERROR', message: 'm' }],
		});
		const { selected, unknown } = resolveInboxKeys(['arch:0', 'arch:9'], items);
		assert.equal(selected.length, 1);
		assert.deepEqual(unknown, ['arch:9']);
	});
});
