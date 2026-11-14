import fs from 'node:fs/promises';
import path from 'node:path';

import { Inject, Injectable } from '@nestjs/common';

import { ProcessRunner } from '../../common/process/process-runner.service.ts';
import type { PrMetadata } from '../pr-review.types.ts';

type GhPrJson = {
	readonly number: number;
	readonly title: string;
	readonly baseRefName: string;
	readonly headRefName: string;
	readonly headRefOid: string;
	readonly url: string;
	readonly author?: { readonly login?: string };
	readonly files?: readonly { readonly path: string }[];
	readonly body?: string;
};

export type CreatedReview = { readonly url: string; readonly state: string };

/** `owner/repo` from a GitHub PR URL ('' when not a github.com URL). */
export const repoSlugFromPrUrl = (url: string): string => {
	if (!url.includes('github.com/')) return '';
	return url.replace(/^https:\/\/github\.com\//, '').replace(/\/pull\/\d+.*/, '');
};

/** GitHub and git access through the authenticated `gh` / `git` CLIs. */
@Injectable()
export class GithubService {
	constructor(@Inject(ProcessRunner) private readonly process: ProcessRunner) {}

	async fetchPrMetadata(pr: number, repoRoot: string): Promise<PrMetadata> {
		const out = await this.process.runOrThrow(
			'gh',
			['pr', 'view', String(pr), '--json', 'number,title,body,baseRefName,headRefName,headRefOid,url,author,files'],
			{ cwd: repoRoot },
		);
		const data = JSON.parse(out) as GhPrJson;
		return {
			number: data.number,
			title: data.title,
			baseRefName: data.baseRefName,
			headRefName: data.headRefName,
			headRefOid: data.headRefOid,
			url: data.url,
			author: data.author?.login ?? 'unknown',
			files: (data.files ?? []).map((f) => f.path),
			...(data.body ? { body: data.body } : {}),
		};
	}

	/** A GitHub issue by `45`, `#45`, `owner/repo#45` or its URL (another repo is allowed). */
	async fetchIssue(
		ref: string,
		repoRoot: string,
	): Promise<{ readonly number: number; readonly title: string; readonly body: string; readonly url: string }> {
		const match =
			/^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/issues\/(\d+)/.exec(ref) ??
			/^(?:([\w.-]+\/[\w.-]+))?#?(\d+)$/.exec(ref.trim());
		if (!match?.[2])
			throw new Error(`Not a GitHub issue reference: ${ref} (use 45, #45, owner/repo#45 or the issue URL)`);
		const out = await this.process.runOrThrow(
			'gh',
			['issue', 'view', match[2], '--json', 'number,title,body,url', ...(match[1] ? ['--repo', match[1]] : [])],
			{ cwd: repoRoot },
		);
		const data = JSON.parse(out) as { number: number; title?: string; body?: string; url?: string };
		return { number: data.number, title: data.title ?? '', body: data.body ?? '', url: data.url ?? '' };
	}

	fetchPrDiff(pr: number, repoRoot: string): Promise<string> {
		return this.process.runOrThrow('gh', ['pr', 'diff', String(pr)], { cwd: repoRoot });
	}

	/** Fetch origin and resolve the base branch to a commit SHA. */
	async resolveBaseSha(baseRef: string, repoRoot: string): Promise<string> {
		await this.process.runOrThrow('git', ['fetch', 'origin', '--prune'], { cwd: repoRoot });
		const sha = await this.process.runOrThrow('git', ['rev-parse', `origin/${baseRef}`], { cwd: repoRoot });
		return sha.trim();
	}

	/**
	 * Write the PR's version of `paths` (at commit `headSha`) under `destDir`, without touching the
	 * user's checkout, index or branch. Fetches `pull/<pr>/head` first (works for fork PRs too).
	 * Returns the paths that exist at that commit (files deleted by the PR are skipped).
	 */
	async materializePrFiles(options: {
		readonly repoRoot: string;
		readonly pr: number;
		readonly headSha: string;
		readonly paths: readonly string[];
		readonly destDir: string;
	}): Promise<string[]> {
		const { repoRoot, headSha } = options;
		await this.ensurePrCommit(repoRoot, options.pr, headSha);
		if (options.paths.length === 0) return [];

		const listed = await this.process.runOrThrow(
			'git',
			['ls-tree', '-r', '-z', '--name-only', headSha, '--', ...options.paths],
			// File names are literal (a PR may add `List Tasks (v1).yml`), never pathspec globs.
			{ cwd: repoRoot, env: { GIT_LITERAL_PATHSPECS: '1' } },
		);
		const existing = listed.split('\0').filter(Boolean);
		if (existing.length === 0) return [];

		// A throwaway index: read the PR tree into it and check files out under destDir (`--prefix`).
		const env = { GIT_INDEX_FILE: path.join(options.destDir, '.git-index') };
		await this.process.runOrThrow('git', ['read-tree', headSha], { cwd: repoRoot, env });
		await this.process.runOrThrow('git', ['checkout-index', '-f', `--prefix=${options.destDir}/`, '--', ...existing], {
			cwd: repoRoot,
			env,
		});
		await fs.rm(env.GIT_INDEX_FILE, { force: true });
		return existing;
	}

	private async hasCommit(repoRoot: string, sha: string): Promise<boolean> {
		return (await this.process.run('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: repoRoot })).code === 0;
	}

	/** Make the PR's head commit available locally (fetch `pull/<pr>/head` if needed). */
	async ensurePrCommit(repoRoot: string, pr: number, sha: string): Promise<void> {
		if (await this.hasCommit(repoRoot, sha)) return;
		await this.process.runOrThrow('git', ['fetch', '--no-tags', 'origin', `pull/${pr}/head`], { cwd: repoRoot });
		if (!(await this.hasCommit(repoRoot, sha))) {
			throw new Error(`PR head ${sha.slice(0, 8)} is not reachable after fetching pull/${pr}/head`);
		}
	}

	/** A file's content at `sha` (undefined when it does not exist there). Never touches the checkout. */
	async showFile(repoRoot: string, sha: string, path: string): Promise<string | undefined> {
		const { code, stdout } = await this.process.run('git', ['show', `${sha}:${path}`], { cwd: repoRoot });
		return code === 0 ? stdout : undefined;
	}

	/** File names directly in `dir` at `sha` (undefined when the folder does not exist there). Never touches the checkout. */
	async listDirAt(repoRoot: string, sha: string, dir: string): Promise<string[] | undefined> {
		const { code, stdout } = await this.process.run('git', ['ls-tree', '--name-only', sha, '--', `${dir}/`], {
			cwd: repoRoot,
		});
		const names = stdout
			.split('\n')
			.filter(Boolean)
			.map((p) => p.slice(dir.length + 1));
		return code === 0 && names.length ? names : undefined;
	}

	/**
	 * Commits per file in the history of `sha` since `since` (spec-drift-depth REQ-002); undefined when git cannot read
	 * it. Only the given files are counted.
	 */
	async churn(repoRoot: string, sha: string, since: string, files: readonly string[]): Promise<string | undefined> {
		if (!files.length) return '';
		const { code, stdout } = await this.process.run(
			'git',
			['log', sha, `--since=${since}`, '--format=', '--name-only', '--', ...files],
			{ cwd: repoRoot },
		);
		return code === 0 ? stdout : undefined;
	}

	/** `git grep` at `sha`: `path:line:text` lines (the `sha:` prefix removed). */
	async grepAt(
		repoRoot: string,
		sha: string,
		pattern: string,
		options: { readonly regex?: boolean; readonly paths?: readonly string[]; readonly maxLines: number },
	): Promise<{ readonly lines: string[]; readonly truncated: boolean }> {
		const args = [
			'grep',
			'-n',
			'-I',
			'--no-color',
			...(options.regex ? ['-E'] : ['-F']),
			'-e',
			pattern,
			sha,
			'--',
			...(options.paths ?? []),
		];
		// Exit 1 = no match.
		const { code, stdout, stderr } = await this.process.run('git', args, { cwd: repoRoot });
		if (code > 1) throw new Error(`git grep failed: ${stderr.trim() || `exit ${code}`}`);
		const all = stdout
			.split('\n')
			.filter(Boolean)
			.map((l) => (l.startsWith(`${sha}:`) ? l.slice(sha.length + 1) : l));
		return { lines: all.slice(0, options.maxLines), truncated: all.length > options.maxLines };
	}

	/** Files that differ between two commits (undefined when either is unknown, e.g. after a force-push). */
	async changedFilesBetween(repoRoot: string, from: string, to: string): Promise<string[] | undefined> {
		if (!(await this.hasCommit(repoRoot, from)) || !(await this.hasCommit(repoRoot, to))) return undefined;
		const { code, stdout } = await this.process.run('git', ['diff', '--name-only', '-z', from, to], { cwd: repoRoot });
		return code === 0 ? stdout.split('\0').filter(Boolean) : undefined;
	}

	/** Inline review comments already on the PR (any reviewer). */
	async fetchReviewComments(
		repo: string,
		pr: number,
		repoRoot: string,
	): Promise<{ path: string; line: number; body: string; author: string }[]> {
		const out = await this.process.runOrThrow(
			'gh',
			[
				'api',
				'--paginate',
				`repos/${repo}/pulls/${pr}/comments`,
				'--jq',
				'.[] | {path, line: (.line // .original_line), body, author: .user.login}',
			],
			{ cwd: repoRoot },
		);
		return out
			.split('\n')
			.filter(Boolean)
			.flatMap((line) => {
				try {
					const c = JSON.parse(line) as { path?: string; line?: number; body?: string; author?: string };
					return c.path && c.body
						? [{ path: c.path, line: c.line ?? 0, body: c.body, author: c.author ?? 'unknown' }]
						: [];
				} catch {
					return [];
				}
			});
	}

	/** Absolute top-level directory of the git repo containing `cwd`. */
	async repoTopLevel(cwd: string): Promise<string> {
		return (await this.process.runOrThrow('git', ['rev-parse', '--show-toplevel'], { cwd })).trim();
	}

	/** POST a pull request review (payload per the GitHub "create a review" API). */
	async createReview(options: {
		readonly repo: string;
		readonly pr: string;
		readonly payload: Record<string, unknown>;
		readonly cwd: string;
	}): Promise<CreatedReview> {
		const out = await this.process.runOrThrow(
			'gh',
			['api', '-X', 'POST', `repos/${options.repo}/pulls/${options.pr}/reviews`, '--input', '-'],
			{ cwd: options.cwd, input: JSON.stringify(options.payload) },
		);
		const review = JSON.parse(out) as { html_url?: string; state?: string };
		return { url: review.html_url ?? '', state: review.state ?? '' };
	}
}
