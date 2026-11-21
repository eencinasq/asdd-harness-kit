import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildRulesPrompt } from './rules-prompt.ts';

const engine = { id: 'semgrep', name: 'Semgrep', rulesDir: '.semgrep' };
const base = { repoRoot: '/repo', project: 'repo', engine, guide: [], done: 'Then call `analyze_security`.' };

test('a first rule set: no rules yet, the whole rules dir', () => {
	const prompt = buildRulesPrompt(base);
	assert.match(prompt, /^# Generate \.semgrep architecture rules for repo/);
	assert.match(prompt, /There is no usable `\.semgrep\/` config/);
	assert.match(prompt, /Create a project-specific Semgrep rule set/);
});

test('with existing rules the agent extends the set: they keep running, no duplicate ids', () => {
	const prompt = buildRulesPrompt({ ...base, set: 'security', existing: ['sec.no-eval', 'sec.no-shell'] });
	assert.match(prompt, /^# Generate \.semgrep\/security security rules for repo/);
	assert.match(prompt, /`\.semgrep\/security\/` already has 2 rule\(s\): `sec\.no-eval`, `sec\.no-shell`/);
	assert.match(prompt, /Extend a project-specific Semgrep \*\*security\*\* rule set/);
	assert.match(prompt, /Keep the existing rules: they still run\. Add only rules for gaps/);
	assert.match(prompt, /Then call `analyze_security`\./);
});
