/**
 * Audit tools (former spec-drift-auditor server) end to end over the in-memory MCP client, against a throwaway git
 * repo with a harness layout and the kit's own harness (cli/src/harness). Run `pnpm build` first for the dashboard test.
 */
import 'reflect-metadata';

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { type TestContext, test } from 'node:test';

import type { Client } from '@modelcontextprotocol/client';
import { connectMcpClient } from '@nestjs/mcp/testing';
import { Test } from '@nestjs/testing';

import { AppModule } from '../src/app.module.ts';
import { AUDIT_OPTIONS, type AuditOptions } from '../src/audit/audit.service.ts';

const UI_URI = 'ui://spec-drift/audit-dashboard.html';
const UI_BUDGET = 8000;
const DIST_UI = path.resolve(import.meta.dirname, '../dist/audit-dashboard.html');

type Json = Record<string, any>;

const write = (root: string, rel: string, content: string | object): void => {
	mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
	writeFileSync(path.join(root, rel), typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`);
};

const git = (root: string, ...args: string[]): string => {
	const r = spawnSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', ...args], {
		cwd: root,
		encoding: 'utf8',
	});
	assert.equal(r.status, 0, r.stderr);
	return r.stdout.trim();
};

/** Slice s1 on main; branch slice/s1/work changes a mapped file and adds an unmapped one. */
const fixture = ({ gate = 'node arch-check.mjs' } = {}): string => {
	const root = mkdtempSync(path.join(os.tmpdir(), 'sda-'));
	write(root, '.harness/state/manifest.json', {
		schema_version: '3.0',
		active_slices: [{ slice_id: 's1', phase: 'implementation', status: 'in_progress' }],
	});
	write(root, '.harness/state/registry.json', { slices: [{ slice_id: 's1' }] });
	write(root, '.harness/state/slices/s1/manifest.json', {
		slice_id: 's1',
		phase: 'implementation',
		status: 'in_progress',
	});
	write(root, '.harness/specs/s1/intent.md', '# s1\n\nMapped: `src/a.js`\n');
	write(
		root,
		'.harness/specs/s1/requirements.md',
		'- **REQ-001.** The system shall a.\n- **REQ-002.** The system shall b.\n',
	);
	write(root, '.harness/features/s1.features.json', {
		schema_version: '1.0',
		slice_id: 's1',
		source_tasks: 'x',
		features: [
			{
				id: 'F-01',
				title: 'a',
				user_visible_behavior: 'a',
				status: 'in_progress',
				priority: 1,
				verification: ['x'],
				req_ids: ['REQ-001'],
				scope_paths: ['src/a.js'],
			},
		],
	});
	write(root, '.harness/steering/domain-layer.md', '# Domain layer\n\nDomain must not import infrastructure.\n');
	write(
		root,
		'.harness/steering/domain-layer.project.md',
		`# Binding\n\n**Gate command:** \`${gate}\` (non-zero exit = not passing)\n`,
	);
	write(
		root,
		'.harness/steering/quality-gates.md',
		'- **QG-DOM-01** domain pure\n- **QG-DRIFT-01** no unmapped files\n- **QG-SEC-01** other\n',
	);
	write(
		root,
		'arch-check.mjs',
		"console.log('src/a.js:3: domain imports infra');\nconsole.log('src/other.js:1: unrelated');\nprocess.exit(1);\n",
	);
	write(root, 'src/a.js', 'export const a = 1;\n');
	write(root, 'test/a.test.js', '// covers REQ-001\n');
	git(root, 'init', '-q', '-b', 'main');
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'init');
	git(root, 'checkout', '-q', '-b', 'slice/s1/work');
	write(root, 'src/a.js', 'export const a = 2;\n');
	write(root, 'src/rogue.js', 'x\n');
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'work');
	return root;
};

const snapshot = (root: string): string => {
	const h = createHash('sha256');
	const walk = (dir: string): void => {
		for (const name of readdirSync(dir).sort()) {
			if (name === '.git') continue;
			const abs = path.join(dir, name);
			if (statSync(abs).isDirectory()) walk(abs);
			else h.update(path.relative(root, abs)).update(readFileSync(abs));
		}
	};
	walk(root);
	return h.digest('hex');
};

type Harness = {
	readonly client: Client;
	call(name: string, args?: Json): Promise<{ isError: boolean; payload: Json; text: string; structured: Json }>;
	read(uri: string): Promise<string>;
};

