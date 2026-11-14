import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';

import {
	adrIndexBinding,
	adrRefs,
	buildAdrRulePrompt,
	computeAdrCoverage,
	locateAdrs,
	parseAdr,
	readAdrs,
} from './adr-coverage.ts';

const ENGINE = { id: 'semgrep', name: 'Semgrep', rulesDir: '.semgrep' };

const repo = (files: Record<string, string>): string => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'adr-cov-'));
	for (const [rel, text] of Object.entries(files)) {
		fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
		fs.writeFileSync(path.join(root, rel), text);
	}
	return root;
};

describe('rule-coverage REQ-001: ADR discovery', () => {
	test('the kit binding wins, then .adr-dir, then the conventional folders', () => {
		const root = repo({
			'.harness/steering/structure.md': '| Key | Value |\n|---|---|\n| ADR index | `arch/records/` |\n',
			'arch/records/0001-a.md': '# ADR-0001: A\n',
			'.adr-dir': 'doc/arch\n',
			'doc/arch/0001-b.md': '# 1. B\n',
			'docs/decisions/001-c.md': '# ADR-001: C\n',
		});
		assert.deepEqual(locateAdrs(root), { dir: 'arch/records', source: 'binding' });
		fs.rmSync(path.join(root, '.harness'), { recursive: true });
		assert.deepEqual(locateAdrs(root), { dir: 'doc/arch', source: 'adr-dir' });
		fs.rmSync(path.join(root, '.adr-dir'));
		assert.deepEqual(locateAdrs(root), { dir: 'docs/decisions', source: 'default' });
		fs.rmSync(path.join(root, 'docs'), { recursive: true });
		assert.deepEqual(locateAdrs(root), { dir: null, source: 'none' });
		assert.equal(adrIndexBinding('| ADR index | none yet (decisions live in slice designs) |'), null);
	});

	test('id, title, status and enforcement from the kit, MADR, and adr-tools formats', () => {
		assert.deepEqual(
			parseAdr('docs/decisions/0010-db.md', '# ADR-0010: Postgres for orders\n\n## Status\n\nAccepted\n\n## Context\n'),
			{
				id: 'ADR-0010',
				number: 10,
				title: 'Postgres for orders',
				status: 'accepted',
				path: 'docs/decisions/0010-db.md',
				exempt: false,
				active: true,
			},
		);
		const madr = parseAdr('docs/adr/0003-hosting.md', '---\nstatus: superseded by ADR-0007\n---\n# Host on Fly\n');
		assert.equal(madr.id, 'ADR-0003');
		assert.equal(madr.status, 'superseded');
		assert.equal(madr.active, false);
		const tools = parseAdr('doc/adr/0002-x.md', '# 2. Use a monorepo\n\nStatus: Accepted\n\nEnforcement: manual\n');
		assert.deepEqual([tools.id, tools.title, tools.exempt], ['ADR-0002', 'Use a monorepo', true]);
		assert.equal(parseAdr('docs/adr/notes.md', '# Some notes\n').id, null);
	});

	test('READMEs and templates are not ADRs; one level of subfolders is read', () => {
		const root = repo({
			'docs/decisions/README.md': '# ADRs\n',
			'docs/decisions/template.md': '# ADR-NNN: <title>\n',
			'docs/decisions/0001-a.md': '# ADR-0001: A\n',
			'docs/decisions/billing/0002-b.md': '# ADR-0002: B\n',
		});
		assert.deepEqual(
			readAdrs(root, 'docs/decisions').map((a) => a.id),
			['ADR-0001', 'ADR-0002'],
		);
	});
});

describe('rule-coverage REQ-001: coverage', () => {
	const adrs = [
		parseAdr('docs/decisions/0001-a.md', '# ADR-0001: Layers\n## Status\nAccepted\n'),
		parseAdr('docs/decisions/0002-b.md', '# ADR-0002: No ORM in domain\n## Status\nAccepted\n'),
		parseAdr('docs/decisions/0003-c.md', '# ADR-0003: Old API\n## Status\nSuperseded by ADR-0004\n'),
		parseAdr('docs/decisions/0004-d.md', '# ADR-0004: Hosting\n## Status\nAccepted\nEnforcement: manual\n'),
	];
	const location = { dir: 'docs/decisions', source: 'default' as const };

	test('ids match by number; uncovered, dangling and the ratio count only enforceable ADRs', () => {
		const cov = computeAdrCoverage(location, adrs, [
			{ id: 'r.layers', adr: 'ADR-1' },
			{ id: 'r.old', adr: 'ADR-0003, ADR-0099' },
			{ id: 'r.style', adr: null },
		]);
		assert.deepEqual(cov.adrs[0]?.rules, ['r.layers']);
		assert.deepEqual([cov.total, cov.enforceable, cov.covered, cov.coverage], [4, 2, 1, 0.5]);
		assert.deepEqual(
			cov.uncovered.map((u) => u.id),
			['ADR-0002'],
		);
		assert.deepEqual(cov.dangling, [
			{ ruleId: 'r.old', adr: 'ADR-0003', reason: 'ADR is superseded' },
			{ ruleId: 'r.old', adr: 'ADR-0099', reason: 'no ADR file' },
		]);
		assert.equal(cov.rulesWithoutAdr, 1);
	});

	test('rule references: lists, spacing, and links to ADR files', () => {
		assert.deepEqual(
			adrRefs('ADR-0010, ADR 37; docs/decisions/0042-x.md').map((r) => r.number),
			[10, 37, 42],
		);
		assert.deepEqual(adrRefs(null), []);
	});

	test('no ADR folder: every cited ADR dangles and the ratio is null', () => {
		const cov = computeAdrCoverage({ dir: null, source: 'none' }, [], [{ id: 'r', adr: 'ADR-0001' }]);
		assert.equal(cov.coverage, null);
		assert.deepEqual(cov.dangling, [{ ruleId: 'r', adr: 'ADR-0001', reason: 'no ADR folder' }]);
	});
});

describe('rule-coverage REQ-002: the rule prompt for an uncovered ADR', () => {
	test('names the ADR file, metadata.adr, a test, and the tools to check the result', () => {
		const prompt = buildAdrRulePrompt({
			adr: { id: 'ADR-0002', title: 'No ORM in domain', path: 'docs/decisions/0002-b.md' },
			repoRoot: '/repo',
			engine: ENGINE,
			guide: ['Add a test file next to the rule file and run `semgrep --test .semgrep`.'],
		});
		assert.match(prompt, /^# Encode ADR-0002 as a Semgrep rule/);
		assert.match(prompt, /`docs\/decisions\/0002-b\.md`/);
		assert.match(prompt, /`metadata\.adr: ADR-0002`/);
		assert.match(prompt, /semgrep --test/);
		assert.match(prompt, /Enforcement: manual/);
		assert.match(prompt, /call `validate_rules`.*`adr_coverage`/is);
	});
});
