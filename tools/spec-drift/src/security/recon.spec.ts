import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BASE_CHECKLISTS, recon } from './recon.ts';

const reader =
	(files: Record<string, string>) =>
	(rel: string): string | null =>
		files[rel] ?? null;

test('security-review REQ-002: a web API with a database and an LLM SDK selects the matching checklists', () => {
	const manifests = {
		'package.json': JSON.stringify({
			dependencies: { express: '^5', pg: '^8', '@anthropic-ai/sdk': '^1' },
			devDependencies: { typescript: '^5' },
		}),
	};
	const files = [
		'package.json',
		'pnpm-lock.yaml',
		'src/server.ts',
		'src/routes/users.ts',
		'Dockerfile',
		'.github/workflows/ci.yml',
	];
	const r = recon(files, reader(manifests));
	assert.deepEqual(r.languages, { typescript: 2 });
	for (const s of ['http-server', 'database', 'llm', 'supply-chain', 'deployment'] as const)
		assert.ok(r.surfaces.includes(s), s);
	for (const id of [
		...BASE_CHECKLISTS,
		'web-protocol-and-auth',
		'data-isolation-and-lifecycle',
		'ai-and-llm',
		'supply-chain-and-release',
		'cloud-and-deployment',
		'resource-exhaustion-and-availability',
	]) {
		assert.ok(r.checklists.includes(id), id);
	}
	assert.ok(!r.checklists.includes('memory-safety-and-binary'));
	assert.ok(!r.checklists.includes('client-side'));
	assert.ok(r.evidence['llm']?.includes('package.json: @anthropic-ai/sdk'));
});

test('security-review REQ-002: native code and a frontend select memory-safety and client-side', () => {
	const r = recon(['native/parser.c', 'native/parser.h', 'web/App.tsx', 'web/index.html'], reader({}));
	assert.ok(r.surfaces.includes('native'));
	assert.ok(r.surfaces.includes('frontend'));
	assert.ok(r.checklists.includes('memory-safety-and-binary'));
	assert.ok(r.checklists.includes('client-side'));
});

test('security-review REQ-002: an empty repo still gets the base methodology', () => {
	const r = recon([], reader({}));
	assert.deepEqual(r.checklists, [...BASE_CHECKLISTS]);
	assert.deepEqual(r.surfaces, []);
});
