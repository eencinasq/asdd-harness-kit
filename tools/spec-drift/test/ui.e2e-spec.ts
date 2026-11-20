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

	test('spec-drift-demand REQ-002: Ask the agent to fix sends every violation of the rule to the host', async () => {
		const { page, view } = await openView('analysis-dashboard.html');
		await deliver(page, await client.callTool({ name: 'analyze_spec_drift', arguments: {} }));
		await view.waitForFunction(() => document.getElementById('kpi-findings')?.textContent?.trim() === '4');
		await view.click('#tab-drift');
		await view.click('#panel-drift button[data-rule="mmlc.std.no-explicit-any"]');
		await page.waitForFunction(() => window.sentMessages.length === 1);
		const [message] = (await page.evaluate(() => window.sentMessages)) as Array<{ content: Array<{ text: string }> }>;
		const text = message?.content[0]?.text ?? '';
		assert.match(text, /^Fix the 2 violations of rule `mmlc\.std\.no-explicit-any`/);
		assert.match(text, /wait for their confirmation before editing/);
		assert.match(text, /analyze_spec_drift` with `\{ "paths": /);
		await page.close();
	});

	test('spec-drift-adoption REQ-002: the Trend tab charts the snapshots with a verdict, a crosshair and a table', async () => {
		const { page, view } = await openView('analysis-dashboard.html');
		const result = await client.callTool({ name: 'analyze_spec_drift', arguments: {} });
		const at = (d: string) => `2026-${d}T09:00:00.000Z`;
		const trend = {
			points: [
				{ at: at('10-01'), label: '.semgrep/history/2026-10-01.json', total: 24, new: null },
				{ at: at('10-15'), label: '.semgrep/history/2026-10-15.json', total: 19, new: null },
				{ at: at('10-29'), label: '.semgrep/history/2026-10-29.json', total: 21, new: null },
				{ at: at('11-12'), label: '.semgrep/history/2026-11-12.json', total: 12, new: null },
			],
			measure: 'total',
			direction: 'better',
			change: -0.5,
		};
		await deliver(page, { ...result, structuredContent: { ...(result.structuredContent as object), trend } });
		await view.waitForFunction(() => document.getElementById('kpi-findings')?.textContent?.trim() === '4');
		await view.click('#tab-trend');
		assert.match((await view.textContent('#panel-trend')) ?? '', /Going down — better: 24 → 12 \(-50%\)/);
		assert.equal(await view.locator('#panel-trend .trend-dot').count(), 4);
		assert.equal(await view.locator('#panel-trend tbody tr').count(), 4, 'the table view has every point');
		const box = await view.locator('#panel-trend svg').boundingBox();
		assert.ok(box);
		await page.mouse.move(box.x + box.width * 0.07, box.y + box.height / 2);
		await view.waitForFunction(() => !document.querySelector<HTMLElement>('#panel-trend .trend-tooltip')?.hidden);
		assert.match((await view.textContent('#panel-trend .trend-tooltip')) ?? '', /^24\s*2026-10-01/);
		const shots = process.env['SPEC_DRIFT_UI_SHOTS'];
		if (shots) {
			await view.locator('#panel-trend').screenshot({ path: path.join(shots, 'trend-light.png') });
			await page.emulateMedia({ colorScheme: 'dark' });
			await view.locator('#panel-trend').screenshot({ path: path.join(shots, 'trend-dark.png') });
		}
		await page.close();
	});

	test('spec-drift-depth REQ-001: the audit dashboard shows the traceability matrix with gaps and a Markdown copy', async () => {
		const { page, view } = await openView('audit-dashboard.html');
		const row = (req: string, gaps: string[], extra: object = {}) => ({
			slice: 'auth',
			req_id: req,
			title: `Title ${req}`,
			features: [{ id: 'TASK-001', status: 'passing' }],
			files: ['src/a.ts'],
			file_count: 1,
			tests: [],
			prs: [],
			gaps,
			...extra,
		});
		const structured = {
			matrix: [
				row('REQ-001', [], { tests: ['src/a.spec.ts'], prs: [12, 15] }),
				row('REQ-002', ['no-test', 'not-passing'], { features: [{ id: 'TASK-002', status: 'in_progress' }] }),
			],
			totals: { requirements: 2, with_feature: 2, tested: 1, passing: 1, with_gaps: 1 },
			markdown: '| Slice | Requirement |\n',
			note: 'Writes nothing.',
		};
		await deliver(page, {
			content: [{ type: 'text', text: JSON.stringify(structured) }],
			structuredContent: structured,
		});
		await view.waitForFunction(() => document.getElementById('title')?.textContent === 'Traceability');
		const text = (await view.textContent('#content')) ?? '';
		assert.match(text, /2 requirements/);
		assert.match(text, /1 with gaps/);
		assert.match(text, /#12, #15/);
		assert.match(text, /no test/);
		assert.match(text, /not passing/);
		assert.equal(await view.locator('#content tbody tr').count(), 2);
		assert.equal(
			await view.getAttribute('[data-action="copy"]', 'data-text'),
			'| Slice | Requirement |\n',
			'the Markdown table is ready to copy',
		);
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
										evidence: 'An untrusted caller controls the raw payload that reaches JSON.parse at src/app.ts:6.',
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
		// pr-review-dashboard-ux REQ-002 / REQ-003 / REQ-004: header rev + Security KPI/tab; no Coverage tab.
		assert.equal(await view.locator('#tab-coverage').count(), 0);
		assert.match((await view.textContent('#review-meta')) ?? '', /Rev \d+/);
		// pr-review-dashboard-ux REQ-021: Reload + Review progress in header; other KPIs stay in the row.
		assert.ok(await view.isVisible('#header-actions'));
		assert.ok(await view.isVisible('#reload'));
		assert.ok(await view.isVisible('#kpi-coverage-card'));
		assert.equal(
			await view.evaluate(() => {
				const actions = document.getElementById('header-actions');
				const kpis = document.getElementById('kpis');
				const reload = document.getElementById('reload');
				const progress = document.getElementById('kpi-coverage-card');
				if (!actions || !kpis || !reload || !progress) return false;
				const inHeader = actions.contains(reload) && actions.contains(progress);
				const kpiIds = [...kpis.querySelectorAll('.kpi-action')].map((el) => el.id);
				return (
					inHeader &&
					!kpis.contains(progress) &&
					kpiIds.includes('kpi-inlines-card') &&
					kpiIds.includes('kpi-req-card') &&
					kpiIds.includes('kpi-arch-card') &&
					kpiIds.includes('kpi-security-card') &&
					kpiIds.includes('kpi-code-coverage-card')
				);
			}),
			true,
		);
		assert.equal(await view.locator('#kpi-rev-hint').count(), 1);
		assert.ok(await view.isVisible('#kpi-security-card'));
		assert.ok(await view.isVisible('#tab-security'));
		// pr-review-dashboard-ux REQ-019: Ticket criteria KPI + Requirements tab always visible (empty without ticket).
		assert.ok(await view.isVisible('#kpi-req-card'));
		assert.ok(await view.isVisible('#tab-requirements'));
		assert.equal(await view.getAttribute('#tab-requirements', 'hidden'), null);
		await view.click('#kpi-req-card');
		assert.equal(await view.isVisible('#panel-requirements'), true);
		assert.match((await view.textContent('#requirements-summary')) ?? '', /No ticket/i);
		assert.equal(await view.isVisible('#attach-ticket'), true);
		// pr-review-dashboard-ux REQ-013: Architecture/Security KPI cards open their tabs; missing → generate CTA hint.
		assert.match((await view.textContent('#kpi-security-hint')) ?? '', /generate/i);
		await view.click('#kpi-arch-card');
		assert.equal(await view.isVisible('#panel-architecture'), true);
		await view.click('#kpi-security-card');
		assert.equal(await view.isVisible('#panel-security'), true);
		// pr-review-dashboard-ux REQ-005…007: compact status strip; missing repo set → generate CTA callout.
		assert.match((await view.textContent('#security-summary')) ?? '', /Built-in/);
		assert.match((await view.textContent('#security-summary')) ?? '', /Repository security rules/);
		assert.equal(await view.isVisible('#generate-security-rules'), true);
		assert.equal(await view.isVisible('#start-guided-audit'), true);
		assert.equal(await view.isVisible('#rescan-security'), true);
		assert.match((await view.textContent('#security-summary')) ?? '', /Ask the agent to write security rules/i);
		assert.match((await view.textContent('#security-summary')) ?? '', /Guided audit/);
		// pr-review-dashboard-ux REQ-014…016: Code coverage KPI/tab; fixture has no test+coverage → generate CTA.
		assert.ok(await view.isVisible('#kpi-code-coverage-card'));
		assert.ok(await view.isVisible('#tab-code-coverage'));
		assert.match((await view.textContent('#kpi-code-coverage-hint')) ?? '', /generate|coverage/i);
		await view.click('#kpi-code-coverage-card');
		assert.equal(await view.isVisible('#panel-code-coverage'), true);
		assert.equal(await view.isVisible('#generate-code-coverage'), true);
		// pr-review-dashboard-ux REQ-017: Rescan always visible like Security Findings.
		assert.equal(await view.isVisible('#rescan-code-coverage'), true);
		assert.match((await view.textContent('#code-coverage-summary')) ?? '', /coverage|tests/i);
		// REQ-001: Coverage KPI opens a same-UI drill-down with Back.
		await view.click('#kpi-coverage-card');
		assert.equal(await view.isVisible('#coverage-view'), true);
		// pr-review-dashboard-ux REQ-010…012: plain summary, findings first, human rule labels.
		assert.match((await view.textContent('#coverage-summary')) ?? '', /review batches/i);
		assert.match((await view.textContent('#coverage-findings')) ?? '', /finding|Confirmed/i);
		assert.match((await view.textContent('#panel-coverage')) ?? '', /Verify findings|Closing steps/);
		assert.match((await view.textContent('#panel-coverage')) ?? '', /TypeScript \/ JavaScript|Batches by guide/);
		// spec-drift-depth REQ-002: risk hint still present (collapsed).
		await view.click('#read-first > summary');
		assert.match(
			(await view.textContent('#read-first')) ?? '',
			/Suggested reading order[\s\S]*src\/app\.ts[\s\S]*commit in 90 days/,
		);
		assert.match((await view.textContent('#read-first')) ?? '', /Not available here: requirements, audit/);
		await view.click('#coverage-back');
		// pr-review-dashboard-ux REQ-018: Inline comments KPI opens Comments tab.
		await view.click('#tab-architecture');
		assert.equal(await view.isVisible('#panel-architecture'), true);
		await view.click('#kpi-inlines-card');
		assert.equal(await view.isVisible('#panel-comments'), true);
		assert.ok((await view.locator('#inline-list > [data-path]').count()) >= 1, 'inline comments rendered');
		assert.equal(await view.isEnabled('#publish'), true);
		assert.equal(await view.isEnabled('#save'), false, 'nothing to save before an edit');

		// pr-review-dashboard-ux REQ-022…025: Findings inbox — filters, add, undo, publish preview.
		await view.click('#tab-findings');
		assert.equal(await view.isVisible('#panel-findings'), true);
		assert.ok(await view.isVisible('#findings-filter'));
		assert.ok(await view.isVisible('#findings-add-selected'));
		assert.ok(await view.isVisible('#findings-add-high'));
		assert.ok(await view.isVisible('#findings-skip'));
		const findingsBefore = Number((await view.textContent('#count-findings'))?.trim() ?? '0');
		assert.ok(findingsBefore >= 2, `expected architecture findings in inbox, got ${findingsBefore}`);
		await view.click('#findings-filter button[data-value="architecture"]');
		assert.equal(await view.getAttribute('#findings-filter button[data-value="architecture"]', 'aria-pressed'), 'true');
		assert.ok((await view.locator('#findings-list input.finding-check').count()) >= 1);
		toolCalls.length = 0;
		const inlinesBeforeImport = await view.locator('#inline-list > [data-path]').count();
		await view.click('#findings-add-high');
		await view.waitForFunction(
			() => document.getElementById('panel-comments') && !document.getElementById('panel-comments')?.hidden,
		);
		assert.ok(
			toolCalls.some((c) => c.name === 'pr_review_import_findings'),
			'import uses unified findings tool',
		);
		assert.ok(
			(await view.locator('#inline-list > [data-path]').count()) > inlinesBeforeImport,
			'high findings added as inline comments',
		);
		await view.click('#tab-findings');
		assert.equal(await view.evaluate(() => document.getElementById('findings-undo')?.hidden), false);
		await view.click('#findings-undo');
		await view.waitForFunction(() => document.getElementById('findings-undo')?.hidden === true);
		await view.click('#tab-comments');
		assert.equal(
			await view.locator('#inline-list > [data-path]').count(),
			inlinesBeforeImport,
			'undo restores prior draft',
		);

		// Editing marks the draft dirty and enables Save.
		await view.fill('#summary', 'Edited summary from the dashboard.');
		assert.equal(await view.isEnabled('#save'), true);
		assert.match((await view.textContent('#dirty-state')) ?? '', /Unsaved changes/);

		// The human submits: Submit asks for confirmation first, nothing is sent before that.
		toolCalls.length = 0;
		await view.click('#publish');
		assert.equal(await view.isVisible('#confirm'), true);
		assert.match((await view.textContent('#confirm-body')) ?? '', /\d+ inline · \d+ in summary · /);
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
					{ id: 'AC-2', status: 'unmet', note: 'JSON.parse throws', evidence: ['src/app.ts:6'] },
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
		// pr-review-dashboard-ux REQ-024: Pin unmet as inline when evidence has path:line.
		assert.equal(await view.isVisible('#pin-unmet-inline'), true);
		toolCalls.length = 0;
		await view.click('#pin-unmet-inline');
		await view.waitForFunction(
			() => document.getElementById('panel-comments') && !document.getElementById('panel-comments')?.hidden,
		);
		const pin = toolCalls.find((c) => c.name === 'pr_review_import_findings');
		assert.deepEqual(pin?.arguments?.['keys'], ['ticket:AC-2']);
		await view.click('#tab-findings');
		await view.click('#findings-filter button[data-value="ticket"]');
		assert.match((await view.textContent('#findings-list')) ?? '', /AC-2|Ticket/);

		await view.click('#tab-requirements');
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
