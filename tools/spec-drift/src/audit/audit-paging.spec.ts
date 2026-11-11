import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AuditFinding } from './audit.types.ts';
import { FindingsPageStore, UI_RESULT_BUDGET } from './audit-paging.ts';

const findings = (n: number, paths = 1): AuditFinding[] =>
	Array.from({ length: n }, (_, i) => ({
		id: `AUD-${String(i).padStart(8, '0')}`,
		check: 'UNOWNED',
		severity: ['fail', 'warn', 'advisory'][i % 3] ?? 'warn',
		message: `finding ${i} `.repeat(8),
		paths: Array.from({ length: paths }, (_, p) => `src/module-${p}/file.ts`),
	}));

test('REQ-003: small results pass unchanged', () => {
	const store = new FindingsPageStore();
	const payload = { findings: findings(2) };
	assert.equal(store.compact(payload, 'audit_report'), payload);
	const noFindings = { error: 'x' };
	assert.equal(store.compact(noFindings, 'audit_report'), noFindings);
});

test('REQ-003: large results fit the budget and page back every finding in order', () => {
	const store = new FindingsPageStore();
	const all = findings(100, 20);
	const cut = store.compact({ findings: all, recurring: [all[0]?.id], output: 'x'.repeat(5000) }, 'audit_diff');
	assert.ok(JSON.stringify(cut, null, 2).length <= UI_RESULT_BUDGET);
	const page = cut['page'] as { token: string; count: number; total: number; tool: string };
	assert.equal(page.total, 100);
	assert.equal(page.tool, 'audit_diff');
	assert.equal(cut['recurring'], 1);
	assert.equal(cut['output_truncated'], true);
	assert.equal(cut.findings?.[0]?.recurring, true);
	assert.equal(cut.findings?.[0]?.paths?.length, 5);
	const ids = (cut.findings ?? []).map((f) => f.id);
	let offset: number | null = page.count;
	while (offset !== null) {
		const next = store.page(page.token, offset);
		assert.equal(next.findings?.[0]?.paths?.length, 20, 'pages keep every path');
		ids.push(...(next.findings ?? []).map((f) => f.id));
		offset = next['next'] as number | null;
	}
	assert.deepEqual(
		ids,
		all.map((f) => f.id),
	);
});

test('REQ-003: unknown and expired tokens are errors', () => {
	const store = new FindingsPageStore(1);
	const first = store.store(findings(1));
	store.store(findings(1));
	assert.match(String(store.page(first)['error']), /unknown or expired/);
	assert.match(String(store.page('nope')['error']), /unknown or expired/);
});
