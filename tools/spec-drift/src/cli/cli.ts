/**
 * Commands a person (or CI) runs — not MCP tools (spec-drift-adoption ADR-002): they may write the files the read-only
 * server then reads.
 *   spec-drift baseline [--write] [--repo <dir>]   accept today's findings as existing (.semgrep/baseline.json)
 *   spec-drift record [--repo <dir>]                write today's snapshot (.semgrep/history/<date>.json)
 *   spec-drift config --client <cursor|claude-code|claude-desktop> [--project <dir>] [--toolsets <list>]
 *                                                   print the client configuration, every path resolved
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { NestFactory } from '@nestjs/core';
import { parseToolsets } from '../config/toolsets.ts';
import { API_KEY_SECRET, ciReviewWorkflow, REVIEWER_SECRET } from './ci-review.ts';
import { CLIENTS, type Client, clientConfig, toolDirs, WHERE } from './client-config.ts';

export const CLI_COMMANDS = ['baseline', 'record', 'config', 'ci-review'] as const;
export type CliCommand = (typeof CLI_COMMANDS)[number];

const option = (argv: readonly string[], name: string): string | undefined => {
	const i = argv.indexOf(`--${name}`);
	return i >= 0 ? argv[i + 1] : undefined;
};

/** Analysis services without an MCP transport, on the repo given by --repo (else ANALYSIS_REPO_ROOT, else cwd). */
const analysis = async (argv: readonly string[]) => {
	const repo = option(argv, 'repo');
	if (repo) process.env['ANALYSIS_REPO_ROOT'] = path.resolve(repo);
	// ConfigModule reads the environment when the module is evaluated: import after setting it.
	const { CliModule } = await import('./cli.module.ts');
	const { AnalysisService } = await import('../analysis/analysis.service.ts');
	const app = await NestFactory.createApplicationContext(CliModule, { logger: ['error', 'warn'] });
	return { app, service: app.get(AnalysisService) };
};

const baseline = async (argv: readonly string[]): Promise<number> => {
	const { app, service } = await analysis(argv);
	try {
		const { baseline: file, summary } = await service.buildBaseline();
		if (summary.status !== 'ok') {
			console.error(
				`spec-drift: the scan did not finish (${summary.status}); no baseline written. ${summary.message ?? summary.stderrTail}`,
			);
			return 1;
		}
		const target = path.join(service.repoRoot, service.baselineFile);
		const before = summary.baseline;
		console.log(
			`${file.total} finding(s) in ${summary.packs.length} pack(s)` +
				(before
					? ` — current baseline: ${before.new} new, ${before.existing} existing, ${before.resolved ?? 0} resolved`
					: ''),
		);
		if (!argv.includes('--write')) {
			console.log(`Dry run. To accept them as existing, run again with --write (writes ${target}), then commit it.`);
			return 0;
		}
		fs.writeFileSync(target, `${JSON.stringify(file, null, 2)}\n`);
		console.log(`Wrote ${target}. Commit it: later scans show only what is new.`);
		return 0;
	} finally {
		await app.close();
	}
};

/** HEAD of the analyzed repo, or null outside git. */
const headCommit = (repo: string): string | null => {
	try {
		return execFileSync('git', ['rev-parse', 'HEAD'], {
			cwd: repo,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		}).trim();
	} catch {
		return null;
	}
};

const record = async (argv: readonly string[]): Promise<number> => {
	const { app, service } = await analysis(argv);
	try {
		const { snapshot, summary } = await service.buildSnapshot(headCommit(service.repoRoot));
		if (summary.status !== 'ok') {
			console.error(
				`spec-drift: the scan did not finish (${summary.status}); no snapshot written. ${summary.message ?? summary.stderrTail}`,
			);
			return 1;
		}
		const dir = path.join(service.repoRoot, service.historyDir);
		fs.mkdirSync(dir, { recursive: true });
		const target = path.join(dir, `${snapshot.recorded_at.slice(0, 10)}.json`);
		const replaced = fs.existsSync(target);
		fs.writeFileSync(target, `${JSON.stringify(snapshot, null, 2)}\n`);
		console.log(
			`${replaced ? 'Replaced' : 'Wrote'} ${target}: ${snapshot.total} finding(s)${snapshot.new === null ? '' : `, ${snapshot.new} new`}. Commit it; drift_trend compares the snapshots.`,
		);
		return 0;
	} finally {
		await app.close();
	}
};

/** Print a client configuration (spec-drift-adoption REQ-004): config on stdout, guidance on stderr. Starts no server. */
const config = (argv: readonly string[]): number => {
	const client = option(argv, 'client') as Client | undefined;
	if (!client || !CLIENTS.includes(client)) {
		console.error(`spec-drift config: --client ${CLIENTS.join(' | ')} is required.`);
		return 2;
	}
	const projectArg = option(argv, 'project');
	const project = projectArg ? path.resolve(projectArg) : undefined;
	if (project && !fs.existsSync(project)) {
		console.error(`spec-drift config: --project ${project} does not exist.`);
		return 2;
	}
	const toolsets = option(argv, 'toolsets');
	if (toolsets) {
		try {
			parseToolsets(toolsets);
		} catch (error) {
			console.error((error as Error).message);
			return 2;
		}
	}
	// Two levels below the package root both in src/cli/ and in the bundle dist/server/.
	const root = new URL('../../', import.meta.url).pathname;
	const launcher = path.join(root, 'bin/mcp-stdio');
	console.log(
		clientConfig({ client, launcher, project, pathDirs: toolDirs(process.env['PATH'], process.execPath), toolsets }),
	);
	console.error(`\nPaste it into: ${WHERE[client]}.`);
	if (!fs.existsSync(path.join(root, 'node_modules')))
		console.error(`Not installed yet: run pnpm install && pnpm build in ${root}`);
	else if (!fs.existsSync(path.join(root, 'dist/analysis-dashboard.html')))
		console.error(`Dashboards not built: run pnpm build in ${root}`);
	return 0;
};

/** Print the CI review workflow (spec-drift-demand REQ-004): workflow on stdout, setup steps on stderr. Writes nothing. */
const ciReview = (argv: readonly string[]): number => {
	const kitRepo = option(argv, 'kit-repo') ?? 'eencinasq/asdd-harness-kit';
	const kitRef = option(argv, 'kit-ref') ?? 'main';
	if (!/^[\w.-]+\/[\w.-]+$/.test(kitRepo)) {
		console.error('spec-drift ci-review: --kit-repo must be owner/name.');
		return 2;
	}
	console.log(ciReviewWorkflow({ kitRepo, kitRef }));
	console.error(
		[
			'',
			'Save it as .github/workflows/spec-drift-review.yml in the reviewed repository, then add two secrets:',
			`  ${API_KEY_SECRET}: an Anthropic API key;`,
			`  ${REVIEWER_SECRET}: a fine-grained token of the person who submits the reviews (Pull requests: read and write; Contents and Issues: read).`,
			'A pending review belongs to that person: they see it on the PR and submit it. Pin --kit-ref to a commit.',
		].join('\n'),
	);
	return 0;
};

export const runCli = async (command: CliCommand, argv: readonly string[]): Promise<number> => {
	switch (command) {
		case 'baseline':
			return baseline(argv);
		case 'record':
			return record(argv);
		case 'config':
			return config(argv);
		case 'ci-review':
			return ciReview(argv);
	}
};
