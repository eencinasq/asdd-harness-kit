import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

export type FileLockOptions = {
	/** Directory for lock files (default: <tmpdir>/spec-drift-locks). */
	readonly dir?: string;
	/** Give up waiting after this long. */
	readonly timeoutMs?: number;
	/** A lock older than this is considered abandoned (holder crashed) and is taken over. */
	readonly staleMs?: number;
};

export class LockTimeoutError extends Error {
	constructor(key: string, timeoutMs: number) {
		super(`Another process is still working on '${key}' (waited ${Math.round(timeoutMs / 1000)}s). Try again.`);
		this.name = 'LockTimeoutError';
	}
}

const isAlive = (pid: number): boolean => {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === 'EPERM';
	}
};

/**
 * Cross-process mutual exclusion with a lock file created atomically (`O_EXCL`). Every MCP client
 * (Cursor, Claude Desktop, Claude Code) starts its own server process, so in-process locks alone
 * don't protect on-disk review state.
 */
export class FileLock {
	private readonly dir: string;
	private readonly timeoutMs: number;
	private readonly staleMs: number;

	constructor(options: FileLockOptions = {}) {
		this.dir = options.dir ?? path.join(os.tmpdir(), 'spec-drift-locks');
		this.timeoutMs = options.timeoutMs ?? 120_000;
		this.staleMs = options.staleMs ?? 15 * 60_000;
	}

	async run<T>(key: string, task: () => Promise<T>): Promise<T> {
		const file = await this.acquire(key);
		try {
			return await task();
		} finally {
			await fs.rm(file, { force: true });
		}
	}

	private async acquire(key: string): Promise<string> {
		await fs.mkdir(this.dir, { recursive: true });
		const file = path.join(this.dir, `${createHash('sha256').update(key).digest('hex').slice(0, 32)}.lock`);
		const deadline = Date.now() + this.timeoutMs;
		for (let attempt = 0; ; attempt += 1) {
			try {
				const handle = await fs.open(file, 'wx');
				await handle.writeFile(JSON.stringify({ pid: process.pid, key, at: new Date().toISOString() }));
				await handle.close();
				return file;
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
			}
			if (await this.isAbandoned(file)) {
				await fs.rm(file, { force: true });
				continue;
			}
			if (Date.now() > deadline) throw new LockTimeoutError(key, this.timeoutMs);
			await sleep(Math.min(25 * 2 ** attempt, 500));
		}
	}

	/** The holder died (pid gone) or the lock is far older than any tool call. */
	private async isAbandoned(file: string): Promise<boolean> {
		try {
			const [stat, raw] = await Promise.all([fs.stat(file), fs.readFile(file, 'utf8')]);
			if (Date.now() - stat.mtimeMs > this.staleMs) return true;
			const pid = (JSON.parse(raw) as { pid?: number }).pid;
			return typeof pid === 'number' && !isAlive(pid);
		} catch {
			return false; // being written or just released; retry
		}
	}
}
