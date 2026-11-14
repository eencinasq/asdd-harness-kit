import fs from 'node:fs/promises';
import path from 'node:path';

import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { writeJsonAtomic } from '../../common/fs/atomic-write.ts';
import type { Env } from '../../config/env.schema.ts';
import { GithubService } from '../github/github.service.ts';
import type { ResolvedPaths, ReviewState } from '../pr-review.types.ts';

const today = (): string => new Date().toISOString().slice(0, 10);

const exists = (target: string): Promise<boolean> =>
	fs
		.access(target)
		.then(() => true)
		.catch(() => false);

const initialState = (pr: number): ReviewState => ({
	pr,
	repo: '',
	base: '',
	review_count: 1,
	current: { revision: 1, head_sha: '', base_sha: '', date: today(), published: false },
	history: [],
});

export type CurrentStatePatch = Partial<ReviewState['current']> & {
	readonly repo?: string;
	readonly base?: string;
};

/**
 * Owns the per-PR artifact directory and its `.state.json` (revision history).
 *
 * Location: `<repo>/.pr-review/pr-<N>/` when the repo has that dir (or gitignores it), otherwise
 * `$PR_REVIEW_ROOT/<project>/pr-<N>/` (default `$XDG_STATE_HOME/pr-review`).
 */
@Injectable()
export class ReviewWorkspaceService {
	private readonly defaultRepo?: string;
	/** `<project>/<pr>` → workspace dir, for resources (repo-dir workspaces can't be derived from the URI). */
	private readonly known = new Map<string, string>();
	private readonly fallbackRoot: string;

	constructor(
		@Inject(GithubService) private readonly github: GithubService,
		@Inject(ConfigService) config: ConfigService<Env, true>,
	) {
		this.defaultRepo = config.get('PR_REVIEW_REPO', { infer: true });
		this.fallbackRoot =
			config.get('PR_REVIEW_ROOT', { infer: true }) ??
			path.join(config.get('XDG_STATE_HOME', { infer: true }), 'pr-review');
	}

	/** Review quality log across every repo (see metrics/review-metrics.ts). */
	get metricsFile(): string {
		return path.join(this.fallbackRoot, 'metrics.jsonl');
	}

	resolveRepoRoot(repoPath?: string): Promise<string> {
		return this.github.repoTopLevel(repoPath ?? this.defaultRepo ?? process.cwd());
	}

	/**
	 * Resolve (and create) the artifact dir for a PR. With `rotate`, an existing report/comments/diff
	 * become `*.v<k>.*` and a new revision starts — used when re-reviewing a PR.
	 */
	async resolve(options: {
		readonly pr: number;
		readonly repoPath?: string;
		readonly rotate?: boolean;
	}): Promise<ResolvedPaths> {
		const repoRoot = await this.resolveRepoRoot(options.repoPath);
		const project = path.basename(repoRoot);
		const location = (await this.usesRepoReviewDir(repoRoot)) ? 'repo-dir' : 'fallback';
		const base =
			location === 'repo-dir'
				? path.join(repoRoot, '.pr-review', `pr-${options.pr}`)
				: path.join(this.fallbackRoot, project, `pr-${options.pr}`);

		await fs.mkdir(base, { recursive: true });
		const statePath = path.join(base, '.state.json');
		const existing = await this.readState(statePath);

		let rotated = '';
		if (options.rotate && (await exists(path.join(base, 'report.md')))) {
			rotated = await this.rotate(base, statePath, existing ?? initialState(options.pr));
		} else if (!existing) {
			await this.writeState(statePath, initialState(options.pr));
		}

		this.known.set(`${project}/${options.pr}`, base);
		return {
			repoRoot,
			project,
			location,
			base,
			report: path.join(base, 'report.md'),
			comments: path.join(base, 'comments.md'),
			diff: path.join(base, 'diff.patch'),
			units: path.join(base, 'units.json'),
			progress: path.join(base, 'progress.json'),
			architecture: path.join(base, 'architecture.json'),
			requirements: path.join(base, 'requirements.json'),
			risk: path.join(base, 'risk.json'),
			existingComments: path.join(base, 'existing-comments.json'),
			state: statePath,
			rotated,
			previousHeadSha: existing?.current.head_sha ?? '',
			previousBaseSha: existing?.current.base_sha ?? '',
			previousReports: await this.listPreviousReports(base),
		};
	}

