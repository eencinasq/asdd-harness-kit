/** spec-drift-demand REQ-006 end to end: repos_overview over two fixture repositories, one without data. */
import 'reflect-metadata';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';

import type { Client } from '@modelcontextprotocol/client';
import { connectMcpClient } from '@nestjs/mcp/testing';
import { Test, type TestingModule } from '@nestjs/testing';

import { ReposOverviewOutput } from '../src/analysis/analysis.output.ts';
import { tmpDir } from './fixtures/sandbox.ts';

const write = (root: string, rel: string, data: object) => {
	fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
	fs.writeFileSync(path.join(root, rel), JSON.stringify(data));
};
const snap = (at: string, total: number) => ({
	schema_version: '1.0',
	recorded_at: at,
	commit: 'abc1234',
	engine: 'semgrep',
	total,
	new: null,
	by_severity: {},
	by_rule: {},
	by_adr: {},
	by_pack: {},
	rules: 2,
	adr_coverage: null,
});

let moduleRef: TestingModule;
let client: Client;
let shop: string;
let docs: string;

before(async () => {
	const parent = tmpDir('sd-repos');
	shop = path.join(parent, 'shop');
	docs = path.join(parent, 'docs');
	fs.mkdirSync(docs, { recursive: true });
	write(shop, '.semgrep/history/2026-10-01.json', snap('2026-10-01T00:00:00Z', 30));
	write(shop, '.semgrep/history/2026-11-01.json', snap('2026-11-01T00:00:00Z', 36));
	write(shop, '.harness/audits/2026-11-02T00-00-00-000Z.json', {
		generated_at: '2026-11-02T00:00:00Z',
		findings: [{}],
		summary: { drift_level: 'blocking', spec_compliance: 0.75 },
	});
	Object.assign(process.env, {
		SPEC_DRIFT_REPOS: [shop, docs, path.join(parent, 'gone')].join(','),
		ANALYSIS_REPO_ROOT: shop,
		PR_REVIEW_ROOT: tmpDir('sd-repos-art'),
	});
	const { AppModule } = await import('../src/app.module.ts');
	moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
	await moduleRef.init();
	client = await connectMcpClient(moduleRef);
});

after(async () => {
	await client?.close();
	await moduleRef?.close();
});

test('spec-drift-demand REQ-006: one summary per repository, "no data" and missing folders included', async () => {
	const r = await client.callTool({ name: 'repos_overview', arguments: {} });
	assert.ok(!r.isError);
	const s = r.structuredContent as Record<string, any>;
	assert.ok(ReposOverviewOutput.safeParse(s).success);
	assert.equal(s['configured'], true);
	const [a, b, c] = s['repos'];
	assert.deepEqual(
		{
			total: a.analysis.total,
			direction: a.analysis.direction,
			level: a.audit.driftLevel,
			compliance: a.audit.specCompliance,
		},
		{ total: 36, direction: 'worse', level: 'blocking', compliance: 0.75 },
	);
	assert.equal(b.noData, true);
	assert.match(c.error, /no folder/);
	const text = JSON.stringify(r.content);
	assert.match(text, /shop: 36 findings, worse 20% over 2 snapshot\(s\); audit blocking, spec compliance 75%/);
	assert.match(text, /docs: no data/);
});