type FixtureOptions = { gate?: string; semgrep?: (root: string) => string };

/** One fixture repo and one server per test (the server keeps the latest audit_diff in memory). */
const withServer =
	(fn: (h: Harness, root: string) => Promise<void>, opts: FixtureOptions = {}) =>
	async (t: TestContext) => {
		const root = fixture(opts);
		const options: AuditOptions = {
			root,
			semgrepBin: opts.semgrep?.(root) ?? path.join(root, 'no-semgrep'),
			gateTimeoutMs: 30_000,
		};
		const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
			.overrideProvider(AUDIT_OPTIONS)
			.useValue(options)
			.compile();
		await moduleRef.init();
		const client = await connectMcpClient(moduleRef);
		t.after(async () => {
			await client.close();
			await moduleRef.close();
			rmSync(root, { recursive: true, force: true });
		});
		const call: Harness['call'] = async (name, args = {}) => {
			const result = await client.callTool({ name, arguments: args });
			const text = (result.content as Array<{ text?: string }>)[0]?.text ?? '';
			let payload: Json = {};
			try {
				payload = JSON.parse(text) as Json;
			} catch {
				payload = { error: text };
			}
			return { isError: result.isError === true, payload, text, structured: (result.structuredContent ?? {}) as Json };
		};
		const read: Harness['read'] = async (uri) => {
			const { contents } = await client.readResource({ uri });
			return (contents[0] as { text: string }).text;
		};
		await fn({ client, call, read }, root);
	};

test(
	'REQ-001 REQ-002: audit tools, resources, and prompts are listed and link the audit dashboard',
	withServer(async ({ client }) => {
		const { tools } = await client.listTools();
		const audit = [
			'audit_diff',
			'audit_finding',
			'audit_report',
			'generate_ci_gate',
			'verify_architecture_rules',
			'verify_spec_compliance',
		];
		for (const name of audit) {
			const tool = tools.find((t) => t.name === name);
			assert.ok(tool, name);
			assert.equal((tool._meta as Json | undefined)?.['ui']?.resourceUri, UI_URI, `${name} links the dashboard`);
			assert.equal(tool.annotations?.readOnlyHint, true, `${name} is read-only`);
		}
		const { resources } = await client.listResources();
		for (const uri of ['spec://manifest', 'spec://rules/architecture', 'spec://drift/latest-report', UI_URI]) {
			assert.ok(
				resources.some((r) => r.uri === uri),
				uri,
			);
		}
		const { prompts } = await client.listPrompts();
		for (const name of ['architecture-review', 'pr-review', 'spec-alignment']) {
			assert.ok(
				prompts.some((p) => p.name === name),
				name,
			);
		}
	}),
);

test(
	'REQ-001: audit_diff author mode reports drift and the summary',
	withServer(async ({ call }) => {
		const { payload } = await call('audit_diff', { base_branch: 'main' });
		assert.equal(payload['mode'], 'author');
		const drift01 = payload['findings'].filter((f: Json) => f['check'] === 'DRIFT-01');
		assert.deepEqual(
			drift01.map((f: Json) => f['paths']),
			[['src/rogue.js']],
		);
		assert.ok(drift01[0].id.startsWith('AUD-'));
		assert.equal(payload['summary'].files_analyzed, 2);
		assert.equal(payload['summary'].drift_level, 'blocking');
		assert.ok('spec_compliance' in payload['summary']);
		assert.equal(typeof payload['learning']?.open, 'number', 'audit_diff carries the learning view');
		const arch = payload['findings'].filter((f: Json) => f['check'] === 'ARCH');
		assert.deepEqual(
			arch.map((f: Json) => f['paths'][0]),
			['src/a.js'],
			'architecture findings are scoped to changed files',
		);
	}),
);

test(
	'REQ-001: audit_diff review mode links slices and flags unlinked PRs',
	withServer(async ({ call }, root) => {
		let { payload } = await call('audit_diff', { base_branch: 'main', mode: 'review' });
		assert.deepEqual(payload['summary'].linked_slices, ['s1']);
		assert.ok(!payload['findings'].some((f: Json) => f['check'] === 'DRIFT-07'));
		git(root, 'checkout', '-q', '-b', 'feature/unlinked');
		({ payload } = await call('audit_diff', { base_branch: 'main', mode: 'review' }));
		assert.ok(payload['findings'].some((f: Json) => f['check'] === 'DRIFT-07'));
	}),
);

