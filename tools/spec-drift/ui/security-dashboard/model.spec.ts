import assert from 'node:assert/strict';
import { test } from 'node:test';

import { renderStatus, statusOf } from './model.ts';

const status = {
	kind: 'security-audit',
	run: { id: 'run-2', startedAt: '2026-11-17T10:00:00.000Z', repo: 'shop' },
	counts: { total: 3, byVerdict: { confirmed: 1, needs_validation: 2 }, bySeverity: { high: 1 } },
	coverage: { reviewed: 2, total: 7 },
	ledger: [
		{ id: 'core', title: 'Core principles and workflow', status: 'reviewed' },
		{ id: 'web-protocol-and-auth', title: 'Web, protocol and auth', status: 'pending' },
	],
	needsValidation: [{ fingerprint: 'auth/tenant', title: 'Tenant id <script> from body' }],
	findings: {
		page: 1,
		pages: 1,
		items: [
			{
				fingerprint: 'fs/traversal',
				title: 'Path traversal',
				verdict: 'confirmed',
				severity: 'high',
				location: 'src/api.ts:9',
			},
		],
	},
};

test('security-review REQ-009: the view model reads a security-audit result and rejects anything else', () => {
	assert.equal(statusOf({ structuredContent: status })?.run.id, 'run-2');
	assert.equal(statusOf({ structuredContent: { kind: 'other' } }), null);
	assert.equal(statusOf({}), null);
});

test('security-review REQ-009: the view shows counts, coverage, ledger, needs-validation and findings, escaped', () => {
	const html = renderStatus(statusOf({ structuredContent: status })!);
	assert.match(html, /2\/7/);
	assert.match(html, /needs_validation/);
	assert.match(html, /web-protocol-and-auth/);
	assert.match(html, /src\/api\.ts:9/);
	assert.match(html, /Tenant id &lt;script&gt; from body/);
	assert.doesNotMatch(html, /<script>/);
});
