/**
 * Ticket-driven review: a PR's ticket (GitHub issue fetched with the fake gh, or pasted text) adds
 * its acceptance criteria and definition of done as the last coverage step, after the review groups.
 */
import 'reflect-metadata';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';

import type { Client } from '@modelcontextprotocol/client';
import { connectMcpClient } from '@nestjs/mcp/testing';
import { Test, type TestingModule } from '@nestjs/testing';

import type { PrReviewView } from '../src/pr-review/pr-review.types.ts';
import {
	createReviewedRepo,
	FAKE_GH_BIN,
	hasSemgrep,
	PR_NUMBER,
	type ReviewedRepo,
	tmpDir,
} from './fixtures/sandbox.ts';

type CallResult = Awaited<ReturnType<Client['callTool']>>;
const textOf = (r: CallResult) => (r.content as Array<{ text?: string }>).map((c) => c.text ?? '').join('\n');

describe('PR review with a ticket (acceptance criteria + definition of done)', {
	skip: !hasSemgrep() && 'semgrep not installed',
}, () => {
	let moduleRef: TestingModule;
	let client: Client;
	let sandbox: ReviewedRepo;
	const pr = PR_NUMBER;

	const call = (name: string, args: Record<string, unknown> = {}) =>
		client.callTool({ name, arguments: { pr, repoPath: sandbox.repo, ...args } });
	const view = async (name: string, args: Record<string, unknown> = {}): Promise<PrReviewView> => {
		const result = await call(name, args);
		assert.ok(!result.isError, `${name} failed: ${textOf(result)}`);
		return result.structuredContent as unknown as PrReviewView;
	};
	const reviewAllGroups = async (start: PrReviewView): Promise<CallResult | undefined> => {
		let last: CallResult | undefined;
		for (const group of start.progress?.groups ?? []) {
			last = await call('pr_review_submit_findings', { groupIndex: group.index, findings: [] });
			assert.ok(!last.isError, textOf(last));
		}
		return last;
	};

	before(async () => {
		sandbox = createReviewedRepo();
		Object.assign(process.env, {
			PATH: `${FAKE_GH_BIN}${path.delimiter}${process.env['PATH']}`,
			FAKE_GH_STATE: sandbox.ghState,
			PR_REVIEW_ROOT: tmpDir('mcp-requirements-artifacts'),
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

	test('without a ticket, the review suggests the issue the PR closes', async () => {
		const result = await call('pr_review_start');
		const v = result.structuredContent as unknown as PrReviewView;
		assert.equal(v.requirements, undefined);
		assert.deepEqual(
			v.ticketRefs?.map((r) => r.ref),
			['#7'],
		);
		assert.match(textOf(result), /Possible ticket: #7\..*pr_review_set_ticket/);
	});

	test('a GitHub issue ref is fetched and its criteria become the last coverage step', async () => {
		const v = await view('pr_review_set_ticket', { ticket: { source: 'github', ref: '#7' } });
		assert.equal(v.requirements?.ticket.title, 'Parse raw payloads');
		assert.deepEqual(
			v.requirements?.criteria.map((c) => [c.id, c.kind]),
			[
				['AC-1', 'acceptance'],
				['AC-2', 'acceptance'],
				['AC-3', 'acceptance'],
				['DOD-1', 'done'],
			],
		);
		assert.equal(v.requirements?.ticket.text, '', 'the dashboard gets the criteria, not the ticket body');
		assert.deepEqual(v.requirements?.signals.testFiles, ['src/app.spec.ts']);
		assert.equal(v.progress?.totalCount, (v.progress?.groups.length ?? 0) + 1);
		assert.equal(v.phase, 'reviewing');
	});

	test('each group names the ticket in one line; the criteria cannot be verified before the groups', async () => {
		const next = textOf(await call('pr_review_next_group'));
		assert.match(
			next,
			/Ticket #7 — Parse raw payloads: 4 criteria \(AC-1, AC-2, AC-3, DOD-1\), verified in a final step/,
		);
		assert.doesNotMatch(next, /AC-2: Invalid JSON/, 'the criteria text is not repeated in every group');

		const early = await call('pr_review_submit_requirements', { results: [{ id: 'AC-1', status: 'met' }] });
		assert.equal(early.isError, true);
		assert.match(textOf(early), /Review every group first/);
	});

	test('after the groups, the agent is asked to verify the criteria and publishing waits for it', async () => {
		const start = await view('pr_review_status');
		const last = await reviewAllGroups(start);
		assert.match(textOf(last!), /Final step: verify the 4 ticket criteria[\s\S]*pr_review_submit_requirements/);
		const status = await view('pr_review_status');
		assert.equal(status.progress?.complete, false);
		assert.equal(status.phase, 'reviewing');

		const publish = await view('pr_review_publish');
		assert.equal(publish.phase, 'reviewing', 'no pending review while criteria are unverified');
		assert.match(publish.message, /ticket criteria/);
	});

	test('every criterion needs a verdict', async () => {
		const result = await call('pr_review_submit_requirements', {
			results: [
				{ id: 'AC-1', status: 'met' },
				{ id: 'AC-3', status: 'met' },
			],
		});
		assert.equal(result.isError, true);
		assert.match(textOf(result), /Missing verdicts for AC-2, DOD-1/);
	});

	test('verified criteria complete coverage, go into the summary and report, and unmet suggests changes', async () => {
		const v = await view('pr_review_submit_requirements', {
			results: [
				{ id: 'AC-1', status: 'met', evidence: ['src/app.ts:4'] },
				{ id: 'AC-2', status: 'unmet', evidence: ['src/app.ts:6'], note: 'JSON.parse throws on invalid input' },
				{ id: 'ac-3', status: 'partial', evidence: ['src/util.py:4'], note: 'uses eval' },
				{ id: 'DOD-1', status: 'unverifiable', note: 'spec only imports greet' },
			],
			unrelatedChanges: ['package-lock.json bump'],
			summary: 'Delivers parsing, but error handling is missing.',
		});
		assert.equal(v.progress?.complete, true);
		assert.equal(v.phase, 'draft');
		assert.equal(v.requirements?.status, 'done');
		// A loop step returns only the progress; the draft is in pr_review_status.
		assert.equal(v.parsed, undefined);
		const draft = await view('pr_review_status');
		assert.equal(draft.parsed?.meta.event, 'REQUEST_CHANGES');
		assert.match(draft.parsed?.summary ?? '', /1\/4 criteria met[\s\S]*❌ AC-2 Invalid JSON[\s\S]*JSON\.parse throws/);
		assert.match(draft.parsed?.summary ?? '', /Not covered by the ticket: package-lock\.json bump/);
		assert.match(draft.reportMarkdown ?? '', /## Requirements — #7 — Parse raw payloads[\s\S]*\| \*\*AC-2\*\*/);

		const resource = await client.readResource({
			uri: `pr-review://${encodeURIComponent(draft.paths.project)}/${pr}/requirements.json`,
		});
		assert.match((resource.contents[0] as { text: string }).text, /"status": "done"/);
	});

	test('a human can change a verdict; only the summary block changes', async () => {
		const status = await view('pr_review_status');
		assert.match(status.commentsMarkdown ?? '', /Delivers parsing, but error handling is missing\./);
		const edited = status.commentsMarkdown!.replace('Automated structured findings: 0 item(s).', 'Human wrote this.');
		await view('pr_review_ui_save', { commentsMarkdown: edited });

		const v = await view('pr_review_ui_requirements', {
			results: [{ id: 'AC-2', status: 'met', note: 'handled by the caller' }],
		});
		const ac2 = v.requirements?.criteria.find((c) => c.id === 'AC-2');
		assert.equal(ac2?.status, 'met');
		assert.equal(ac2?.by, 'human');
		assert.match(v.parsed?.summary ?? '', /^[\s\S]*Human wrote this\./, 'human text kept');
		assert.match(v.parsed?.summary ?? '', /2\/4 criteria met/);
		assert.equal(v.parsed?.summary.match(/<!-- requirements -->/g)?.length, 1);
		assert.match(fs.readFileSync(path.join(v.paths.base, 'report.md'), 'utf8'), /AC-2\*\* Invalid JSON.*✅ met/);
	});

	test('Jira or Linear tickets must come with their text (the server holds no credentials)', async () => {
		const result = await call('pr_review_set_ticket', { ticket: { source: 'jira', ref: 'MLC-828' } });
		assert.equal(result.isError, true);
		assert.match(textOf(result), /pass `text` or `criteria`/);
	});

	test('pasted ticket text works, and a re-review keeps the ticket with fresh verdicts', async () => {
		const text = '## Criterios de aceptación\n- El helper parse existe\n\n## Definición de terminado\n- Tests';
		const started = await view('pr_review_start', { ticket: { source: 'text', text } });
		assert.deepEqual(
			started.requirements?.criteria.map((c) => c.id),
			['AC-1', 'DOD-1'],
		);
		assert.equal(started.requirements?.status, 'pending');

		const again = await view('pr_review_start');
		assert.deepEqual(
			again.requirements?.criteria.map((c) => c.text),
			['El helper parse existe', 'Tests'],
		);
		assert.ok(again.requirements?.criteria.every((c) => c.status === 'pending'));
		assert.equal(again.ticketRefs, undefined);
		assert.ok(fs.existsSync(path.join(again.paths.base, 'requirements.json')));
	});
});
