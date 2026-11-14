/**
 * spec-drift-depth REQ-003 end to end: the `Dependency layers` table of domain-layer.project.md runs as the
 * `dependencies` pack next to Semgrep — dep-layer and dep-cycle findings at the import line, through the same
 * CodeAnalyzer port, with baseline status and drift report like any rule; no table, no pack; a PR snapshot checks the
 * given files' layers only.
 */
import 'reflect-metadata';

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';

import type { Client } from '@modelcontextprotocol/client';
import { connectMcpClient } from '@nestjs/mcp/testing';
import { Test, type TestingModule } from '@nestjs/testing';

import type { ScanSummary } from '../src/analysis/analysis.types.ts';
import { CODE_ANALYZER, type CodeAnalyzer } from '../src/analysis/ports/code-analyzer.port.ts';
import { hasSemgrep, tmpDir } from './fixtures/sandbox.ts';

type CallResult = Awaited<ReturnType<Client['callTool']>>;
const textOf = (r: CallResult) => (r.content as Array<{ text?: string }>).map((c) => c.text ?? '').join('\n');

const write = (root: string, files: Record<string, string>): void => {
	for (const [rel, text] of Object.entries(files)) {
		fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
		fs.writeFileSync(path.join(root, rel), text);
	}
};
const git = (cwd: string, ...args: string[]) =>
	execFileSync(
		'git',
		['-c', 'user.name=e2e', '-c', 'user.email=e2e@example.com', '-c', 'commit.gpgsign=false', ...args],
		{
			cwd,
			encoding: 'utf8',
		},
	);

const BINDING = `# Domain layer — project binding

## Dependency layers

| Layer | Paths | May depend on |
|-------|-------|---------------|
| Domain | \`src/domain/**\` | — |
| Application | \`src/app/**\` | Domain |
| Infrastructure | \`src/infra/**\` | Domain, Application |
`;

const SEMGREP_RULES = `rules:
  - id: demo.no-console-log
    languages: [typescript]
    severity: WARNING
    message: Use the logger.
    pattern: console.log(...)
`;

const createRepo = (): string => {
	const root = tmpDir('sd-deps');
	git(root, 'init', '-q', '-b', 'main');
	write(root, {
		'.harness/steering/domain-layer.project.md': BINDING,
		'.semgrep/architecture/rules.yml': SEMGREP_RULES,
		// line 2: Domain imports Infrastructure (dep-layer)
		'src/domain/order.ts':
			"export type Order = { id: string };\nimport { log } from '../infra/log';\nexport const place = log;\n",
		'src/infra/log.ts': 'export const log = (m: string) => m;\n',
		'src/infra/db.ts': "import type { Order } from '../domain/order';\nexport const save = (o: Order) => o;\n",
		// a.ts ↔ b.ts (dep-cycle)
		'src/app/a.ts': "import { b } from './b';\nexport const a = () => b();\n",
		'src/app/b.ts': "import { a } from './a';\nexport const b = () => { console.log('b'); return a; };\n",
		'src/app/ok.ts': "import type { Order } from '../domain/order';\nexport const ok = (o: Order) => o.id;\n",
	});
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'init');
	return root;
};

