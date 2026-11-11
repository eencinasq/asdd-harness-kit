/**
 * Renders the built dashboards (dist/*.html) in headless Chromium inside a real MCP Apps host
 * (ext-apps AppBridge) and drives them against the real NestJS server: tool results in, the view's
 * tool calls out. Needs `pnpm build` and `npx playwright install chromium`.
 */
import 'reflect-metadata';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';

import type { Client } from '@modelcontextprotocol/client';
import { connectMcpClient } from '@nestjs/mcp/testing';
import { Test, type TestingModule } from '@nestjs/testing';
import { build } from 'esbuild';
import { type Browser, chromium, type Frame, type Page } from 'playwright';

import {
	createReviewedRepo,
	createSemgrepSpecRepo,
	FAKE_GH_BIN,
	hasSemgrep,
	PR_NUMBER,
	publishedReviews,
	type ReviewedRepo,
	tmpDir,
} from './fixtures/sandbox.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');

const hasBrowser = (): boolean => {
	try {
		return fs.existsSync(chromium.executablePath());
	} catch {
		return false;
	}
};
const skip =
	(!fs.existsSync(path.join(DIST, 'pr-review.html')) && 'run pnpm build first') ||
	(!hasBrowser() && 'run npx playwright install chromium') ||
	(!hasSemgrep() && 'semgrep not installed');

