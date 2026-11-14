import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parse } from 'yaml';

import { API_KEY_SECRET, CI_REVIEW_TOOLS, ciReviewWorkflow, REVIEWER_SECRET } from './ci-review.ts';

test('spec-drift-demand REQ-004: the CI workflow parses, runs Claude Code with this server, and leaves a pending review', () => {
	const text = ciReviewWorkflow({ kitRepo: 'acme/asdd-harness-kit', kitRef: 'v3.10.0' });
	const wf = parse(text) as Record<string, any>;
	assert.deepEqual(wf['on']['pull_request']['types'], ['opened', 'ready_for_review']);
	assert.deepEqual(wf['permissions'], { contents: 'read', 'pull-requests': 'read' });
	const steps = wf['jobs']['review']['steps'] as Record<string, any>[];
	const kit = steps.find((s) => s['with']?.['repository']);
	assert.deepEqual(kit?.['with'], { repository: 'acme/asdd-harness-kit', ref: 'v3.10.0', path: '.spec-drift-kit' });
	const mcp = steps.find((s) => s['name'] === 'Write the MCP config');
	assert.equal(
		mcp?.['env']['GH_TOKEN'],
		`\${{ secrets.${REVIEWER_SECRET} }}`,
		'gh runs as the reviewer, so the reviewer can submit',
	);
	assert.match(mcp?.['run'], /CI: "true"/);
	assert.match(mcp?.['run'], /SPEC_DRIFT_TOOLSETS: "review"/);
	const claude = steps.find((s) => s['uses'] === 'anthropics/claude-code-action@v1');
	assert.equal(claude?.['with']['anthropic_api_key'], `\${{ secrets.${API_KEY_SECRET} }}`);
	assert.match(claude?.['with']['claude_args'], /--mcp-config \$\{\{ runner\.temp \}\}\/spec-drift-mcp\.json/);
	const allowed = /--allowedTools (\S+)/.exec(claude?.['with']['claude_args'])?.[1]?.split(',');
	assert.deepEqual(
		allowed,
		CI_REVIEW_TOOLS.map((t) => `mcp__spec-drift__${t}`),
	);
	assert.ok(!allowed?.some((t) => /ui_publish|ui_save/.test(t)), 'no dashboard tool, nothing that submits');
	const prompt = claude?.['with']['prompt'] as string;
	assert.match(
		prompt,
		/pr_review_start with \{ "pr": \$\{\{ github\.event\.pull_request\.number \|\| inputs\.pr \}\} \}/,
	);
	assert.match(prompt, /PENDING review only/);
	assert.match(prompt, /Never approve, request changes or submit/);
	assert.match(wf['jobs']['review']['if'], /head\.repo\.full_name == github\.repository/, 'fork PRs are skipped');
});
