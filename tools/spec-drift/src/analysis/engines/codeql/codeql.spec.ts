import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import type { ProcessRunner } from '../../../common/process/process-runner.service.ts';
import { CodeqlAnalyzer } from './codeql.analyzer.ts';
import { detectLanguage, parseQuery, sarifFindings } from './codeql-queries.ts';

const QUERY = `/**
 * @name Domain must not import infrastructure
 * @description Keeps the domain free of adapters.
 * @kind problem
 * @problem.severity error
 * @id acme/domain-imports-infra
 * @tags architecture
 *       adr:ADR-0007
 */
import javascript
from ImportDeclaration i
where i.getFile().getRelativePath().matches("src/domain/%") and i.getImportedPath().getValue().matches("%infra%")
select i, "Domain imports infrastructure."
`;

test('spec-drift-demand REQ-005: a query header becomes a rule (id, severity, name, category, ADR)', () => {
	assert.deepEqual(parseQuery(QUERY, 'domain', 'architecture'), {
		id: 'acme/domain-imports-infra',
		severity: 'ERROR',
		message: 'Domain must not import infrastructure',
		category: 'architecture',
		adr: 'ADR-0007',
		pack: 'domain',
		mode: 'problem',
	});
	assert.equal(parseQuery('/** @name x */ select 1', 'p', 's'), null, 'a query without @id is not a rule');
	assert.equal(parseQuery(QUERY.replace('error', 'recommendation'), 'p', '')?.severity, 'INFO');
});

test('spec-drift-demand REQ-005: SARIF results map to findings of declared rules; the language is detected', () => {
	const rule = parseQuery(QUERY, 'domain', 'architecture');
	assert.ok(rule);
	const sarif = {
		runs: [
			{
				results: [
					{
						ruleId: 'acme/domain-imports-infra',
						message: { text: 'Domain imports infrastructure.' },
						locations: [
							{ physicalLocation: { artifactLocation: { uri: 'src/domain/order.ts' }, region: { startLine: 2 } } },
						],
					},
					{ ruleId: 'js/unused-local', locations: [{ physicalLocation: { artifactLocation: { uri: 'a.ts' } } }] },
				],
			},
		],
	};
	assert.deepEqual(sarifFindings(sarif, [rule]), [
		{
			checkId: 'acme/domain-imports-infra',
			path: 'src/domain/order.ts',
			startLine: 2,
			endLine: 2,
			severity: 'ERROR',
			message: 'Domain imports infrastructure.',
			category: 'architecture',
			adr: 'ADR-0007',
			pack: 'domain',
		},
	]);
	assert.equal(detectLanguage(['a.ts', 'b.tsx', 'c.py']), 'javascript-typescript');
	assert.equal(detectLanguage(['README.md']), null);
});

test('spec-drift-demand REQ-005: the adapter lists packs, builds the database, analyzes to SARIF, and filters paths', async () => {
	const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-codeql-'));
	fs.mkdirSync(path.join(repo, 'codeql/architecture'), { recursive: true });
	fs.writeFileSync(path.join(repo, 'codeql/architecture/domain.ql'), QUERY);
	const calls: string[][] = [];
	const runner = {
		run: async (command: string, args: readonly string[]) => {
			calls.push([command, ...args]);
			if (command === 'git') return { code: 0, stdout: 'src/domain/order.ts\nsrc/app/x.ts\n', stderr: '' };
			const out = args.find((a) => a.startsWith('--output='))?.slice('--output='.length);
			if (out) {
				const result = (uri: string) => ({
					ruleId: 'acme/domain-imports-infra',
					locations: [{ physicalLocation: { artifactLocation: { uri }, region: { startLine: 2 } } }],
				});
				fs.writeFileSync(
					out,
					JSON.stringify({ runs: [{ results: [result('src/domain/order.ts'), result('node_modules/x.ts')] }] }),
				);
			}
			return { code: 0, stdout: '', stderr: '' };
		},
	} as unknown as ProcessRunner;
	const analyzer = new CodeqlAnalyzer(runner);
	assert.deepEqual((await analyzer.inspect(repo)).ruleFiles, ['architecture/domain.ql']);
	const packs = await analyzer.listPacks(repo);
	assert.deepEqual(
		packs.map((p) => [p.id, p.kind]),
		[
			['architecture', 'set'],
			['domain', 'file'],
		],
	);
	const rules = await analyzer.loadRules([packs[0] as (typeof packs)[number]]);
	assert.equal(rules[0]?.pack, 'architecture');
	const run = await analyzer.run({
		repoRoot: repo,
		packs: [packs[0] as (typeof packs)[number]],
		rules,
		exclude: ['node_modules'],
		timeoutMs: 1000,
	});
	assert.deepEqual(
		run.findings.map((f) => `${f.path}:${f.startLine}`),
		['src/domain/order.ts:2'],
		'excluded folders are dropped',
	);
	const create = calls.find((c) => c[1] === 'database' && c[2] === 'create');
	assert.ok(create?.includes('--language=javascript-typescript'));
	assert.ok(create?.includes(`--source-root=${repo}`));
	const analyze = calls.find((c) => c[2] === 'analyze');
	assert.ok(analyze?.includes('--format=sarif-latest'));
	assert.equal(analyze?.at(-1), path.join(repo, 'codeql/architecture/domain.ql'), 'queries come after --');
	const scoped = await analyzer.run({
		repoRoot: repo,
		packs: [packs[0] as (typeof packs)[number]],
		rules,
		paths: ['src/app'],
		timeoutMs: 1000,
	});
	assert.deepEqual(scoped.findings, [], 'limited to the given paths');
});

test('spec-drift-demand REQ-005: a missing codeql CLI fails the scan with a message naming it', async () => {
	const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-codeql-'));
	fs.mkdirSync(path.join(repo, 'codeql'));
	fs.writeFileSync(path.join(repo, 'codeql/q.ql'), QUERY);
	const runner = {
		run: async (command: string) => {
			if (command === 'git') return { code: 0, stdout: 'a.ts\n', stderr: '' };
			throw Object.assign(new Error('spawn codeql ENOENT'), { code: 'ENOENT' });
		},
	} as unknown as ProcessRunner;
	const analyzer = new CodeqlAnalyzer(runner);
	const packs = await analyzer.listPacks(repo);
	await assert.rejects(
		analyzer.run({ repoRoot: repo, packs, rules: await analyzer.loadRules(packs), timeoutMs: 1000 }),
		/codeql CLI is not installed/,
	);
});