test(
	'REQ-001: review mode suppresses dismissed findings until their files change',
	withServer(async ({ call }, root) => {
		const { payload } = await call('audit_diff', { base_branch: 'main', mode: 'review' });
		const target = payload['findings'].find((f: Json) => f['check'] === 'DRIFT-01');
		const { pathsHash } = (await import('../src/harness/audit-lib.mjs')) as {
			pathsHash(root: string, paths: string[]): string;
		};
		write(root, '.harness/audits/triage.json', {
			[target.id]: {
				decision: 'dismissed',
				reason: 'spike',
				by: 'tl',
				at: '2026-10-21',
				paths_hash: pathsHash(root, target.paths),
			},
		});
		let res = (await call('audit_diff', { base_branch: 'main', mode: 'review' })).payload;
		assert.ok(!res['findings'].some((f: Json) => f['id'] === target.id));
		assert.deepEqual(
			res['suppressed'].map((f: Json) => f['id']),
			[target.id],
		);
		write(root, 'src/rogue.js', 'changed\n');
		res = (await call('audit_diff', { base_branch: 'main', mode: 'review' })).payload;
		assert.ok(
			res['findings'].some((f: Json) => f['id'] === target.id),
			'dismissal expires when the file changes',
		);
	}),
);

test(
	'REQ-001: verify_architecture_rules runs the bound Gate command',
	withServer(async ({ call }) => {
		const { payload } = await call('verify_architecture_rules', { paths: ['src/a.js'] });
		assert.equal(payload['status'], 'fail');
		assert.deepEqual(
			payload['findings'].map((f: Json) => [f['paths'][0], f['line']]),
			[['src/a.js', 3]],
		);
	}),
);

test(
	'REQ-001: verify_architecture_rules is unconfigured (not a pass) without a Gate command',
	withServer(
		async ({ call }) => {
			const { payload } = await call('verify_architecture_rules', {});
			assert.equal(payload['status'], 'unconfigured');
			assert.ok(payload['sources'].some((s: Json) => s['id'] === 'domain-layer' && s['filled']));
			assert.match(payload['message'], /This is not a pass/);
		},
		{ gate: '…' },
	),
);

test(
	'REQ-001: verify_architecture_rules loads the installing app bindings and skips stubs',
	withServer(async ({ call, read }, root) => {
		write(root, '.harness/config/project.json', {
			bindings: {
				product: 'docs/product.md',
				structure: '.harness/steering/structure.md',
				tech: '../outside.md',
				domain_layer: 'docs/layers.md',
			},
		});
		write(root, 'docs/product.md', '# Payments\n\nActors settle chips.\n');
		write(
			root,
			'docs/layers.md',
			'# Layers\n\nDomain lives in `src/domain`.\n\n**Gate command:** `node arch-check.mjs`\n',
		);
		write(root, '.harness/steering/structure.md', '# Project structure (stub)\n\n…\n');
		write(root, '.harness/steering/tech.md', '# Stack\n\nRuntime is Node 22. This default must not be used.\n');
		const { payload } = await call('verify_architecture_rules', { paths: ['src/a.js'], include_text: true });
		assert.equal(payload['status'], 'fail');
		const byId = Object.fromEntries(payload['sources'].map((s: Json) => [s['id'], s]));
		assert.equal(byId.product.path, 'docs/product.md');
		assert.equal(byId.product.filled, true);
		assert.match(byId.product.text, /Actors settle chips/);
		assert.equal(byId['domain-layer.project'].path, 'docs/layers.md');
		assert.match(byId['domain-layer.project'].text, /src\/domain/);
		assert.equal(byId.structure.filled, false);
		assert.equal(byId.structure.text, undefined);
		assert.equal(
			byId.tech.path,
			'.harness/steering/tech.md',
			'a binding path outside the repo falls back to the steering file',
		);
		assert.match(byId.tech.text, /Node 22/);
		const rules = await read('spec://rules/architecture');
		assert.match(rules, /Actors settle chips/);
		assert.match(rules, /structure\.md \(unfilled; not product truth\)/);
		assert.doesNotMatch(rules, /Project structure \(stub\)/);
	}),
);

