/**
 * Use-case / wiring tests: architecture + security + ticket criteria → Findings inbox →
 * comment bodies → merge into a draft (the path the dashboard and pr_review_import_findings share).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mergeArchitectureComments } from '../architecture/architecture-import.ts';
import type { ReviewState } from '../pr-review.types.ts';
import {
	collectInboxItems,
	inboxItemToReviewFinding,
	isHighSeverity,
	pinableUnmetCriteria,
	resolveInboxKeys,
} from './findings-inbox.ts';

const state: ReviewState = {
	pr: 42,
	repo: 'acme/demo',
	base: 'main',
	review_count: 1,
	current: { revision: 1, head_sha: 'abc', base_sha: 'def', date: '2026-01-01', published: false },
	history: [],
};

describe('Findings engines use-case (architecture · security · ticket → comments)', () => {
	const architectureFindings = [
		{
			checkId: 'demo.no-console-log',
			path: 'src/app.ts',
			startLine: 5,
			endLine: 5,
			severity: 'WARNING',
			message: 'Use the logger instead of console.log.',
		},
		{
			checkId: 'demo.no-explicit-any',
			path: 'src/app.ts',
			startLine: 4,
			endLine: 4,
			severity: 'ERROR',
			message: 'Do not use explicit any.',
		},
	];
	const builtinSecurityFindings = [
		{
			checkId: 'security.js.command-injection',
			path: 'src/api/run.js',
			startLine: 2,
			endLine: 2,
			severity: 'ERROR',
			message: 'User input reaches a shell command.',
		},
	];
	const requirements = {
		ticket: { source: 'github' as const, ref: '#7', title: 'Parse raw payloads', text: '' },
		criteria: [
			{
				id: 'AC-1',
				kind: 'acceptance' as const,
				text: 'Must validate input',
				status: 'met' as const,
				evidence: ['src/app.ts:4'],
			},
			{
				id: 'AC-2',
				kind: 'acceptance' as const,
				text: 'Invalid JSON is rejected',
				status: 'unmet' as const,
				evidence: ['src/app.ts:6'],
				note: 'JSON.parse throws',
			},
			{
				id: 'AC-3',
				kind: 'acceptance' as const,
				text: 'Docs updated',
				status: 'unmet' as const,
				evidence: ['README.md'],
			},
		],
		signals: { testFiles: ['src/app.spec.ts'], docFiles: [], migrationFiles: [], configFiles: [] },
		status: 'done' as const,
		unrelatedChanges: [] as string[],
	};

	it('collects all three engines into one inbox with stable keys and high defaults', () => {
		const items = collectInboxItems({
			architectureFindings,
			builtinSecurityFindings,
			requirements,
		});
		assert.deepEqual(
			items.map((i) => i.key),
			['arch:0', 'arch:1', 'sec-builtin:0', 'ticket:AC-2'],
		);
		assert.equal(items.find((i) => i.key === 'arch:0')?.defaultChecked, false);
		assert.equal(items.find((i) => i.key === 'arch:1')?.defaultChecked, true);
		assert.equal(items.find((i) => i.key === 'sec-builtin:0')?.defaultChecked, true);
		assert.equal(items.find((i) => i.key === 'ticket:AC-2')?.defaultChecked, true);
		assert.equal(
			pinableUnmetCriteria(requirements.criteria)
				.map((c) => c.id)
				.join(','),
			'AC-2',
		);
	});

	it('resolves mixed keys and rejects unknowns without dropping valid ones', () => {
		const items = collectInboxItems({ architectureFindings, builtinSecurityFindings, requirements });
		const { selected, unknown } = resolveInboxKeys(['arch:1', 'sec-builtin:0', 'ticket:AC-2', 'arch:9'], items);
		assert.equal(selected.length, 3);
		assert.deepEqual(unknown, ['arch:9']);
	});

	it('formats comment bodies per source and merges high findings as inline REQUEST_CHANGES', () => {
		const items = collectInboxItems({ architectureFindings, builtinSecurityFindings, requirements });
		const { selected } = resolveInboxKeys(['arch:1', 'sec-builtin:0', 'ticket:AC-2'], items);
		assert.ok(selected.every((i) => isHighSeverity(i.severity)));

		const findings = selected.map(inboxItemToReviewFinding);
		assert.match(findings[0]!.content, /^Architecture: demo\.no-explicit-any\./);
		assert.match(findings[1]!.content, /^Security: security\.js\.command-injection\./);
		assert.match(findings[2]!.content, /^Ticket: AC-2\./);
		assert.match(findings[2]!.content, /Suggested fix: JSON\.parse throws/);
		assert.ok(findings.every((f) => f.content.split(/\s+/).length <= 80));

		const merged = mergeArchitectureComments({
			pr: 42,
			state,
			existing: {
				meta: { pr: '42', repo: 'acme/demo', head_sha: 'abc', event: 'COMMENT' },
				comments: [],
				summary: 'Agent summary.',
			},
			findings,
		});
		assert.equal(merged.addedInline, 3);
		assert.equal(merged.addedToSummary, 0);
		assert.equal(merged.comments.meta.event, 'REQUEST_CHANGES');
		assert.equal(merged.comments.comments.length, 3);
		assert.ok(merged.comments.comments.every((c) => c.side === 'RIGHT'));
	});

	it('routes INFO/low architecture items to the summary; WARNING/medium stays inline', () => {
		const warning = collectInboxItems({ architectureFindings }).find((i) => i.key === 'arch:0');
		assert.equal(warning?.severity, 'medium');
		const warningMerged = mergeArchitectureComments({
			pr: 42,
			state,
			existing: undefined,
			findings: [inboxItemToReviewFinding(warning!)],
		});
		assert.equal(warningMerged.addedInline, 1);
		assert.equal(warningMerged.addedToSummary, 0);

		const infoItems = collectInboxItems({
			architectureFindings: [
				{
					checkId: 'demo.nit',
					path: 'src/app.ts',
					startLine: 5,
					endLine: 5,
					severity: 'INFO',
					message: 'Prefer a named constant.',
				},
			],
		});
		assert.equal(infoItems[0]?.severity, 'low');
		const lowMerged = mergeArchitectureComments({
			pr: 42,
			state,
			existing: undefined,
			findings: [inboxItemToReviewFinding(infoItems[0]!)],
		});
		assert.equal(lowMerged.addedInline, 0);
		assert.equal(lowMerged.addedToSummary, 1);
		assert.match(lowMerged.comments.summary, /Findings \(minor\)/);
		assert.match(lowMerged.comments.summary, /Architecture: demo\.nit/);
	});
});
