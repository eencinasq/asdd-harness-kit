import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CHECKLISTS, CORE_ID, checklistById, checklistPage, methodologyFile } from './checklists.ts';

test('security-review REQ-001: every vendored checklist loads with its source header', () => {
	assert.ok(CHECKLISTS.length >= 14);
	for (const c of CHECKLISTS) {
		const page = checklistPage(c.id, 1);
		assert.ok(page.text.length > 0, c.id);
		assert.match(page.text, /cloudflare\/security-audit-skill/, `${c.id} carries the source header`);
	}
	assert.ok(checklistById(CORE_ID), 'the core SKILL.md is a checklist entry');
});

test('security-review REQ-003: a checklist is paged under 6000 characters; unknown ids are refused', () => {
	const long = CHECKLISTS.map((c) => checklistPage(c.id, 1)).find((p) => p.pages > 1);
	assert.ok(long, 'at least one checklist spans several pages');
	for (let page = 1; page <= long.pages; page++) {
		assert.ok(checklistPage(long.id, page).text.length <= 6000);
	}
	assert.throws(() => checklistPage('nope', 1), /Unknown checklist 'nope'\. Valid ids: /);
});

test('security-review REQ-001: schema and validator are vendored next to the checklists', async () => {
	const fs = await import('node:fs');
	assert.ok(fs.existsSync(methodologyFile('report-schema.json')));
	assert.ok(fs.existsSync(methodologyFile('validate-findings.cjs')));
});