test(
	'REQ-001: verify_architecture_rules generates Semgrep rules and returns violations with fixes',
	withServer(
		async ({ call }, root) => {
			const { payload } = await call('verify_architecture_rules', { paths: ['src/a.js'], include_text: true });
			assert.equal(payload['status'], 'fail');
			assert.equal(payload['semgrep'].source, 'generated');
			assert.match(payload['semgrep'].yaml, /import \$X from \\"pg\\"/);
			const hit = payload['findings'].find((f: Json) => f['check'] === 'SEMGREP');
			assert.equal(hit.paths[0], 'src/a.js');
			assert.equal(hit.line, 3);
			assert.equal(hit.fix, 'import { Db } from "./port.js";');
			assert.equal(hit.remediation, 'use a port');
			assert.equal(existsSync(path.join(root, '.semgrep.yml')), false, 'generated config stays out of the repo');
		},
		{
			gate: '…',
			semgrep(root) {
				write(
					root,
					'.harness/steering/domain-layer.project.md',
					'# Layers\n\n| Paths | Must not import |\n|-------|-----------------|\n| `src/domain/**` | `pg` |\n',
				);
				write(
					root,
					'.harness/steering/tech.md',
					'# Stack\n\n| Layer | Technology |\n|-------|------------|\n| Language | TypeScript |\n',
				);
				const bin = path.join(root, 'fake-semgrep.mjs');
				write(
					root,
					'fake-semgrep.mjs',
					`#!/usr/bin/env node
import { readFileSync } from 'node:fs';
const config = process.argv[process.argv.indexOf('--config') + 1];
const yaml = readFileSync(config, 'utf8');
if (!yaml.includes('pg')) process.exit(2);
process.stdout.write(JSON.stringify({ results: [{ check_id: 'harness-arch-typescript-1', path: 'src/a.js', start: { line: 3 }, extra: { message: 'domain imports pg', severity: 'ERROR', fix: 'import { Db } from "./port.js";', metadata: { remediation: 'use a port' } } }] }));
`,
				);
				chmodSync(bin, 0o755);
				return bin;
			},
		},
	),
);

test(
	'REQ-001: verify_spec_compliance runs the ears adapter',
	withServer(async ({ call }) => {
		const { payload } = await call('verify_spec_compliance', { slice_id: 's1' });
		assert.equal(payload['adapters'].ears.must_requirements, 2);
		assert.equal(payload['adapters'].ears.spec_compliance, 0.5);
		assert.ok(
			payload['adapters'].ears.findings.some((f: Json) => f['check'] === 'DRIFT-03' && f['node'] === 'req:s1:REQ-002'),
		);
		assert.equal((await call('verify_spec_compliance', { slice_id: 'ghost' })).isError, true);
		assert.equal((await call('verify_spec_compliance', { slice_id: 's1', adapter: 'nope' })).isError, true);
		assert.equal((await call('verify_spec_compliance', { slice_id: ' ' })).isError, true);
	}),
);

test(
	'REQ-001: module adapters load only for enabled modules',
	withServer(async ({ call }, root) => {
		const adapter = (id: string, status: string) =>
			`export default { id: '${id}', run: ({ sliceId }) => ({ status: '${status}', findings: [{ id: 'AUD-00000001', check: 'CONTRACT', severity: 'fail', slice_id: sliceId, paths: [], message: 'x' }] }) };\n`;
		write(root, '.harness/config/project.json', { modules: { 'http-api': true, 'web-ui': false } });
		write(root, 'cli/modules/http-api/adapters/fake.mjs', adapter('fake', 'fail'));
		write(root, 'cli/modules/web-ui/adapters/off.mjs', adapter('off', 'fail'));
		write(root, '.agents/mcp/adapters/local.mjs', adapter('local', 'fail'));
		let { payload } = await call('verify_spec_compliance', { slice_id: 's1' });
		assert.deepEqual(Object.keys(payload['adapters']).sort(), ['ears', 'fake', 'local']);
		assert.equal(payload['summary'].drift_level, 'blocking');
		({ payload } = await call('verify_spec_compliance', { slice_id: 's1', adapter: 'fake' }));
		assert.deepEqual(Object.keys(payload['adapters']), ['fake']);
	}),
);