describe('dependency-graph rules behind the analyzer port', () => {
	let moduleRef: TestingModule;
	let client: Client;
	let repo: string;
	const semgrep = hasSemgrep();
	const call = (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args });
	const summaryOf = (r: CallResult): ScanSummary => {
		assert.ok(!r.isError, textOf(r));
		return r.structuredContent as unknown as ScanSummary;
	};

	before(async () => {
		repo = createRepo();
		Object.assign(process.env, { ANALYSIS_REPO_ROOT: repo, PR_REVIEW_ROOT: tmpDir('sd-deps-artifacts') });
		const { AppModule } = await import('../src/app.module.ts');
		moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
		await moduleRef.init();
		client = await connectMcpClient(moduleRef);
	});

	after(async () => {
		await client?.close();
		await moduleRef?.close();
	});

	test('spec-drift-depth REQ-003: the table is the dependencies pack, with dep-layer and dep-cycle rules', async () => {
		const { packs } = (await call('list_rule_packs')).structuredContent as { packs: Array<{ id: string }> };
		assert.ok(
			packs.some((p) => p.id === 'dependencies'),
			JSON.stringify(packs),
		);
		assert.ok(packs.some((p) => p.id === 'architecture'));
	});

	test('spec-drift-depth REQ-003: analyze_architecture reports layer and cycle findings at the import line, next to Semgrep', {
		skip: !semgrep && 'semgrep not installed',
	}, async () => {
		const summary = summaryOf(await call('analyze_architecture'));
		assert.ok(summary.packs.includes('dependencies'), summary.packs.join(', '));
		assert.ok(summary.rules.some((r) => r.id === 'dep-layer' && r.pack === 'dependencies'));
		assert.ok(summary.rules.some((r) => r.id === 'dep-cycle'));
		const layer = summary.findings.filter((f) => f.checkId === 'dep-layer');
		assert.deepEqual(
			layer.map((f) => [f.path, f.startLine, f.severity]),
			[['src/domain/order.ts', 2, 'ERROR']],
		);
		assert.match(layer[0]?.message ?? '', /^Domain must not depend on Infrastructure: imports src\/infra\/log\.ts/);
		const cycle = summary.findings.filter((f) => f.checkId === 'dep-cycle');
		assert.deepEqual(
			cycle.map((f) => [f.path, f.startLine, f.message]),
			[['src/app/a.ts', 1, 'Import cycle: src/app/a.ts → src/app/b.ts → src/app/a.ts.']],
		);
		assert.ok(
			summary.findings.some((f) => f.checkId === 'demo.no-console-log'),
			'Semgrep still runs',
		);
		const drifting = summary.drift.items.filter((i) => i.status === 'drifting').map((i) => i.ruleId);
		assert.ok(drifting.includes('dep-layer') && drifting.includes('dep-cycle'));
	});

	test('spec-drift-depth REQ-003: the analyzer port without Semgrep rules, without the table, and on a PR snapshot', async () => {
		const analyzer = moduleRef.get<CodeAnalyzer>(CODE_ANALYZER);

		// Only the table: the dependencies pack alone still runs (no Semgrep needed).
		const onlyTable = tmpDir('sd-deps-only');
		fs.cpSync(repo, onlyTable, { recursive: true });
		fs.rmSync(path.join(onlyTable, '.semgrep'), { recursive: true });
		const packs = await analyzer.listPacks(onlyTable);
		assert.deepEqual(
			packs.map((p) => p.id),
			['dependencies'],
		);
		const location = await analyzer.inspect(onlyTable);
		assert.equal(location.exists, true);
		assert.deepEqual(location.ruleFiles, ['../.harness/steering/domain-layer.project.md']);
		const run = await analyzer.run({
			repoRoot: onlyTable,
			packs,
			rules: await analyzer.loadRules(packs),
			timeoutMs: 30_000,
		});
		assert.deepEqual(run.findings.map((f) => f.checkId).sort(), ['dep-cycle', 'dep-layer']);

		// No table: no pack.
		const noTable = tmpDir('sd-deps-none');
		fs.cpSync(repo, noTable, { recursive: true });
		fs.rmSync(path.join(noTable, '.harness'), { recursive: true });
		assert.ok(!(await analyzer.listPacks(noTable)).some((p) => p.id === 'dependencies'));

		// A PR snapshot: only the given file's layers; cycles need the whole graph.
		const snapshot = tmpDir('sd-deps-pr');
		write(snapshot, { 'src/app/b.ts': "import { save } from '../infra/db';\nexport const b = save;\n" });
		const pr = await analyzer.run({
			repoRoot: onlyTable,
			packs,
			rules: await analyzer.loadRules(packs),
			paths: ['src/app/b.ts'],
			targetRoot: snapshot,
			timeoutMs: 30_000,
		});
		assert.deepEqual(
			pr.findings.map((f) => [f.checkId, f.path, f.startLine]),
			[['dep-layer', 'src/app/b.ts', 1]],
		);
	});
});
