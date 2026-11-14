/**
 * spec-drift-apps REQ-002…004 end to end: learning_report and audit_query over a throwaway repo, read-only, with
 * declared output schemas; and no tool that writes triage.
 */
import 'reflect-metadata';

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

import type { Client } from '@modelcontextprotocol/client';
import { connectMcpClient } from '@nestjs/mcp/testing';
import { Test, type TestingModule } from '@nestjs/testing';

import { AppModule } from '../src/app.module.ts';
import { AUDIT_OPTIONS } from '../src/audit/audit.service.ts';
import { AuditQueryOutput, LearningReportOutput } from '../src/audit/audit-insight.output.ts';

type Json = Record<string, any>;

const write = (root: string, rel: string, content: string | object): void => {
	mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
	writeFileSync(path.join(root, rel), typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`);
};

const snapshot = (root: string): string => {
	const h = createHash('sha256');
	const walk = (dir: string): void => {
		for (const name of readdirSync(dir).sort()) {
			const abs = path.join(dir, name);
			if (statSync(abs).isDirectory()) walk(abs);
			else h.update(path.relative(root, abs)).update(readFileSync(abs));
		}
	};
	walk(root);
	return h.digest('hex');
};

let root: string;
let moduleRef: TestingModule;
let client: Client;

const call = async (name: string, args: Json = {}) => {
	const r = await client.callTool({ name, arguments: args });
	return { isError: r.isError === true, structured: (r.structuredContent ?? {}) as Json };
};

before(async () => {
	root = mkdtempSync(path.join(os.tmpdir(), 'sd-insight-'));
	// Three failure-log entries on three days: an open learning pattern (QG-LEARN-02).
	const entry = (date: string, sig: string) =>
		`- **Date:** ${date}\n- **Slice:** s1\n- **Signature:** ${sig}\n- **Failure:** boom\n`;
	write(
		root,
		'docs/agent-failure-log.md',
		`# Agent Failure Log\n\n## Incidents\n\n${['2026-01-01', '2026-01-02', '2026-01-03'].map((d) => entry(d, 'tests:flaky')).join('\n')}`,
	);
	write(
		root,
		'docs/knowledge-base/steering-proposals/SP-001.md',
		'---\nid: SP-001\npattern: LP-unknown\nstatus: proposed\nchange: add-guide\ncontrol: <file>\nsuccess: <criterion>\n---\n',
	);
	const f = (id: string, slice: string | null, severity: string, check: string) => ({
		id,
		check,
		severity,
		slice_id: slice,
		node: null,
		paths: ['src/a.js'],
		message: id,
	});
	write(root, '.harness/audits/2026-10-20T00-00-00-000Z.json', {
		generated_at: '2026-10-20',
		findings: [
			f('AUD-00000001', 's1', 'fail', 'DRIFT-01'),
			f('AUD-00000002', 's1', 'warn', 'DRIFT-06'),
			f('AUD-00000003', 's2', 'fail', 'DRIFT-01'),
			f('AUD-00000004', null, 'advisory', 'UNOWNED'),
		],
	});
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

test('spec-drift-apps REQ-001 REQ-003: the insight tools are typed and read-only; no tool writes triage', async () => {
	const { tools } = await client.listTools();
	for (const name of ['audit_query', 'learning_report']) {
		const tool = tools.find((t) => t.name === name);
		assert.ok(tool, name);
		assert.equal(tool.outputSchema?.type, 'object', `${name} declares an outputSchema`);
		assert.equal(tool.annotations?.readOnlyHint, true, `${name} is read-only`);
	}
	assert.ok(!tools.some((t) => /triage/i.test(t.name)), 'no triage tool: asdd triage records decisions');
	const audit = tools.filter((t) => /^(audit_|verify_|generate_ci_gate|learning_)/.test(t.name));
	assert.ok(
		audit.every((t) => t.annotations?.readOnlyHint === true),
		'every audit tool is read-only',
	);
});

test('spec-drift-apps REQ-002: learning_report lists the open pattern and what the proposal lacks, and writes nothing', async () => {
	const before = snapshot(root);
	const { isError, structured } = await call('learning_report');
	assert.equal(isError, false);
	assert.ok(LearningReportOutput.safeParse(structured).success);
	const open = structured['patterns'].find((p: Json) => p['status'] === 'open');
	assert.ok(open, 'the failure-log pattern is open');
	assert.equal(open['next'], `asdd learn --propose ${open['id']}`);
	const sp = structured['proposals'].find((p: Json) => p['id'] === 'SP-001');
	assert.ok(sp['missing'].some((m: string) => /control must name/.test(m)));
	assert.ok(sp['missing'].some((m: string) => /success criterion is unfilled/.test(m)));
	assert.match(structured['commands_note'], /writes nothing/);
	assert.equal(snapshot(root), before, 'no file changed');
});

test('spec-drift-apps REQ-004: audit_query filters and groups the latest report server-side, and writes nothing', async () => {
	const before = snapshot(root);
	let { isError, structured } = await call('audit_query', { from: 'report', group_by: 'slice', limit: 1 });
	assert.equal(isError, false);
	assert.ok(AuditQueryOutput.safeParse(structured).success);
	assert.match(structured['from'], /^report \.harness\/audits\//);
	assert.equal(structured['total'], 4);
	assert.deepEqual(
		structured['groups'].map((g: Json) => [g['key'], g['count']]),
		[
			['s1', 2],
			['(none)', 1],
			['s2', 1],
		],
	);
	assert.equal(structured['findings'].length, 1);
	assert.equal(structured['truncated'], true);
	({ isError, structured } = await call('audit_query', { from: 'report', severity: 'fail', group_by: 'check' }));
	assert.equal(structured['matched'], 2);
	assert.deepEqual(structured['groups'], [{ key: 'DRIFT-01', count: 2, by_severity: { fail: 2 } }]);
	const noDiff = await call('audit_query', { from: 'diff' });
	assert.equal(noDiff.isError, false, 'no audit_diff in this process yet is no data, not an error (spec-drift-empty)');
	assert.match(noDiff.structured['no_data']['reason'], /No audit_diff has run/);
	assert.equal(snapshot(root), before, 'no file changed');
});

test('review-quality REQ-005: learning_report shows the reviews asdd learn recorded, and writes nothing', async () => {
	write(root, '.harness/state/learning/summaries/2026-W45-ana.json', {
		schema_version: '1.0',
		author: 'ana',
		week: '2026-W45',
		signatures: {},
		reviews: {
			'7@1': {
				at: '2026-11-03T10:00:00Z',
				pr: 7,
				revision: 1,
				comments: { drafted: 3, kept: 1, edited: 1, removed: 1, added: 0 },
				by_rule: { 'python.performance': { drafted: 2, kept: 0, edited: 1, removed: 1 } },
			},
		},
	});
	const before = snapshot(root);
	const { isError, structured } = await call('learning_report');
	assert.equal(isError, false);
	assert.ok(LearningReportOutput.safeParse(structured).success);
	assert.equal(structured['review_quality']['reviews'], 1);
	assert.equal(structured['review_quality']['by_rule'][0]['rule'], 'python.performance');
	assert.equal(snapshot(root), before, 'no file changed');
	rmSync(path.join(root, '.harness/state/learning'), { recursive: true, force: true });
});