test(
	'REQ-001: generate_ci_gate returns text for github and gitlab',
	withServer(async ({ call }) => {
		for (const provider of ['github', 'gitlab']) {
			const { payload, structured } = await call('generate_ci_gate', { provider });
			// The job installs the kit version the project pins and runs the asdd command (no CLI copy in projects).
			assert.match(payload['content'], /npm i -g "asdd-harness-kit@/);
			assert.match(payload['content'], /asdd check/);
			assert.match(payload['content'], /HARNESS_PR_BRANCH/);
			assert.equal(structured['provider'], provider);
		}
		assert.equal((await call('generate_ci_gate', { provider: 'jenkins' })).isError, true);
	}),
);

test(
	'REQ-002: resources read manifest, architecture rules, and the latest report',
	withServer(async ({ call, read, client }) => {
		assert.equal(JSON.parse(await read('spec://manifest')).slices.s1.slice_id, 's1');
		const rules = await read('spec://rules/architecture');
		assert.match(rules, /Domain must not import infrastructure/);
		assert.match(rules, /QG-DRIFT-01/);
		assert.doesNotMatch(rules, /QG-SEC-01/);
		assert.equal(JSON.parse(await read('spec://drift/latest-report')).source, 'fresh check-spec-drift');
		await call('audit_diff', { base_branch: 'main' });
		assert.equal(JSON.parse(await read('spec://drift/latest-report')).source, 'audit_diff (this session)');
		await assert.rejects(client.readResource({ uri: 'spec://nope' }));
	}),
);

test(
	'REQ-002: prompts render with arguments and reject missing required ones',
	withServer(async ({ client }) => {
		const res = await client.getPrompt({
			name: 'pr-review',
			arguments: { base_branch: 'main', target_branch: 'slice/s1/work' },
		});
		const text = (res.messages[0]?.content as { text: string } | undefined)?.text ?? '';
		assert.match(text, /audit_diff/);
		assert.match(text, /mode "review"/);
		const review = await client.getPrompt({ name: 'architecture-review', arguments: { paths: 'src/a.js src/b.js' } });
		assert.match(
			(review.messages[0]?.content as { text: string } | undefined)?.text ?? '',
			/paths \["src\/a\.js", "src\/b\.js"\]/,
		);
		await assert.rejects(client.getPrompt({ name: 'spec-alignment', arguments: {} }));
	}),
);

test(
	'REQ-001: audit_report filters the latest report; audit_finding returns one finding',
	withServer(async ({ call }, root) => {
		const none = await call('audit_report', {});
		assert.equal(none.isError, false, 'no report yet is no data, not an error (spec-drift-empty REQ-004)');
		assert.match(none.structured['no_data']['next'], /asdd audit/);
		const finding = (id: string, severity: string, last_seen: string) => ({
			id,
			check: 'UNOWNED',
			severity,
			slice_id: null,
			node: null,
			paths: ['src/a.js'],
			message: id,
			last_seen,
		});
		write(root, '.harness/audits/2026-10-01T00-00-00-000Z.json', {
			generated_at: '2026-10-01',
			findings: [finding('AUD-00000000', 'warn', '2026-10-01')],
		});
		write(root, '.harness/audits/2026-10-20T00-00-00-000Z.json', {
			generated_at: '2026-10-20',
			findings: [finding('AUD-11111111', 'fail', '2026-10-20'), finding('AUD-22222222', 'advisory', '2026-10-10')],
		});
		let { payload } = await call('audit_report', {});
		assert.equal(payload['path'], '.harness/audits/2026-10-20T00-00-00-000Z.json');
		assert.equal(payload['findings'].length, 2);
		({ payload } = await call('audit_report', { severity: 'fail' }));
		assert.deepEqual(
			payload['findings'].map((f: Json) => f['id']),
			['AUD-11111111'],
		);
		({ payload } = await call('audit_report', { since: '2026-10-15' }));
		assert.deepEqual(
			payload['findings'].map((f: Json) => f['id']),
			['AUD-11111111'],
		);
		({ payload } = await call('audit_finding', { id: 'AUD-22222222' }));
		assert.equal(payload['finding'].severity, 'advisory');
		assert.equal((await call('audit_finding', { id: 'AUD-99999999' })).isError, true);
	}),
);

test(
	'REQ-003: results fit the inline budget; the same tool pages in the rest',
	withServer(async ({ call }, root) => {
		const paths = Array.from({ length: 40 }, (_, i) => `apps/api/src/module-${i}/handler.ts`);
		const findings = Array.from({ length: 120 }, (_, i) => ({
			id: `AUD-${String(i).padStart(8, '0')}`,
			source: i % 10 ? 'computational' : 'inferential',
			check: 'UNOWNED',
			severity: ['fail', 'warn', 'advisory'][i % 3],
			slice_id: null,
			node: null,
			paths,
			message: `finding ${i} `.repeat(8),
		}));
		write(root, '.harness/audits/2026-10-20T00-00-00-000Z.json', {
			generated_at: '2026-10-20',
			commit: 'abc1234',
			summary: { files_analyzed: 10 },
			findings,
			recurring: findings.slice(0, 30).map((f) => f.id),
			hotspots: [],
			commands: [],
			notes: ['n'],
		});
		const res = await call('audit_report', {});
		assert.ok(res.text.length <= UI_BUDGET, `text is ${res.text.length} bytes`);
		const first = res.structured;
		assert.deepEqual(res.payload, first, 'text and structuredContent carry the same payload');
		assert.deepEqual(first['page'].by_severity, { fail: 40, warn: 40, advisory: 40 });
		assert.equal(first['page'].by_source.inferential, 12);
		assert.equal(first['recurring'], 30);
		assert.equal(first['findings'][0].recurring, true);
		assert.equal(first['findings'][0].paths.length, 5);
		assert.equal(first['findings'][0].paths_total, 40);
		assert.equal(first['page'].tool, 'audit_report');
		const ids: string[] = first['findings'].map((f: Json) => f['id']);
		let offset: number | null = first['page'].count;
		while (offset !== null) {
			const { payload } = await call('audit_report', { page_token: first['page'].token, offset });
			assert.ok(payload['findings'].length > 0);
			assert.equal(payload['findings'][0].paths.length, 40, 'pages keep every path');
			ids.push(...payload['findings'].map((f: Json) => f['id']));
			offset = payload['next'];
		}
		assert.deepEqual(
			ids,
			findings.map((f) => f.id),
		);
		assert.equal((await call('audit_report', { page_token: 'nope' })).isError, true);
	}),
);

test(
	'REQ-003: architecture results omit source texts by default; source returns them',
	withServer(async ({ call }) => {
		const res = await call('verify_architecture_rules', {});
		assert.ok(res.text.length <= UI_BUDGET);
		const domain = res.structured['sources'].find((s: Json) => s['id'] === 'domain-layer');
		assert.equal(domain.filled, true);
		assert.equal(domain.text, undefined);
		const { payload: list } = await call('verify_architecture_rules', { source: 'list' });
		assert.ok(list['sources'].find((s: Json) => s['id'] === 'domain-layer').bytes > 0);
		const { payload: one } = await call('verify_architecture_rules', { source: 'domain-layer' });
		assert.match(one['text'], /must not import infrastructure/);
		assert.equal((await call('verify_architecture_rules', { source: 'nope' })).isError, true);
		const { payload: full } = await call('verify_architecture_rules', { include_text: true });
		assert.match(full['sources'].find((s: Json) => s['id'] === 'domain-layer').text, /must not import/);
	}),
);

test(
	'REQ-004: the audit dashboard is one self-contained MCP App file',
	{ skip: !existsSync(DIST_UI) && 'run pnpm build first' },
	withServer(async ({ client }) => {
		const { contents } = await client.readResource({ uri: UI_URI });
		const content = contents[0] as { mimeType: string; text: string };
		assert.equal(content.mimeType, 'text/html;profile=mcp-app');
		assert.match(content.text, /^<!doctype html>/i);
		assert.match(content.text, /ui\/initialize/);
		assert.doesNotMatch(content.text, /<script[^>]+src=/, 'single self-contained file');
	}),
);

test(
	'REQ-005: the audit tools are read-only',
	withServer(async ({ call, read }, root) => {
		const before = snapshot(root);
		await call('audit_diff', { base_branch: 'main', mode: 'review' });
		await call('verify_architecture_rules', {});
		await call('verify_spec_compliance', { slice_id: 's1' });
		await call('generate_ci_gate', { provider: 'github' });
		await call('audit_report', {});
		await read('spec://drift/latest-report');
		assert.equal(snapshot(root), before);
	}),
);