describe('dashboards in a real MCP Apps host', { skip }, () => {
	let moduleRef: TestingModule;
	let client: Client;
	let browser: Browser;
	let server: http.Server;
	let origin: string;
	let sandbox: ReviewedRepo;
	const toolCalls: Array<{ name: string; arguments?: Record<string, unknown> }> = [];

	before(async () => {
		sandbox = createReviewedRepo();
		Object.assign(process.env, {
			PATH: `${FAKE_GH_BIN}${path.delimiter}${process.env['PATH']}`,
			FAKE_GH_STATE: sandbox.ghState,
			PR_REVIEW_ROOT: tmpDir('mcp-ui-artifacts'),
			ANALYSIS_REPO_ROOT: createSemgrepSpecRepo(),
		});
		const { AppModule } = await import('../src/app.module.ts');
		moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
		await moduleRef.init();
		client = await connectMcpClient(moduleRef);

		const host = await build({
			entryPoints: [path.join(import.meta.dirname, 'ui/host.ts')],
			bundle: true,
			format: 'esm',
			platform: 'browser',
			write: false,
		});
		const hostJs = host.outputFiles[0]?.text ?? '';
		server = http.createServer((req, res) => {
			const view = req.url?.match(/^\/view\/([\w-]+\.html)$/)?.[1];
			if (view) {
				res.writeHead(200, { 'content-type': 'text/html' }).end(fs.readFileSync(path.join(DIST, view)));
				return;
			}
			const name = req.url?.match(/^\/host\/([\w-]+\.html)$/)?.[1];
			res
				.writeHead(name ? 200 : 404, { 'content-type': 'text/html' })
				.end(
					name
						? `<!doctype html><iframe id="view" data-src="/view/${name}" style="width:1200px;height:900px"></iframe><script type="module">${hostJs}</script>`
						: '',
				);
		});
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
		origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
		browser = await chromium.launch();
	});

	after(async () => {
		await browser?.close();
		await new Promise((resolve) => server?.close(resolve));
		await client?.close();
		await moduleRef?.close();
	});

	/** Open a dashboard; the view's tool calls go to the real server and are recorded. */
	const openView = async (file: string): Promise<{ page: Page; view: Frame }> => {
		const page = await browser.newPage();
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.exposeFunction(
			'callServerTool',
			async (params: { name: string; arguments?: Record<string, unknown> }) => {
				toolCalls.push(params);
				return client.callTool(params);
			},
		);
		await page.goto(`${origin}/host/${file}`);
		await page.evaluate(() => window.viewReady);
		const view = page.frames().find((f) => f.url().endsWith(`/view/${file}`));
		assert.ok(view, 'dashboard iframe loaded');
		assert.deepEqual(errors, [], 'no script errors');
		return { page, view };
	};

	const deliver = (page: Page, result: unknown) =>
		page.evaluate((r) => window.sendToolResult(r), JSON.parse(JSON.stringify(result)));

	test('analysis dashboard renders a real spec-drift result', async () => {
		const { page, view } = await openView('analysis-dashboard.html');
		await deliver(page, await client.callTool({ name: 'analyze_spec_drift', arguments: {} }));

		await view.waitForFunction(() => document.getElementById('kpi-findings')?.textContent?.trim() === '4');
		assert.equal((await view.textContent('#kpi-drift'))?.trim(), '3');
		assert.equal((await view.textContent('#kpi-clean'))?.trim(), '1');
		const packRows = await view.locator('#pack-overview-body tr').count();
		assert.ok(packRows >= 2, `pack overview rows: ${packRows}`);
		assert.match((await view.textContent('#engine-label')) ?? '', /^Semgrep · /);

		// Filters: severity (aria-pressed segmented control) and free-text search.
		await view.click('#severity-filter button[data-value="ERROR"]');
		assert.equal(await view.getAttribute('#severity-filter button[data-value="ERROR"]', 'aria-pressed'), 'true');
		const errors = await view.locator('#findings-list > li.item').count();
		assert.ok(errors >= 1 && errors < 4, `error findings: ${errors}`);
		await view.click('#severity-filter button[data-value="ALL"]');
		await view.fill('#search', 'no-such-file-anywhere');
		await view.waitForFunction(() =>
			document.getElementById('findings-list')?.textContent?.includes('No findings match'),
		);

		// Tabs are keyboard operable (WAI-ARIA tabs pattern).
		await view.focus('#tab-findings');
		await page.keyboard.press('ArrowRight');
		assert.equal(await view.getAttribute('#tab-drift', 'aria-selected'), 'true');
		assert.equal(await view.isVisible('#panel-drift'), true);
		await page.close();
	});

	test('PR Review dashboard: render, edit-safe publish, and the human submits the review', async () => {
		const args = { pr: PR_NUMBER, repoPath: sandbox.repo };
		await client.callTool({ name: 'pr_review_start', arguments: args });
		for (const groupIndex of [0, 1]) {
			await client.callTool({
				name: 'pr_review_submit_findings',
				arguments: {
					...args,
					groupIndex,
					findings:
						groupIndex === 0
							? []
							: [
									{
										path: 'src/app.ts',
										content: 'Validate input before parsing.',
										startLine: 6,
										endLine: 6,
										severity: 'high',
										category: 'security',
									},
								],
				},
			});
		}
		const verified = await client.callTool({
			name: 'pr_review_verify_findings',
			arguments: { ...args, results: [{ id: 'F1', verdict: 'confirmed', note: 'JSON.parse on raw input' }] },
		});
		assert.ok(!verified.isError, JSON.stringify(verified.content));
		const status = await client.callTool({ name: 'pr_review_status', arguments: args });

		const { page, view } = await openView('pr-review.html');
		await deliver(page, status);
		await view.waitForFunction(() => document.getElementById('kpi-phase')?.dataset['phase'] === 'draft');
		assert.equal((await view.textContent('#kpi-pr'))?.trim(), String(PR_NUMBER));
		await view.click('#tab-coverage');
		assert.match((await view.textContent('#panel-coverage')) ?? '', /Verify findings[\s\S]*✓ Confirmed/);
		await view.click('#tab-comments');
		assert.ok((await view.locator('#inline-list > [data-path]').count()) >= 1, 'inline comments rendered');
		assert.equal(await view.isEnabled('#publish'), true);
		assert.equal(await view.isEnabled('#save'), false, 'nothing to save before an edit');

		// Editing marks the draft dirty and enables Save.
		await view.fill('#summary', 'Edited summary from the dashboard.');
		assert.equal(await view.isEnabled('#save'), true);
		assert.match((await view.textContent('#dirty-state')) ?? '', /Unsaved changes/);

		// The human submits: Submit asks for confirmation first, nothing is sent before that.
		toolCalls.length = 0;
		await view.click('#publish');
		assert.equal(await view.isVisible('#confirm'), true);
		assert.equal(toolCalls.length, 0, 'no call before confirming');
		await view.click('#confirm-publish');
		// Rewriting the agent's summary is a risky edit: the server asks the human to confirm.
		await view.waitForFunction(() => document.getElementById('kpi-phase')?.dataset['phase'] === 'needsConfirmation');
		const save = toolCalls.find((c) => c.name === 'pr_review_ui_save');
		assert.match(
			String(save?.arguments?.['commentsMarkdown']),
			/Edited summary from the dashboard\./,
			'edits saved first',
		);
		assert.match((await view.textContent('#alerts')) ?? '', /summary/i, 'the warning names what changed');
		assert.equal(publishedReviews(sandbox.ghState).length, 0, 'nothing posted yet');

		await view.click('#publish');
		await view.click('#confirm-publish');
		await view.waitForFunction(() => document.getElementById('kpi-phase')?.dataset['phase'] === 'published');
		const publish = toolCalls.findLast((c) => c.name === 'pr_review_ui_publish');
		assert.ok(publish, `tool calls: ${toolCalls.map((c) => c.name).join(', ')}`);
		assert.equal(publish.arguments?.['force'], true, 'the second submit confirms the edits');
		// git reports the resolved path (/var → /private/var on macOS).
		assert.equal(publish.arguments?.['repoPath'], fs.realpathSync(sandbox.repo), 'dashboard identifies the repo');
		assert.ok(
			toolCalls.every((c) => c.name !== 'pr_review_publish'),
			'the dashboard never uses the model tool',
		);
		const review = publishedReviews(sandbox.ghState).at(-1);
		assert.equal(review?.payload['event'], 'REQUEST_CHANGES', 'a real (non-pending) review was submitted');
		await page.close();
	});

	test('PR Review dashboard shows tool errors instead of swallowing them', async () => {
		const status = await client.callTool({
			name: 'pr_review_status',
			arguments: { pr: PR_NUMBER, repoPath: sandbox.repo },
		});
		const { page, view } = await openView('pr-review.html');
		await deliver(page, status);
		await view.waitForFunction(() => document.getElementById('kpi-pr')?.textContent?.trim() === '42');

		process.env['FAKE_GH_FAIL'] = '1'; // gh is logged out
		try {
			// The summary edited in the previous test still differs from the agent's: confirm it first.
			await view.click('#publish');
			await view.click('#confirm-publish');
			await view.waitForFunction(() => document.getElementById('kpi-phase')?.dataset['phase'] === 'needsConfirmation');
			await view.click('#publish');
			await view.click('#confirm-publish');
			await view.waitForFunction(() => document.getElementById('status')?.textContent?.includes('Could not submit'));
		} finally {
			delete process.env['FAKE_GH_FAIL'];
		}
		assert.match((await view.textContent('#status')) ?? '', /Could not submit the review: .*gh auth login/);
		assert.match((await view.getAttribute('#status', 'class')) ?? '', /tone-danger/);
		assert.equal(await view.getAttribute('#status', 'role'), 'status', 'announced to screen readers');
		await page.close();
	});
	test('PR Review dashboard: ticket criteria tab, and the human corrects a verdict', async () => {
		const args = { pr: PR_NUMBER, repoPath: sandbox.repo };
		await client.callTool({
			name: 'pr_review_set_ticket',
			arguments: { ...args, ticket: { source: 'github', ref: '#7' } },
		});
		const verified = await client.callTool({
			name: 'pr_review_submit_requirements',
			arguments: {
				...args,
				results: [
					{ id: 'AC-1', status: 'met', evidence: ['src/app.ts:4'] },
					{ id: 'AC-2', status: 'unmet', note: 'JSON.parse throws' },
					{ id: 'AC-3', status: 'partial' },
					{ id: 'DOD-1', status: 'unverifiable' },
				],
			},
		});
		assert.ok(!verified.isError, JSON.stringify(verified.content));

		const { page, view } = await openView('pr-review.html');
		await deliver(page, await client.callTool({ name: 'pr_review_status', arguments: args }));
		await view.waitForFunction(() => !document.getElementById('tab-requirements')?.hidden);
		assert.equal((await view.textContent('#kpi-req'))?.trim(), '1/4');
		await view.click('#tab-requirements');
		assert.match((await view.textContent('#ticket-title')) ?? '', /#7 · Parse raw payloads/);
		assert.match((await view.textContent('#requirements-alert')) ?? '', /1 criterion not met/);
		assert.equal(await view.isEnabled('#save-requirements'), false);

		toolCalls.length = 0;
		await view.selectOption('#verdict-AC-2', 'met');
		assert.equal(await view.isEnabled('#save-requirements'), true);
		await view.click('#save-requirements');
		await view.waitForFunction(() => document.getElementById('kpi-req')?.textContent?.trim() === '2/4');
		const saved = toolCalls.find((c) => c.name === 'pr_review_ui_requirements');
		assert.deepEqual(saved?.arguments?.['results'], [{ id: 'AC-2', status: 'met' }]);
		assert.match((await view.textContent('[data-criterion="AC-2"]')) ?? '', /set by you/);
		await page.close();
	});
});
