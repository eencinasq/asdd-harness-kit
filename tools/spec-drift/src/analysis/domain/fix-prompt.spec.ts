import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildFixPrompt } from './fix-prompt.ts';

const rule = { id: 'arch.no-infra', severity: 'ERROR', message: 'Domain must not import infra.', adr: 'ADR-0007' };
const f = (path: string, startLine: number, checkId = rule.id) => ({
	path,
	startLine,
	message: 'imports infra',
	checkId,
});

test('spec-drift-demand REQ-002: the fix prompt lists the rule violations, asks to confirm, and rescans the paths', () => {
	const prompt = buildFixPrompt({ rule, findings: [f('src/a.ts', 3), f('src/b.ts', 9), f('src/c.ts', 1, 'other')] });
	assert.match(prompt, /^Fix the 2 violations of rule `arch\.no-infra` \(ERROR, ADR-0007\)\./);
	assert.match(prompt, /- src\/a\.ts:3 — imports infra\n- src\/b\.ts:9 — imports infra\n/);
	assert.doesNotMatch(prompt, /src\/c\.ts/);
	assert.match(prompt, /wait for their confirmation before editing/);
	assert.match(prompt, /no `nosemgrep` comments/);
	assert.match(prompt, /analyze_spec_drift` with `\{ "paths": \["src\/a\.ts","src\/b\.ts"\] \}`/);
	assert.match(prompt, /server only reads/);
});

test('spec-drift-demand REQ-002: long lists are capped; a clean rule has nothing to fix', () => {
	const many = Array.from({ length: 5 }, (_, i) => f(`src/f${i}.ts`, 1));
	const prompt = buildFixPrompt({ rule, findings: many, max: 2 });
	assert.match(prompt, /Violations \(the first 2 of 5\):/);
	assert.match(prompt, /continue with the remaining 3/);
	assert.match(buildFixPrompt({ rule, findings: [] }), /no violations in the latest scan/);
});
