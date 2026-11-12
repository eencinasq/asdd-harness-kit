/**
 * spec-drift-apps REQ-001: every audit and analysis tool declares an outputSchema, and real results validate against it.
 * The SDK already rejects a non-error result that fails its schema (the audit and analysis e2e suites call every tool on
 * fixtures); this suite checks the declared contract and re-validates results client-side with the same zod schemas.
 */
import 'reflect-metadata';

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

import type { Client } from '@modelcontextprotocol/client';
import { connectMcpClient } from '@nestjs/mcp/testing';
import { Test, type TestingModule } from '@nestjs/testing';

import { RulePacksOutput } from '../src/analysis/analysis.output.ts';
import { AppModule } from '../src/app.module.ts';
import { GenerateCiGateOutput, VerifySpecComplianceOutput } from '../src/audit/audit.output.ts';
import { AUDIT_OPTIONS } from '../src/audit/audit.service.ts';

export const TYPED_TOOLS = [
	'audit_diff',
	'verify_architecture_rules',
	'verify_spec_compliance',
	'generate_ci_gate',
	'audit_report',
	'audit_finding',
	'analyze_architecture',
	'analyze_standards',
	'analyze_spec_drift',
	'list_rule_packs',
	'rescan',
];

let moduleRef: TestingModule;
let client: Client;
let root: string;

before(async () => {
	root = mkdtempSync(path.join(os.tmpdir(), 'sd-output-'));
	// The kit is installed with one slice, so an unknown slice id is bad input (without the kit it is "no data").
	mkdirSync(path.join(root, '.harness/state'), { recursive: true });
	writeFileSync(
		path.join(root, '.harness/state/manifest.json'),
		'{ "schema_version": "3.0", "active_slices": [{ "slice_id": "s1" }] }\n',
	);
	moduleRef = await Test.createTestingModule({ imports: [AppModule] })
		.overrideProvider(AUDIT_OPTIONS)
		.useValue({ root, semgrepBin: path.join(root, 'no-semgrep'), gateTimeoutMs: 10_000 })
		.compile();
	await moduleRef.init();
	client = await connectMcpClient(moduleRef);
});

after(async () => {
	await client?.close();
	await moduleRef?.close();
	rmSync(root, { recursive: true, force: true });
});

test('spec-drift-apps REQ-001: every audit and analysis tool declares an object outputSchema', async () => {
	const { tools } = await client.listTools();
	for (const name of TYPED_TOOLS) {
		const tool = tools.find((t) => t.name === name);
		assert.ok(tool, `${name} is listed`);
		assert.equal(tool.outputSchema?.type, 'object', `${name} declares an object outputSchema`);
		assert.ok(Object.keys(tool.outputSchema?.properties ?? {}).length > 0, `${name} names its fields`);
	}
});

test('spec-drift-apps REQ-001: results validate against the declared schemas; errors stay tool errors', async () => {
	const ci = await client.callTool({ name: 'generate_ci_gate', arguments: { provider: 'github' } });
	assert.notEqual(ci.isError, true);
	assert.ok(GenerateCiGateOutput.safeParse(ci.structuredContent).success);

	const packs = await client.callTool({ name: 'list_rule_packs', arguments: {} });
	assert.notEqual(packs.isError, true);
	assert.ok(RulePacksOutput.safeParse(packs.structuredContent).success);

	// An unknown slice is a tool error: it carries no structured result to validate.
	const unknown = await client.callTool({ name: 'verify_spec_compliance', arguments: { slice_id: 'nope' } });
	assert.equal(unknown.isError, true);
	assert.equal(VerifySpecComplianceOutput.safeParse(unknown.structuredContent).success, false);
});
