/**
 * Deep e2e of the PR review lifecycle through the MCP server, against a real git repo (with an
 * `origin` remote), real semgrep for the architecture scan, and a fake `gh` that serves PR #42 and
 * records published reviews. Tests run in order and share one review workspace.
 */
import 'reflect-metadata';

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';

import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { connectMcpClient } from '@nestjs/mcp/testing';
import { Test, type TestingModule } from '@nestjs/testing';

import { ArchitectureScanService } from '../src/pr-review/architecture/architecture-scan.service.ts';
import { GithubService } from '../src/pr-review/github/github.service.ts';
import type { PrReviewView } from '../src/pr-review/pr-review.types.ts';
import {
	createReviewedRepo,
	FAKE_GH_BIN,
	hasSemgrep,
	PR_NUMBER,
	publishedReviews,
	type ReviewedRepo,
	tmpDir,
} from './fixtures/sandbox.ts';

type CallResult = Awaited<ReturnType<Client['callTool']>>;
const LAUNCHER = path.resolve(import.meta.dirname, '../bin/mcp-stdio');
const textOf = (r: CallResult) => (r.content as Array<{ text?: string }>).map((c) => c.text ?? '').join('\n');

describe('PR review lifecycle (fake gh, real git + semgrep)', {
	skip: !hasSemgrep() && 'semgrep not installed',
}, () => {
	let moduleRef: TestingModule;
	let client: Client;
	let sandbox: ReviewedRepo;
	let artifactsRoot: string;
	let base: string;
	const pr = PR_NUMBER;

	const call = (name: string, args: Record<string, unknown> = {}) =>
		client.callTool({ name, arguments: { pr, repoPath: sandbox.repo, ...args } });
	const view = async (name: string, args: Record<string, unknown> = {}): Promise<PrReviewView> => {
		const result = await call(name, args);
		assert.ok(!result.isError, `${name} failed: ${textOf(result)}`);
		return result.structuredContent as unknown as PrReviewView;
	};
	const artifact = (file: string) => path.join(base, file);
	const read = (file: string) => fs.readFileSync(artifact(file), 'utf8');

	before(async () => {
		sandbox = createReviewedRepo();
		artifactsRoot = tmpDir('mcp-e2e-artifacts');
		Object.assign(process.env, {
			PATH: `${FAKE_GH_BIN}${path.delimiter}${process.env['PATH']}`,
			FAKE_GH_STATE: sandbox.ghState,
			PR_REVIEW_ROOT: artifactsRoot,
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

	test('pr_review_start prepares the diff, review groups, architecture scan and group 0', async () => {
		const started = await call('pr_review_start', { context: 'parsing helpers' });
		assert.ok(!started.isError, textOf(started));
		const startText = textOf(started);
		const v = started.structuredContent as unknown as PrReviewView;
		base = v.paths.base;

		assert.equal(v.phase, 'reviewing');
		assert.equal(base, path.join(artifactsRoot, path.basename(sandbox.repo), `pr-${pr}`));
		assert.equal(v.state.repo, 'acme/demo');
		assert.equal(v.state.base, 'main');
		assert.equal(v.state.current.head_sha, sandbox.headSha);
		assert.match(v.state.current.base_sha, /^[0-9a-f]{40}$/);

		// Lockfile and spec file are filtered out (the base branch's .pr-review.yml says
		// reviewTests: false); ts + py land in separate rule groups.
		assert.equal(v.units?.profile?.reviewTests, false, 'profile read from the base branch');
		assert.equal(v.units?.fileCount, 4);
		assert.equal(v.units?.selectedCount, 2);
		assert.deepEqual(v.units?.skipped.map((s) => s.path).sort(), ['package-lock.json', 'src/app.spec.ts']);
		assert.equal(v.units?.groups.length, 2);
		// RIGHT-side lines inside hunks (added + context) — GitHub accepts comments on all of them.
		// The dashboard payload omits line maps; they stay in the units.json resource.
		const units = await client.readResource({ uri: `pr-review://${v.paths.project}/${pr}/units.json` });
		const rightLines = JSON.parse((units.contents[0] as { text: string }).text).rightLinesByPath['src/app.ts'];
		for (const line of sandbox.added.appTs) assert.ok(rightLines.includes(line));

		// Coverage: group 0 active, with its rule checklist attached.
		assert.equal(v.progress?.activeGroupIndex, 0);
		assert.equal(v.progress?.doneCount, 0);
		assert.equal(v.nextGroup?.index, 0);
		assert.equal(v.diff, undefined, 'full diff is not sent to the dashboard');
		assert.equal(v.nextGroup?.instruction, '', 'model instruction is not duplicated into structured content');
		assert.doesNotMatch(startText, /<rules for="|<diff /, 'only pr_review_next_group hands out a group');
		assert.match(startText, /Next group: \[0\] python \(src\/util\.py\) — call pr_review_next_group/);

		// Architecture: the reviewed repo's own .semgrep ran on the PR files.
		assert.equal(v.architecture?.status, 'scanned');
		assert.equal(v.architecture?.findingCount, 2);

		// Agent prompt carries PR metadata and the context hint.
		assert.match(v.prompt ?? '', /Add parse helper and expression runner/);
		assert.match(v.prompt ?? '', /parsing helpers/);

		for (const file of ['diff.patch', 'units.json', 'progress.json', 'architecture.json', '.state.json']) {
			assert.ok(fs.existsSync(artifact(file)), `${file} written`);
		}
		const statusText = textOf(await call('pr_review_status'));
		assert.match(statusText, /phase: reviewing/);
		assert.doesNotMatch(statusText, /<rules for="/, 'status does not repeat the rule checklist');
		assert.match(statusText, /call pr_review_next_group for its diff and rules/);
	});

	test('pr_review_next_group is idempotent while a group is under review', async () => {
		const a = await view('pr_review_next_group');
		const b = await view('pr_review_next_group');
		assert.equal(a.nextGroup?.index, 0);
		assert.equal(b.nextGroup?.index, 0);
		assert.equal(b.progress?.groups.filter((g) => g.status === 'reviewing').length, 1);
	});

	test('each group brings its own diff; parallel reviewers can take groups by index', async () => {
		const text = textOf(await call('pr_review_next_group'));
		assert.match(text, /<diff files="1" source="untrusted">\ndiff --git a\/src\/util\.py/);
		assert.match(text, /\+ {4}return eval\(expr\)\n<\/diff>/);
		assert.match(text, /pr_review_read_file \/ pr_review_search \(the PR version/);
		assert.match(text, /Comment only on these lines \(RIGHT side\): src\/util\.py 1-4\./, 'line map as ranges');
		assert.doesNotMatch(text, /^repo: |^ {2}\[0\] /m, 'a loop step does not repeat the start header or group table');

		const second = await view('pr_review_next_group', { groupIndex: 1 });
		assert.equal(second.nextGroup?.index, 1);
		assert.deepEqual(
			second.progress?.groups.map((g) => g.status),
			['reviewing', 'reviewing'],
			'both groups in review at once',
		);
		const unknown = await call('pr_review_next_group', { groupIndex: 9 });
		assert.equal(unknown.isError, true);
	});

	test('pr_review_submit_findings anchors findings, rejects out-of-group and unanchored ones', async () => {
		const group0 = (await view('pr_review_status')).progress!.groups[0]!;
		const inGroup = group0.files[0]!;
		const outside = inGroup === 'src/app.ts' ? 'src/util.py' : 'src/app.ts';
		const line = inGroup === 'src/app.ts' ? 6 : 4;

		const v = await view('pr_review_submit_findings', {
			groupIndex: 0,
			summaryExtra: 'Unsafe parsing paths.',
			findings: [
				{
					path: inGroup,
					content: 'Unvalidated input reaches a dangerous call.',
					startLine: line,
					endLine: line,
					severity: 'high',
					category: 'security',
				},
				{
					path: inGroup,
					content: 'Outside every hunk.',
					startLine: 50,
					endLine: 50,
					severity: 'low',
					category: 'style',
				},
				{
					path: outside,
					content: 'Belongs to the other group.',
					startLine: 3,
					endLine: 3,
					severity: 'medium',
					category: 'bug',
				},
			],
		});
		assert.equal(v.progress?.doneCount, 1);
		assert.equal(v.nextGroup?.index, 1, 'advances to group 1');
		assert.equal(
			(v.progress as unknown as { findingCount: number }).findingCount,
			1,
			'only the anchored in-group finding is kept',
		);
		assert.equal(v.diff, undefined, 'a loop step returns the progress, not the review payload');
		assert.equal(v.parsed, undefined);
		assert.ok(
			v.warnings?.some((w) => /Unanchored finding skipped \(line 50 is not in the diff\).*existingCode/.test(w)),
			JSON.stringify(v.warnings),
		);
		assert.ok(
			v.warnings?.some((w) => w.includes('Finding path not in group [0]')),
			JSON.stringify(v.warnings),
		);
		assert.ok(fs.existsSync(artifact('comments.md')), 'draft written during the loop');
		assert.ok(!fs.existsSync(artifact('.original/comments.md')), 'no snapshot until coverage completes');
	});

	test('submit rejects an unknown group index with a clear message', async () => {
		const result = await call('pr_review_submit_findings', { groupIndex: 99, findings: [] });
		assert.equal(result.isError, true);
		assert.match(textOf(result), /Unknown group index 99/);
	});

	test('publish is blocked while coverage is incomplete', async () => {
		const v = await view('pr_review_publish');
		assert.equal(v.phase, 'reviewing');
		assert.match(v.message, /Coverage incomplete/);
		assert.equal(publishedReviews(sandbox.ghState).length, 0);
	});

	test('after the last group, findings are verified before the draft is final', async () => {
		// The verdict from group 0 is kept although this submit gives none.
		const result = await call('pr_review_submit_findings', { groupIndex: 1, findings: [] });
		const v = result.structuredContent as unknown as PrReviewView;
		assert.equal(v.progress?.complete, false);
		assert.equal(v.progress?.verification, 'pending');
		assert.equal(v.phase, 'reviewing');
		assert.equal(v.nextGroup, undefined);
		assert.match(textOf(result), /Verification pass: re-check each of the 1 finding[\s\S]*F1 \[high\] src\/util\.py:4/);
		assert.match(
			textOf(result),
			/<code path="src\/util\.py" source="untrusted">\n {4}1 {2}def add\(a, b\):[\s\S]*\n {4}4 {2} {4}return eval\(expr\)\n<\/code>/,
			'the verifier gets the code around the finding',
		);
		assert.ok(!fs.existsSync(artifact('.original/comments.md')), 'no snapshot before verification');

		const missing = await call('pr_review_verify_findings', { results: [{ id: 'F9', verdict: 'confirmed' }] });
		assert.equal(missing.isError, true);
		assert.match(textOf(missing), /Missing verdicts for F1/);
	});

	test('verifying the findings completes coverage and snapshots the draft', async () => {
		const v = await view('pr_review_verify_findings', {
			results: [{ id: 'F1', verdict: 'confirmed', note: 'JSON.parse on raw input' }],
		});
		assert.equal(v.progress?.complete, true);
		assert.equal(v.progress?.verification, 'done');
		assert.equal(v.phase, 'draft');
		assert.ok(fs.existsSync(artifact('.original/comments.md')));
		const draft = await view('pr_review_status');
		assert.equal(draft.parsed?.meta.event, 'REQUEST_CHANGES');
		assert.equal(draft.parsed?.meta.head_sha, sandbox.headSha);
		assert.equal(draft.parsed?.comments.length, 1);
		assert.equal(draft.progress?.findings[0]?.verdict, 'confirmed');
		assert.match(read('report.md'), /Unsafe parsing paths\./);
		// The same findings as SARIF 2.1.0, with a stable fingerprint per finding.
		const sarif = JSON.parse(read('findings.sarif')) as {
			version: string;
			runs: { results: { level: string; partialFingerprints?: Record<string, string> }[] }[];
		};
		assert.equal(sarif.version, '2.1.0');
		assert.equal(sarif.runs[0]?.results.length, 1);
		assert.equal(sarif.runs[0]?.results[0]?.level, 'error');
		assert.match(sarif.runs[0]?.results[0]?.partialFingerprints?.['architectureMcp/v1'] ?? '', /^[0-9a-f]{16}$/);
		assert.match(read('report.md'), /## Architecture \(project `\.semgrep`\)/);
	});

	test('the agent reads code at the PR head, not the local checkout (which is on main)', async () => {
		assert.equal(
			execFileSync('git', ['branch', '--show-current'], { cwd: sandbox.repo, encoding: 'utf8' }).trim(),
			'main',
		);
		const file = textOf(await call('pr_review_read_file', { path: 'src/app.ts', startLine: 4, endLine: 6 }));
		assert.match(file, /^src\/app\.ts @ [0-9a-f]{8} \(lines 4-6 of \d+\)/);
		assert.match(file, /\n {4}6 {2}\treturn JSON\.parse\(raw\);/, 'PR version, with line numbers');
		assert.match(
			textOf(await call('pr_review_read_file', { path: 'src/app.spec.ts' })),
			/import \{ greet \}/,
			'file only in the PR',
		);

		const found = textOf(await call('pr_review_search', { pattern: 'JSON.parse' }));
		assert.match(found, /src\/app\.ts:6:/);
		assert.match(textOf(await call('pr_review_search', { pattern: 'nothing-like-this-anywhere' })), /^No match/);

		const missing = await call('pr_review_read_file', { path: 'src/nope.ts' });
		assert.equal(missing.isError, true);
		assert.match(textOf(missing), /does not exist at the PR head/);
		for (const bad of ['../etc/passwd', '/etc/passwd', '--output=x']) {
			assert.equal((await call('pr_review_read_file', { path: bad })).isError, true, bad);
		}
	});

	test('pr_review_status opens the dashboard view with no human edits yet', async () => {
		const v = await view('pr_review_status');
		assert.equal(v.phase, 'draft');
		assert.ok(
			v.check?.changes.every((c) => c.kind === 'unchanged'),
			JSON.stringify(v.check?.changes),
		);
		assert.deepEqual(await view('pr_review_ui_reload'), v, 'ui_reload equals status');
	});

	test('pr_review_import_architecture turns semgrep findings into comments, without duplicates', async () => {
		const v = await view('pr_review_import_architecture');
		assert.equal(v.parsed?.comments.length, 3, '1 agent finding + 2 architecture findings');
		const archBodies = v.parsed!.comments.filter((c) => c.body.startsWith('[architecture]')).map((c) => c.body);
		assert.equal(archBodies.length, 2);
		assert.ok(
			archBodies.every((b) => /^\[architecture\] demo\.no-/.test(b)),
			JSON.stringify(archBodies),
		);
		assert.ok(
			v.check?.changes.some((c) => c.kind === 'added'),
			'shows as a human-visible addition',
		);

		const again = await view('pr_review_import_architecture');
		assert.equal(again.parsed?.comments.length, 3, 're-import adds nothing');
		assert.match(again.message, /Imported 0 architecture finding/);
	});

	test('pr_review_import_architecture rejects indices that match nothing', async () => {
		const result = await call('pr_review_import_architecture', { indices: [99] });
		assert.equal(result.isError, true);
		assert.match(textOf(result), /No architecture findings matched/);
	});

	test('pr_review_architecture_rescan replaces (not duplicates) the report section', async () => {
		await view('pr_review_architecture_rescan');
		await view('pr_review_architecture_rescan');
		const sections = read('report.md').match(/## Architecture \(project/g) ?? [];
		assert.equal(sections.length, 1);
	});

	test('risky human edits need force=true before publishing', async () => {
		const status = await view('pr_review_status');
		const agentComment = status.parsed!.comments.find((c) => !c.body.startsWith('[architecture]'))!;
		const edited = status.commentsMarkdown!.replace(agentComment.body, 'LGTM actually.');
		await view('pr_review_ui_save', { commentsMarkdown: edited });

		const blocked = await view('pr_review_publish');
		assert.equal(blocked.phase, 'needsConfirmation');
		assert.equal(publishedReviews(sandbox.ghState).length, 0);
	});

	test('pending publish sends a review without an event', async () => {
		const v = await view('pr_review_publish', { force: true, pending: true });
		assert.equal(v.phase, 'published');
		assert.equal(v.state.current.published, false, 'pending is not a published review');
		const [review] = publishedReviews(sandbox.ghState);
		assert.match(v.message, /visible only to you/);
		assert.equal(review?.endpoint, `repos/acme/demo/pulls/${pr}/reviews`);
		assert.equal(review?.payload['event'], undefined);

		// Every publish records how much of the draft the human kept.
		const log = fs.readFileSync(path.join(artifactsRoot, 'metrics.jsonl'), 'utf8').trim().split('\n');
		const metrics = JSON.parse(log.at(-1) ?? '{}');
		assert.equal(metrics.mode, 'pending');
		// The agent drafted 1 comment (the human rewrote it); the 2 architecture ones were added later.
		assert.deepEqual(metrics.comments, { drafted: 1, kept: 0, edited: 1, removed: 0, added: 2 });
		assert.deepEqual(metrics.verification, { confirmed: 1, plausible: 0, rejected: 0 });
		const summary = textOf(await client.callTool({ name: 'pr_review_metrics', arguments: {} }));
		assert.match(summary, /over 1 published review[\s\S]*Inline comments: 1 drafted · kept 0% · edited 100%/);
		// spec-drift-demand REQ-003: the review's time and calls since the last pr_review_start.
		assert.equal(typeof metrics.cost.minutes, 'number');
		assert.ok(metrics.cost.byTool.pr_review_start === 1, JSON.stringify(metrics.cost.byTool));
		assert.ok(metrics.cost.byTool.pr_review_submit_findings >= 2);
		assert.ok(metrics.cost.calls >= 4 && metrics.cost.chars > 1000);
		assert.equal(metrics.cost.estTokens, Math.round(metrics.cost.chars / 4));
		assert.match(summary, /Cost \(median of 1 review\(s\)\): [\d.]+ min · \d+ tool calls · ~\d+ tokens of tool output/);
	});

	test('the model can only create pending reviews, even when forcing', async () => {
		const v = await view('pr_review_publish', { force: true, pending: false });
		assert.equal(v.state.current.published, false);
		assert.match(v.message, /pending review/);
		const last = publishedReviews(sandbox.ghState).at(-1)!;
		assert.equal(last.payload['event'], undefined, 'no APPROVE / REQUEST_CHANGES from the model');
	});

	test('the dashboard submits the review and marks the state published', async () => {
		const v = await view('pr_review_ui_publish', { force: true });
		assert.equal(v.phase, 'published');
		assert.equal(v.reviewUrl, `https://github.com/acme/demo/pull/${pr}#pullrequestreview-1`);
		assert.equal(v.state.current.published, true);

		const review = publishedReviews(sandbox.ghState).at(-1)!;
		assert.equal(review.payload['event'], 'REQUEST_CHANGES');
		assert.equal(review.payload['commit_id'], sandbox.headSha);
		assert.equal(review.payload['comments'].length, 3);
		assert.ok(review.payload['comments'].some((c: { body: string }) => c.body === 'LGTM actually.'));
		for (const c of review.payload['comments'] as Array<{ path: string; line: number; side: string }>) {
			assert.equal(c.side, 'RIGHT');
			assert.ok(['src/app.ts', 'src/util.py'].includes(c.path));
		}
		assert.equal((await view('pr_review_status')).phase, 'published');
	});

	test('re-running pr_review_start rotates the previous revision', async () => {
		const v = await view('pr_review_start');
		assert.equal(v.paths.rotated, 'v1');
		assert.equal(v.state.current.revision, 2);
		assert.equal(v.state.history.length, 1);
		assert.ok(fs.existsSync(artifact('report.v1.md')));
		assert.ok(fs.existsSync(artifact('comments.v1.md')));
		assert.match(
			v.prompt ?? '',
			/## Re-review\nPrevious review at `[0-9a-f]{8}`\.\nNo file changed since the previous review head\./,
		);
		assert.match(
			v.prompt ?? '',
			/Previous inline comments[\s\S]*src\/util\.py:4: LGTM actually\./,
			'previous comments to re-check',
		);
	});

	test('pr_review_save_draft validates comments.md and reports parse errors', async () => {
		const bad = await call('pr_review_save_draft', { reportMarkdown: '# r', commentsMarkdown: '## Inline\n' });
		assert.equal(bad.isError, true);
		assert.match(textOf(bad), /front-matter/);

		const good = await view('pr_review_save_draft', {
			reportMarkdown: '# Manual review',
			commentsMarkdown: `---\npr: ${pr}\nrepo: acme/demo\nhead_sha: ${sandbox.headSha}\nevent: COMMENT\n---\n\n## Inline\n\n### src/app.ts:5\nPrefer the logger.\n\n## Summary\nOne nit.\n`,
		});
		assert.equal(good.phase, 'draft');
		assert.equal(good.parsed?.comments.length, 1);
		assert.equal(read('.original/comments.md'), good.commentsMarkdown);
	});

	test('pr_review_cleanup removes the workspace and is safe to repeat', async () => {
		await view('pr_review_cleanup');
		assert.ok(!fs.existsSync(base));
		await view('pr_review_cleanup');
	});

	test('tools that need a started review explain what to call first', async () => {
		for (const [name, pattern] of [
			['pr_review_next_group', /call pr_review_start first/],
			['pr_review_submit_findings', /Call pr_review_start first/],
			['pr_review_import_architecture', /pr_review_start or pr_review_architecture_rescan first/],
			['pr_review_publish', /Save a draft first/],
		] as const) {
			const result = await call(name, name === 'pr_review_submit_findings' ? { findings: [] } : {});
			assert.equal(result.isError, true, name);
			assert.match(textOf(result), pattern, name);
		}
		assert.match(textOf(await call('pr_review_status')), /No draft yet/);
	});

	test('gh failures surface their message (e.g. not logged in)', async () => {
		process.env['FAKE_GH_FAIL'] = '1';
		try {
			const result = await call('pr_review_start');
			assert.equal(result.isError, true);
			assert.match(textOf(result), /gh auth login/);
		} finally {
			delete process.env['FAKE_GH_FAIL'];
		}
	});

	test("a PR number gh does not know fails with gh's message", async () => {
		const result = await client.callTool({ name: 'pr_review_start', arguments: { pr: 7, repoPath: sandbox.repo } });
		assert.equal(result.isError, true);
		assert.match(textOf(result), /Could not resolve to a PullRequest/);
	});

	test('concurrent submits for different groups both land (no lost update)', async () => {
		await view('pr_review_start');
		const results = await Promise.all(
			[0, 1].map((groupIndex) => call('pr_review_submit_findings', { groupIndex, findings: [] })),
		);
		assert.ok(results.every((r) => !r.isError));
		const v = await view('pr_review_status');
		assert.deepEqual(
			v.progress?.groups.map((g) => g.status),
			['done', 'done'],
		);
		assert.equal(v.progress?.complete, true);
	});

	test('PR file names can never be parsed as semgrep options', async () => {
		// A PR can add a file literally named `--output=…`; it must stay a scan target.
		await moduleRef.get(ArchitectureScanService).scan({
			repoRoot: sandbox.repo,
			project: 'demo',
			paths: ['--output=pwned.json', 'src/app.ts'],
		});
		assert.ok(!fs.existsSync(path.join(sandbox.repo, 'pwned.json')));
	});

	test('PR files are read at the PR head: odd names kept, deleted files skipped, checkout untouched', async () => {
		const git = (...args: string[]) => execFileSync('git', args, { cwd: sandbox.repo, encoding: 'utf8' });
		// A second PR, built on a scratch branch and published only as refs/pull/77/head.
		git('checkout', '-q', '-b', 'scratch-77');
		fs.mkdirSync(path.join(sandbox.repo, 'docs'), { recursive: true });
		fs.writeFileSync(path.join(sandbox.repo, 'docs/List Tasks (v1).ts'), 'export const f = (x: any) => x;\n');
		git('rm', '-q', 'src/util.py');
		git('add', '-A');
		git('commit', '-q', '-m', 'odd names');
		const headSha = git('rev-parse', 'HEAD').trim();
		git('push', '-q', 'origin', 'HEAD:refs/pull/77/head');
		git('checkout', '-q', 'main');
		git('branch', '-q', '-D', 'scratch-77');
		const statusBefore = git('status', '--porcelain');

		const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-files-'));
		const files = await moduleRef.get(GithubService).materializePrFiles({
			repoRoot: sandbox.repo,
			pr: 77,
			headSha,
			paths: ['docs/List Tasks (v1).ts', 'src/util.py', 'src/app.ts'],
			destDir: dest,
		});
		assert.deepEqual(files.sort(), ['docs/List Tasks (v1).ts', 'src/app.ts'], 'deleted src/util.py skipped');
		assert.match(fs.readFileSync(path.join(dest, 'docs/List Tasks (v1).ts'), 'utf8'), /x: any/);
		assert.ok(!fs.existsSync(path.join(sandbox.repo, 'docs/List Tasks (v1).ts')), 'not written to the checkout');
		assert.equal(git('status', '--porcelain'), statusBefore, 'index and working tree unchanged');
		assert.equal(git('branch', '--show-current').trim(), 'main');

		const arch = await moduleRef.get(ArchitectureScanService).scan({
			repoRoot: sandbox.repo,
			project: 'demo',
			paths: files,
			targetRoot: dest,
		});
		assert.equal(arch.status, 'scanned', arch.stderrTail ?? arch.message);
		assert.ok(arch.findings.some((f) => f.path === 'docs/List Tasks (v1).ts' && f.checkId === 'demo.no-explicit-any'));
	});

	test('artifacts are readable as MCP resources', async () => {
		const v = await view('pr_review_status');
		const read = async (file: string) =>
			(await client.readResource({ uri: `pr-review://${v.paths.project}/${pr}/${file}` })).contents[0] as {
				text: string;
				mimeType: string;
			};
		assert.match((await read('diff.patch')).text, /^diff --git/);
		assert.equal((await read('diff.patch')).mimeType, 'text/x-diff');
		await assert.rejects(read('../../.ssh/id_rsa'));
		await assert.rejects(read('secrets.txt'));
	});

	test('submits from two server processes (two MCP clients) do not lose updates', async () => {
		await view('pr_review_start');
		const env = {
			HOME: process.env['HOME']!,
			PATH: process.env['PATH']!,
			FAKE_GH_STATE: sandbox.ghState,
			PR_REVIEW_ROOT: artifactsRoot,
		};
		const clients = await Promise.all(
			[0, 1].map(async () => {
				const c = new Client({ name: 'second-process', version: '0' });
				await c.connect(new StdioClientTransport({ command: LAUNCHER, cwd: '/', env, stderr: 'ignore' }));
				return c;
			}),
		);
		try {
			const results = await Promise.all(
				[0, 1].map((groupIndex) =>
					clients[groupIndex]!.callTool({
						name: 'pr_review_submit_findings',
						arguments: { pr, repoPath: sandbox.repo, groupIndex, findings: [] },
					}),
				),
			);
			assert.ok(
				results.every((r) => !r.isError),
				results.map(textOf).join('\n'),
			);
		} finally {
			await Promise.all(clients.map((c) => c.close()));
		}
		const v = await view('pr_review_status');
		assert.deepEqual(
			v.progress?.groups.map((g) => g.status),
			['done', 'done'],
		);
	});

	test('a repo without .semgrep gets a "generate rules" prompt instead of a scan', async () => {
		const bare = createReviewedRepo({ withSemgrep: false });
		const before = process.env['FAKE_GH_STATE'];
		process.env['FAKE_GH_STATE'] = bare.ghState;
		try {
			const result = await client.callTool({ name: 'pr_review_start', arguments: { pr, repoPath: bare.repo } });
			assert.ok(!result.isError, textOf(result));
			const v = result.structuredContent as unknown as PrReviewView;
			assert.equal(v.architecture?.status, 'missing-config');
			assert.match(v.architecture?.generatePrompt ?? '', /Generate \.semgrep architecture rules/);
			assert.match(v.architecture?.generatePrompt ?? '', /pr_review_architecture_rescan/);
		} finally {
			process.env['FAKE_GH_STATE'] = before;
		}
	});
});
