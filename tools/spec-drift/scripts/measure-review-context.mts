/**
 * How much a full review loop sends back to the model, per tool call, on the e2e sandbox PR
 * (fake gh, real git + semgrep). Use it to compare prompt / payload changes.
 *   pnpm measure:context
 * `text` is what the model reads; `structured` is structuredContent (some clients show it too).
 */
import 'reflect-metadata';

import path from 'node:path';

import type { Client } from '@modelcontextprotocol/client';
import { connectMcpClient } from '@nestjs/mcp/testing';
import { Test } from '@nestjs/testing';

import { createReviewedRepo, FAKE_GH_BIN, PR_NUMBER, tmpDir } from '../test/fixtures/sandbox.ts';

const TICKET = `## Acceptance Criteria
- Raw payloads are parsed into objects
- Invalid JSON returns a clear error instead of throwing
- Expressions are evaluated without eval

## Definition of Done
- Unit tests for the parser
`;

const sandbox = createReviewedRepo();
Object.assign(process.env, {
	PATH: `${FAKE_GH_BIN}${path.delimiter}${process.env['PATH']}`,
	FAKE_GH_STATE: sandbox.ghState,
	PR_REVIEW_ROOT: tmpDir('mcp-measure-artifacts'),
});
const { AppModule } = await import('../src/app.module.ts');
const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
await moduleRef.init();
const client: Client = await connectMcpClient(moduleRef);

type Row = { step: string; text: number; structured: number };
const rows: Row[] = [];
const call = async (step: string, name: string, args: Record<string, unknown> = {}) => {
	const result = await client.callTool({ name, arguments: { pr: PR_NUMBER, repoPath: sandbox.repo, ...args } });
	const text = (result.content as Array<{ text?: string }>).map((c) => c.text ?? '').join('\n');
	if (result.isError) throw new Error(`${name}: ${text}`);
	rows.push({
		step,
		text: text.length,
		structured: result.structuredContent ? JSON.stringify(result.structuredContent).length : 0,
	});
	if (process.env['DUMP'] === step)
		console.log(text, '\n=====STRUCT', JSON.stringify(result.structuredContent).slice(0, 3000));
	return { text, structured: result.structuredContent as Record<string, unknown> | undefined };
};

try {
	const tools = await client.listTools();
	const toolDefs = JSON.stringify(tools.tools.filter((t) => !(t._meta as { ui?: unknown })?.ui)).length;

	await call('start', 'pr_review_start', { ticket: { source: 'text', ref: 'DEMO-1', text: TICKET } });
	const groups = 2;
	for (let i = 0; i < groups; i += 1) {
		await call(`next_group ${i}`, 'pr_review_next_group');
		await call(
			`submit_findings ${i}`,
			'pr_review_submit_findings',
			i === 0
				? {
						groupIndex: 0,
						findings: [
							{
								path: 'src/util.py',
								startLine: 4,
								endLine: 4,
								severity: 'high',
								category: 'security',
								content: 'eval on caller input runs arbitrary code. Use ast.literal_eval or a parser.',
								confidence: 90,
								evidence: 'run(expr) passes expr straight to eval.',
							},
						],
					}
				: { groupIndex: i, findings: [] },
		);
	}
	await call('read_file', 'pr_review_read_file', { path: 'src/app.ts' });
	await call('verify_findings', 'pr_review_verify_findings', { results: [{ id: 'F1', verdict: 'confirmed' }] });
	await call('submit_requirements', 'pr_review_submit_requirements', {
		results: ['AC-1', 'AC-2', 'AC-3', 'DOD-1'].map((id) => ({ id, status: 'met' })),
	});
	await call('status', 'pr_review_status');

	const pad = (s: string | number, n: number) => String(s).padStart(n);
	console.log(`${'step'.padEnd(22)}${pad('text', 8)}${pad('structured', 12)}`);
	for (const r of rows) console.log(`${r.step.padEnd(22)}${pad(r.text, 8)}${pad(r.structured, 12)}`);
	const text = rows.reduce((s, r) => s + r.text, 0);
	const structured = rows.reduce((s, r) => s + r.structured, 0);
	console.log(`${'total'.padEnd(22)}${pad(text, 8)}${pad(structured, 12)}`);
	console.log(`model-visible tool definitions: ${toolDefs} chars (sent every turn, usually cached)`);
	console.log(
		`≈ tokens (chars/4): text ${Math.round(text / 4)}, text+structured ${Math.round((text + structured) / 4)}`,
	);
} finally {
	await client.close();
	await moduleRef.close();
}
