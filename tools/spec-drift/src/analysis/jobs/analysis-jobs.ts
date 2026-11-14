import { randomUUID } from 'node:crypto';

/**
 * Background analysis jobs (spec-drift-depth REQ-004, ADR-004): protocol 2026-07-28 removed MCP Tasks, so a long scan
 * runs in this server process and the host polls `analysis_job`. Process memory only: nothing is written to disk, and
 * jobs end with the process.
 */

export const MAX_JOBS = 20;
/** Finished jobs are kept this long for polling. */
export const JOB_TTL_MS = 60 * 60 * 1000;

export type JobStatus = 'running' | 'done' | 'failed';

export type JobView<T> = {
	readonly id: string;
	readonly tool: string;
	readonly status: JobStatus;
	readonly startedAt: string;
	readonly finishedAt: string | null;
	/** Last progress message of the scan. */
	readonly progress: string | null;
	readonly result?: T;
	readonly error?: string;
};

type Job<T> = {
	id: string;
	tool: string;
	status: JobStatus;
	startedAt: number;
	finishedAt: number | null;
	progress: string | null;
	result?: T;
	error?: string;
};

export class JobLimitError extends Error {
	constructor() {
		super(`${MAX_JOBS} analysis jobs are running; wait for one to finish (analysis_job) before starting another.`);
		this.name = 'JobLimitError';
	}
}

export class AnalysisJobs<T> {
	private readonly jobs = new Map<string, Job<T>>();

	constructor(private readonly now: () => number = Date.now) {}

	/** Drops expired finished jobs; with `makeRoom`, also the oldest finished ones while at the limit. */
	private prune(makeRoom = false): void {
		const now = this.now();
		for (const [id, job] of this.jobs) {
			if (job.finishedAt !== null && now - job.finishedAt > JOB_TTL_MS) this.jobs.delete(id);
		}
		const finished = [...this.jobs.values()]
			.filter((j) => j.finishedAt !== null)
			.sort((a, b) => (a.finishedAt as number) - (b.finishedAt as number));
		while (makeRoom && this.jobs.size >= MAX_JOBS && finished.length) this.jobs.delete((finished.shift() as Job<T>).id);
	}

	/**
	 * Starts `run` without waiting for it. `run` receives a progress callback; the job keeps its last message. Throws
	 * JobLimitError when MAX_JOBS jobs are still running.
	 */
	start(tool: string, run: (progress: (message: string) => void) => Promise<T>): JobView<T> {
		this.prune(true);
		if (this.jobs.size >= MAX_JOBS) throw new JobLimitError();
		const job: Job<T> = {
			id: randomUUID(),
			tool,
			status: 'running',
			startedAt: this.now(),
			finishedAt: null,
			progress: null,
		};
		this.jobs.set(job.id, job);
		void Promise.resolve()
			.then(() =>
				run((message) => {
					job.progress = message;
				}),
			)
			.then(
				(result) => {
					job.status = 'done';
					job.result = result;
				},
				(error: unknown) => {
					job.status = 'failed';
					job.error = error instanceof Error ? error.message : String(error);
				},
			)
			.finally(() => {
				job.finishedAt = this.now();
			});
		return this.view(job);
	}

	get(id: string): JobView<T> | null {
		this.prune();
		const job = this.jobs.get(id);
		return job ? this.view(job) : null;
	}

	list(): JobView<T>[] {
		this.prune();
		return [...this.jobs.values()].sort((a, b) => b.startedAt - a.startedAt).map((j) => this.view(j, false));
	}

	private view(job: Job<T>, withResult = true): JobView<T> {
		return {
			id: job.id,
			tool: job.tool,
			status: job.status,
			startedAt: new Date(job.startedAt).toISOString(),
			finishedAt: job.finishedAt === null ? null : new Date(job.finishedAt).toISOString(),
			progress: job.progress,
			...(withResult && job.result !== undefined ? { result: job.result } : {}),
			...(job.error ? { error: job.error } : {}),
		};
	}
}
