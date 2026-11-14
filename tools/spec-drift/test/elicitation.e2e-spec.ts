/**
 * spec-drift-depth REQ-004 end to end: a 2026-07-28 client that declares `elicitation` is asked for the ticket at
 * pr_review_start and to confirm pr_review_publish (MCP inputRequired; the client retries the call with the answer);
 * declining publishes nothing; clients without the capability, or on the 2025 era, are not asked.
 */
import 'reflect-metadata';

import assert from 'node:assert/strict';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { McpHttpService } from '@nestjs/mcp';
import { connectMcpClient } from '@nestjs/mcp/testing';
import { Test, type TestingModule } from '@nestjs/testing';

import type { PrReviewView } from '../src/pr-review/pr-review.types.ts';
import {
	createReviewedRepo,
	FAKE_GH_BIN,
	PR_NUMBER,
	publishedReviews,
	type ReviewedRepo,
	tmpDir,
} from './fixtures/sandbox.ts';

type Json = Record<string, any>;
type Asked = { message: string; requestedSchema: Json };
type CallResult = Awaited<ReturnType<Client['callTool']>>;
const textOf = (r: CallResult) => (r.content as Array<{ text?: string }>).map((c) => c.text ?? '').join('\n');

/** Like connectMcpClient (in memory, through the HTTP handler), with the elicitation capability declared. */
const connectElicitingClient = async (
	moduleRef: TestingModule,
	answer: (asked: Asked) => { action: 'accept'; content: Json } | { action: 'decline' | 'cancel' },
	asked: Asked[],
): Promise<Client> => {
	const http = moduleRef.get(McpHttpService, { strict: false });
	const transport = new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), {
		fetch: (input, init) => {
			const request = new Request(input, init);
			const { pathname, search } = new URL(request.url);
			const platformRequest = {
				method: request.method,
				url: pathname + search,
				headers: Object.fromEntries(request.headers),
			};
			return http.fetch(request, { platformRequest });
		},
	});
	const client = new Client(
		{ name: 'eliciting-host', version: '1.0.0' },
		{ capabilities: { elicitation: { form: {} } }, versionNegotiation: { mode: { pin: '2026-07-28' } } },
	);
	client.setRequestHandler('elicitation/create', async (request) => {
		const params = request.params as unknown as Asked;
		asked.push(params);
		return answer(params);
	});
	await client.connect(transport);
	return client;
};

describe('elicitation: ticket at start, confirmation at publish', () => {
	let moduleRef: TestingModule;
	let sandbox: ReviewedRepo;
	const asked: Asked[] = [];
	let reply: (a: Asked) => { action: 'accept'; content: Json } | { action: 'decline' | 'cancel' } = () => ({
		action: 'decline',
	});
	let client: Client;
	const call = (c: Client, name: string, args: Json = {}) =>
		c.callTool({ name, arguments: { pr: PR_NUMBER, repoPath: sandbox.repo, ...args } });
	const view = async (c: Client, name: string, args: Json = {}): Promise<PrReviewView> => {
		const r = await call(c, name, args);
		assert.ok(!r.isError, `${name}: ${textOf(r)}`);
		return r.structuredContent as unknown as PrReviewView;
	};

	before(async () => {
		sandbox = createReviewedRepo({ withSemgrep: false });
		Object.assign(process.env, {
			PATH: `${FAKE_GH_BIN}${path.delimiter}${process.env['PATH']}`,
			FAKE_GH_STATE: sandbox.ghState,
			PR_REVIEW_ROOT: tmpDir('sd-elicit-artifacts'),
		});
		const { AppModule } = await import('../src/app.module.ts');
		moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
		await moduleRef.init();
		client = await connectElicitingClient(moduleRef, (a) => reply(a), asked);
	});

	after(async () => {
		await client?.close();
		await moduleRef?.close();
	});

	test('spec-drift-depth REQ-004: start asks for the ticket, suggesting the one in the PR; declining reviews without it', async () => {
		reply = () => ({ action: 'decline' });
		const v = await view(client, 'pr_review_start');
		assert.equal(asked.length, 1);
		assert.match(asked[0]?.message ?? '', /Which ticket does PR #42 implement\?/);
		assert.match(String(asked[0]?.requestedSchema['properties']['ticket']['default']), /7/);
		assert.equal(v.requirements, undefined);
		assert.equal(v.phase, 'reviewing');
	});

	test('spec-drift-depth REQ-004: publish asks to confirm; declining publishes nothing, accepting creates the pending review', async () => {
		const start = await view(client, 'pr_review_status');
		for (const [groupIndex] of (start.units?.groups ?? []).entries()) {
			await view(client, 'pr_review_submit_findings', { groupIndex, findings: [] });
		}
		asked.length = 0;
		reply = () => ({ action: 'decline' });
		const declined = await call(client, 'pr_review_publish');
		assert.ok(!declined.isError, textOf(declined));
		assert.match(textOf(declined), /Not published: the user declined/);
		assert.equal(asked.length, 1);
		assert.match(asked[0]?.message ?? '', /Create a pending review on PR #42 with 0 inline comments\?/);
		assert.equal(publishedReviews(sandbox.ghState).length, 0);

		reply = () => ({ action: 'accept', content: { confirm: true } });
		const published = await view(client, 'pr_review_publish');
		assert.equal(published.phase, 'published');
		assert.equal(publishedReviews(sandbox.ghState).length, 1);
		assert.equal(publishedReviews(sandbox.ghState)[0]?.payload['event'], undefined, 'still only a pending review');
	});

	test('spec-drift-depth REQ-004: an accepted ticket is checked; the previous ticket is not asked again', async () => {
		asked.length = 0;
		reply = () => ({ action: 'accept', content: { ticket: '#7' } });
		const v = await view(client, 'pr_review_start');
		assert.equal(asked.length, 1);
		assert.equal(v.requirements?.ticket.ref, '#7');
		assert.equal(v.requirements?.criteria.length, 4);
		asked.length = 0;
		const again = await view(client, 'pr_review_start');
		assert.equal(asked.length, 0, 'the review already has a ticket');
		assert.equal(again.requirements?.ticket.ref, '#7');
	});

	test('spec-drift-depth REQ-004: without the capability, or on the 2025 era, nothing is asked', async () => {
		for (const era of ['modern', 'legacy'] as const) {
			const plain = await connectMcpClient(moduleRef, { era });
			try {
				// No question: start goes straight to the review and names the ticket it found as a hint.
				const started = await call(plain, 'pr_review_start', { ticket: undefined });
				assert.ok(!started.isError, textOf(started));
				assert.match(textOf(started), /Possible ticket: .*7|Ticket #7/);
				// No question: publish goes straight to today's checks (the restarted review has no draft yet).
				const r = await call(plain, 'pr_review_publish', { force: true });
				assert.doesNotMatch(textOf(r), /declined|Create a pending review/);
				assert.match(textOf(r), /No comments\.md|pending review/);
			} finally {
				await plain.close();
			}
		}
	});
});
