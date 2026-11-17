/**
 * security-review end to end (in-memory MCP client): the security audit tools on a sandbox repo — reconnaissance,
 * checklists, findings validated by the vendored skill validator, the dashboard result — and analyze_security's
 * built-in starter pack on real Semgrep. Run state goes to XDG_STATE_HOME; the repository is never written.
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
import { SecurityStatusOutput } from '../src/security/security.output.ts';
import { hasSemgrep, tmpDir } from './fixtures/sandbox.ts';

type CallResult = Awaited<ReturnType<Client['callTool']>>;
const textOf = (r: CallResult) => (r.content as Array<{ text?: string }>).map((c) => c.text ?? '').join('\n');

const SERVER_JS = [
	"const express = require('express');",
	"const { exec } = require('node:child_process');",
	'const app = express();',
	"app.post('/run', (req, res) => {",
	'  exec(`deploy ${req.body.target}`);',
	'  res.end();',
	'});',
	'',
].join('\n');

const finding = (line: number) => ({
	verdict: 'needs_validation',
	fingerprint: 'cmd/deploy-target',
	title: 'Request body reaches a shell command',
	description: 'An unauthenticated caller can run commands on the server.',
	claimed_root_cause: 'exec() receives a string built from req.body.target.',
	trace: [
		{ kind: 'entrypoint', file: 'src/server.js', line: 4, scope: 'POST /run', description: 'req.body enters.' },
		{ kind: 'sink', file: 'src/server.js', line, scope: 'exec', description: 'string reaches exec().' },
	],
	evidence: [{ file: 'src/server.js', line, description: 'exec(`deploy ${req.body.target}`)' }],
	blockers: ['No sandbox to demonstrate execution.'],
	validation_plan: {
		local: 'Run the handler in a sandbox with a harmless target value and watch the spawned process.',
	},
});

describe('security audit tools (in-memory)', () => {
	let moduleRef: TestingModule;
	let client: Client;
	let repo: string;
	const call = (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args });

	before(async () => {
		repo = tmpDir('sec-e2e-repo');
		fs.mkdirSync(path.join(repo, 'src'));
		fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ dependencies: { express: '^5' } }));
		fs.writeFileSync(path.join(repo, 'src/server.js'), SERVER_JS);
		execFileSync('git', ['init', '-q'], { cwd: repo });
		execFileSync('git', ['add', '-A'], { cwd: repo });
		execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-qm', 'fixture'], {
			cwd: repo,
		});
		Object.assign(process.env, { ANALYSIS_REPO_ROOT: repo, XDG_STATE_HOME: tmpDir('sec-e2e-state') });
		const { AppModule } = await import('../src/app.module.ts');
		moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
		await moduleRef.init();
		client = await connectMcpClient(moduleRef);
	});

	after(async () => {
		await client?.close();
		await moduleRef?.close();
	});

	test('security-review REQ-002 REQ-010: start returns recon, ledger and a bounded prompt with the safety rules', async () => {
		const r = await call('security_audit_start');
		assert.ok(!r.isError, textOf(r));
		const s = r.structuredContent as { runId: string; surfaces: string[]; ledger: Array<{ id: string }> };
		assert.equal(s.runId, 'run-1');
		assert.ok(s.surfaces.includes('http-server'));
		assert.ok(s.ledger.some((e) => e.id === 'web-protocol-and-auth'));
		const text = textOf(r);
		assert.ok(text.length <= 8000);
		assert.match(text, /Never run project code/);
	});

	test('security-review REQ-003: a checklist is paged; an unknown id is an error with the valid ids', async () => {
		const page = await call('security_audit_checklist', { id: 'core' });
		assert.ok(!page.isError, textOf(page));
		assert.match(textOf(page), /cloudflare\/security-audit-skill/);
		const bad = await call('security_audit_checklist', { id: 'nope' });
		assert.equal(bad.isError, true);
		assert.match(textOf(bad), /Valid ids: core, reconnaissance/);
	});

	test('security-review REQ-004: an invalid submission is a tool error listing every problem', async () => {
		const r = await call('security_audit_submit_findings', { runId: 'run-1', findings: [finding(42)] });
		assert.equal(r.isError, true);
		assert.match(textOf(r), /line 42 is past the end of src\/server\.js/);
	});

	test('security-review REQ-004 REQ-005: a valid submission is stored and updates the ledger', async () => {
		const r = await call('security_audit_submit_findings', {
			runId: 'run-1',
			findings: [finding(5)],
			checklists_reviewed: ['core', 'web-protocol-and-auth'],
		});
		assert.ok(!r.isError, textOf(r));
		const s = r.structuredContent as { accepted: number; ledger: Array<{ id: string; status: string }> };
		assert.equal(s.accepted, 1);
		assert.equal(s.ledger.find((e) => e.id === 'core')?.status, 'reviewed');
	});

	test('security-review REQ-009: status opens the dashboard with a result under 8 KB', async () => {
		const r = await call('security_audit_status');
		assert.ok(!r.isError, textOf(r));
		assert.ok(SecurityStatusOutput.safeParse(r.structuredContent).success);
		assert.ok(JSON.stringify(r.structuredContent).length < 8 * 1024);
		const s = r.structuredContent as {
			counts: { byVerdict: Record<string, number> };
			findings: { items: Array<{ location: string }> };
		};
		assert.equal(s.counts.byVerdict['needs_validation'], 1);
		assert.equal(s.findings.items[0]?.location, 'src/server.js:5');
	});

	test('security-review REQ-010: the audit wrote nothing into the repository', () => {
		const status = execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' });
		assert.equal(status.trim(), '');
	});

	test('security-review REQ-006: analyze_security runs the built-in pack when the repo has none', {
		skip: !hasSemgrep() && 'semgrep not installed',
	}, async () => {
		const r = await call('analyze_security');
		assert.ok(!r.isError, textOf(r));
		const s = r.structuredContent as unknown as ScanSummary;
		assert.equal(s.mode, 'security');
		assert.deepEqual(s.packs, ['builtin-security']);
		assert.ok(
			s.findings.some((f) => f.checkId.endsWith('security.js.command-injection') && f.path.endsWith('src/server.js')),
			JSON.stringify(s.findings.map((f) => [f.checkId, f.path])),
		);
	});
});
