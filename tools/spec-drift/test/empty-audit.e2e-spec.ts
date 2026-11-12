/**
 * spec-drift-empty REQ-003, REQ-004 end to end: without the kit (no .harness/) the audit tools return "no data", not an
 * error; with the kit but nothing recorded they say what is missing; with no Semgrep rules the architecture check
 * carries the agent prompt that writes them. The server writes nothing.
 */
import 'reflect-metadata';

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

import type { Client } from '@modelcontextprotocol/client';
import { connectMcpClient } from '@nestjs/mcp/testing';
import { Test, type TestingModule } from '@nestjs/testing';
import type * as z from 'zod';

import { AppModule } from '../src/app.module.ts';
import {
	AuditDiffOutput,
	AuditReportOutput,
	VerifyArchitectureOutput,
	VerifySpecComplianceOutput,
} from '../src/audit/audit.output.ts';
import { AUDIT_OPTIONS } from '../src/audit/audit.service.ts';
import { AuditQueryOutput, LearningReportOutput } from '../src/audit/audit-insight.output.ts';

type Json = Record<string, unknown> & { no_data?: { reason: string; next: string } };

const roots: string[] = [];
const servers: { moduleRef: TestingModule; client: Client }[] = [];

const repo = (withKit: boolean): string => {
	const root = mkdtempSync(path.join(os.tmpdir(), 'sd-empty-audit-'));
	roots.push(root);
	execFileSync('git', ['init', '-q'], { cwd: root });
	mkdirSync(path.join(root, 'src'));
	writeFileSync(path.join(root, 'src/a.ts'), 'export const a = 1;\n');
	if (withKit) {
		mkdirSync(path.join(root, '.harness/state'), { recursive: true });
		writeFileSync(
			path.join(root, '.harness/state/manifest.json'),
			'{ "schema_version": "3.0", "active_slices": [] }\n',
		);
	}
	return root;
};

const serve = async (root: string): Promise<Client> => {
	const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
		.overrideProvider(AUDIT_OPTIONS)
		.useValue({ root, semgrepBin: path.join(root, 'no-semgrep'), gateTimeoutMs: 10_000 })
		.compile();
	await moduleRef.init();
	const client = await connectMcpClient(moduleRef);
	servers.push({ moduleRef, client });
	return client;
};

const call = async (client: Client, name: string, args: Record<string, unknown> = {}) => {
	const r = await client.callTool({ name, arguments: args });
	return { isError: r.isError === true, s: (r.structuredContent ?? {}) as Json };
};

let noKit: Client;
let kit: Client;
let noKitRoot: string;
let kitRoot: string;

before(async () => {
	noKitRoot = repo(false);
	kitRoot = repo(true);
	noKit = await serve(noKitRoot);
	kit = await serve(kitRoot);
});

after(async () => {
	for (const { client, moduleRef } of servers) {
		await client.close();
		await moduleRef.close();
	}
	for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const TOOLS: [string, Record<string, unknown>, z.ZodType][] = [
	['audit_diff', {}, AuditDiffOutput],
	['verify_architecture_rules', {}, VerifyArchitectureOutput],
	['verify_spec_compliance', { slice_id: 's1' }, VerifySpecComplianceOutput],
	['audit_report', {}, AuditReportOutput],
	['audit_query', {}, AuditQueryOutput],
	['learning_report', {}, LearningReportOutput],
];

test('spec-drift-empty REQ-004: without the kit, every audit tool returns no data — not an error', async () => {
	for (const [name, args, schema] of TOOLS) {
		const { isError, s } = await call(noKit, name, args);
		assert.equal(isError, false, name);
		assert.ok(schema.safeParse(s).success, `${name} matches its output schema`);
		assert.match(s.no_data?.reason ?? '', /asdd harness is not installed .* no spec data to audit/, name);
		assert.match(s.no_data?.next ?? '', /asdd install/);
		assert.deepEqual(s['findings'] ?? [], [], name);
	}
	assert.deepEqual(readdirSync(noKitRoot).sort(), ['.git', 'src'], 'the server wrote nothing');
});

test('spec-drift-empty REQ-004: with the kit and nothing recorded, the tools say what is missing', async () => {
	const report = await call(kit, 'audit_report');
	assert.equal(report.isError, false);
	assert.match(report.s.no_data?.reason ?? '', /No audit report/);
	assert.match(report.s.no_data?.next ?? '', /asdd audit/);
	const slices = await call(kit, 'verify_spec_compliance', { slice_id: 's1' });
	assert.equal(slices.isError, false);
	assert.match(slices.s.no_data?.reason ?? '', /No slices/);
	const query = await call(kit, 'audit_query', { from: 'report' });
	assert.equal(query.isError, false);
	assert.ok(AuditQueryOutput.safeParse(query.s).success);
	assert.equal(query.s['total'], 0);
	assert.match(query.s.no_data?.reason ?? '', /No audit report/);
	const learning = await call(kit, 'learning_report');
	assert.equal(learning.isError, false);
	assert.match(learning.s.no_data?.reason ?? '', /No failure-log incidents/);
	const diff = await call(kit, 'audit_diff');
	assert.equal(diff.isError, false);
	assert.equal(diff.s.no_data, undefined, 'with the kit, audit_diff runs the checks');
});

test('spec-drift-empty REQ-003: with no Semgrep rules, the architecture check offers the agent prompt (not a pass)', async () => {
	const arch = await call(kit, 'verify_architecture_rules');
	assert.equal(arch.isError, false);
	assert.equal(arch.s['status'], 'unconfigured');
	assert.match(String(arch.s['generate_prompt']), /Create a project-specific Semgrep rule set under `\.semgrep\/`/);
	assert.match(String(arch.s['generate_prompt']), /uses the asdd harness/);
	const diff = await call(kit, 'audit_diff');
	assert.match(String((diff.s['architecture'] as Json)['generate_prompt']), /\.semgrep\/architecture\//);
	assert.deepEqual(readdirSync(kitRoot).sort(), ['.git', '.harness', 'src'], 'the server wrote nothing');
});