	/** Workspace dir for a project/PR seen by this process, or under the fallback root; undefined if unknown. */
	async findWorkspace(project: string, pr: number): Promise<string | undefined> {
		const known = this.known.get(`${project}/${pr}`);
		if (known && (await exists(known))) return known;
		const fallback = path.join(this.fallbackRoot, project, `pr-${pr}`);
		return (await exists(fallback)) ? fallback : undefined;
	}

	async loadState(statePath: string): Promise<ReviewState> {
		const state = await this.readState(statePath);
		if (!state) throw new NotFoundException(`Missing review state at ${statePath}. Call pr_review_start first.`);
		return state;
	}

	async updateCurrentState(statePath: string, patch: CurrentStatePatch): Promise<ReviewState> {
		const state = await this.loadState(statePath);
		const next: ReviewState = {
			...state,
			repo: patch.repo ?? state.repo,
			base: patch.base ?? state.base,
			current: {
				...state.current,
				head_sha: patch.head_sha ?? state.current.head_sha,
				base_sha: patch.base_sha ?? state.current.base_sha,
				date: patch.date ?? state.current.date,
				published: patch.published ?? state.current.published,
				...(patch.review_url !== undefined ? { review_url: patch.review_url } : {}),
				revision: patch.revision ?? state.current.revision,
			},
		};
		await this.writeState(statePath, next);
		return next;
	}

	/** State for a PR with no artifacts yet (used when cleaning up an unknown PR). */
	emptyState(pr: number): ReviewState {
		return { ...initialState(pr), review_count: 0, current: { ...initialState(pr).current, revision: 0 } };
	}

	private async rotate(base: string, statePath: string, state: ReviewState): Promise<string> {
		const k = state.current.revision || state.review_count || 1;
		await fs.rename(path.join(base, 'report.md'), path.join(base, `report.v${k}.md`));
		for (const [from, to] of [
			['comments.md', `comments.v${k}.md`],
			['diff.patch', `diff.v${k}.patch`],
			// Findings with fingerprints: the next review reports what is new, still open or gone.
			['progress.json', `progress.v${k}.json`],
		] as const) {
			if (await exists(path.join(base, from))) await fs.rename(path.join(base, from), path.join(base, to));
		}
		await fs.rm(path.join(base, '.original'), { recursive: true, force: true });
		await this.writeState(statePath, {
			...state,
			review_count: k + 1,
			history: [...state.history, state.current],
			current: { revision: k + 1, head_sha: '', base_sha: '', date: today(), published: false },
		});
		return `v${k}`;
	}

	private async usesRepoReviewDir(repoRoot: string): Promise<boolean> {
		if (await exists(path.join(repoRoot, '.pr-review'))) return true;
		const gitignore = await fs.readFile(path.join(repoRoot, '.gitignore'), 'utf8').catch(() => '');
		return /^\/?\.pr-review\/?\s*$/m.test(gitignore);
	}

	private async listPreviousReports(base: string): Promise<readonly string[]> {
		const entries = await fs.readdir(base).catch(() => [] as string[]);
		return entries
			.filter((name) => /^report\.v\d+\.md$/.test(name))
			.map((name) => path.join(base, name))
			.toSorted();
	}

	private async readState(statePath: string): Promise<ReviewState | null> {
		const raw = await fs.readFile(statePath, 'utf8').catch(() => null);
		return raw ? (JSON.parse(raw) as ReviewState) : null;
	}

	private async writeState(statePath: string, state: ReviewState): Promise<void> {
		await writeJsonAtomic(statePath, state);
	}
}
