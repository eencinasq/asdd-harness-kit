/**
 * spec-drift-empty REQ-001, REQ-002 end to end: on a repo with no rules, the analysis says nothing was analyzed (never
 * a pass) and offers the agent prompt that writes rules from the codebase; the server writes nothing.
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

import { ScanSummaryOutput } from '../src/analysis/analysis.output.ts';

type Json = Record<string, any>;

let repo: string;
let moduleRef: TestingModule;
let client: Client;

const textOf = (r: { content?: unknown }): string =>
	((r.content as { text?: string }[] | undefined) ?? []).map((c) => c.text ?? '').join('\n');

before(async () => {
	repo = mkdtempSync(path.join(os.tmpdir(), 'sd-empty-analysis-'));
	execFileSync('git', ['init', '-q'], { cwd: repo });
	mkdirSync(path.join(repo, 'src'));
	writeFileSync(path.join(repo, 'src/a.ts'), 'export const a = 1;\n');
	mkdirSync(path.join(repo, '.harness'));
	process.env['ANALYSIS_REPO_ROOT'] = repo;
	process.env['HARNESS_ROOT'] = repo;
	process.env['PR_REVIEW_ROOT'] = mkdtempSync(path.join(os.tmpdir(), 'sd-empty-analysis-art-'));
	// ConfigModule.forRoot reads the environment when AppModule is evaluated: import it after setting it.
	const { AppModule } = await import('../src/app.module.ts');
	moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
	await moduleRef.init();
	client = await connectMcpClient(moduleRef);
});

after(async () => {
	await client?.close();
	await moduleRef?.close();
	rmSync(repo, { recursive: true, force: true });
});

test('spec-drift-empty REQ-001: with no rules, every analysis tool says nothing was analyzed — not an error, not a pass', async () => {
	for (const [name, args] of [
		['analyze_spec_drift', {}],
		['analyze_architecture', {}],
		['analyze_standards', {}],
		['rescan', { mode: 'architecture' }],
	] as const) {
		const r = await client.callTool({ name, arguments: args });
		const s = r.structuredContent as Json;
		assert.notEqual(r.isError, true, `${name}: ${textOf(r)}`);
		assert.ok(ScanSummaryOutput.safeParse(s).success, `${name} matches its output schema`);
		assert.equal(s['status'], 'no-rules', name);
		assert.equal(s['findingCount'], 0);
		assert.match(s['message'], /nothing was analyzed \(this is not a pass\)/);
		assert.match(s['generatePrompt'], /Create a project-specific Semgrep rule set under `\.semgrep\/`/);
		assert.doesNotMatch(textOf(r), /No violations/, `${name} never reads as a pass`);
		assert.match(textOf(r), /generate-architecture-rules/);
	}
	const named = await client.callTool({ name: 'analyze_spec_drift', arguments: { packs: ['boundaries'] } });
	assert.equal(named.isError, true, 'a named pack that does not exist is still bad input');
	assert.deepEqual(readdirSync(repo).sort(), ['.git', '.harness', 'src'], 'the server wrote nothing');
});

test('spec-drift-empty REQ-002: the generate-architecture-rules prompt asks the agent to write rules from this codebase', async () => {
	const { prompts } = await client.listPrompts();
	assert.ok(prompts.some((p) => p.name === 'generate-architecture-rules'));
	const { messages } = await client.getPrompt({ name: 'generate-architecture-rules', arguments: {} });
	const text = messages.map((m) => (m.content as { text?: string }).text ?? '').join('\n');
	assert.match(text, new RegExp(`Repo root: \`${repo.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')}\``));
	assert.match(text, /`\.semgrep\/architecture\/`/);
	assert.match(text, /`\.semgrep\/standards\/`/);
	assert.match(text, /uses the asdd harness \(`\.harness\/`\)/, 'kit-aware: steering and ADRs are the source');
	assert.match(text, /list the rules you plan/);
	assert.match(text, /call `analyze_spec_drift`/);
});
