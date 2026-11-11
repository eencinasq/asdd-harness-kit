import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { ReviewState } from '../pr-review.types.ts';
import { mergeArchitectureComments } from './architecture-import.ts';

const state: ReviewState = {
	pr: 7,
	repo: 'acme/demo',
	base: 'main',
	review_count: 1,
	current: { revision: 1, head_sha: 'abc', base_sha: 'def', date: '2026-01-01', published: false },
	history: [],
};

describe('mergeArchitectureComments', () => {
	test('adds high findings inline, low ones to the summary, and requests changes', () => {
		const result = mergeArchitectureComments({
			pr: 7,
			state,
			existing: undefined,
			findings: [
				{
					path: 'src/a.ts',
					content: 'boundary breach',
					startLine: 4,
					endLine: 4,
					severity: 'high',
					category: 'maintainability',
				},
				{
					path: 'src/b.ts',
					content: 'minor naming',
					startLine: 9,
					endLine: 9,
					severity: 'low',
					category: 'maintainability',
				},
			],
		});
		assert.equal(result.addedInline, 1);
		assert.equal(result.addedToSummary, 1);
		assert.equal(result.comments.meta.event, 'REQUEST_CHANGES');
		assert.equal(result.comments.meta.repo, 'acme/demo');
		assert.match(result.comments.summary, /Architecture \(minor\)/);
	});

	test('skips findings already present in the draft', () => {
		const finding = {
			path: 'src/a.ts',
			content: 'boundary breach',
			startLine: 4,
			endLine: 4,
			severity: 'medium' as const,
			category: 'maintainability' as const,
		};
		const first = mergeArchitectureComments({ pr: 7, state, existing: undefined, findings: [finding] });
		const second = mergeArchitectureComments({ pr: 7, state, existing: first.comments, findings: [finding] });
		assert.equal(second.addedInline, 0);
		assert.equal(second.comments.comments.length, 1);
	});
});

describe('buildRulesGeneratePrompt', () => {
	test('names the engine, its rules folder and its authoring steps', async () => {
		const { buildRulesGeneratePrompt } = await import('./architecture-report.ts');
		const prompt = buildRulesGeneratePrompt({
			repoRoot: '/r',
			project: 'demo',
			pr: 3,
			engine: { id: 'codeql', name: 'CodeQL', rulesDir: 'codeql' },
			guide: ['Write .ql queries in codeql/architecture/.'],
		});
		assert.match(prompt, /^# Generate codeql architecture rules for demo/);
		assert.match(prompt, /CodeQL rule set under `codeql\/`/);
		assert.match(prompt, /2\. Write \.ql queries/);
		assert.match(prompt, /pr_review_architecture_rescan` with pr=3/);
	});
});
