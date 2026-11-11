import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';

import { FileLock, LockTimeoutError } from './file-lock.ts';

const lockDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'file-lock-spec-'));

describe('FileLock', () => {
	test('serializes holders of the same key (separate lock instances = separate processes)', async () => {
		const dir = lockDir();
		const a = new FileLock({ dir });
		const b = new FileLock({ dir });
		const log: string[] = [];
		let aHolds!: () => void;
		const aAcquired = new Promise<void>((resolve) => (aHolds = resolve));
		await Promise.all([
			a.run('pr#1', async () => {
				log.push('a start');
				aHolds();
				await sleep(50);
				log.push('a end');
			}),
			// Only contend once A really holds the lock (no timing assumptions).
			aAcquired.then(() => b.run('pr#1', async () => void log.push('b'))),
		]);
		assert.deepEqual(log, ['a start', 'a end', 'b']);
		assert.equal(fs.readdirSync(dir).length, 0, 'lock released');
	});

	test('takes over a lock left by a crashed process', async () => {
		const dir = lockDir();
		const name = `${createHash('sha256').update('pr#2').digest('hex').slice(0, 32)}.lock`;
		// A lock file whose holder pid does not exist (process crashed while holding it).
		fs.writeFileSync(path.join(dir, name), JSON.stringify({ pid: 2 ** 22 + 12345, key: 'pr#2' }));
		const lock = new FileLock({ dir, timeoutMs: 2_000 });
		assert.equal(await lock.run('pr#2', async () => 'acquired'), 'acquired');
	});

	test('times out while a live holder keeps the lock', async () => {
		const dir = lockDir();
		const holder = new FileLock({ dir });
		const waiter = new FileLock({ dir, timeoutMs: 150 });
		let release!: () => void;
		const held = holder.run('pr#3', () => new Promise<void>((resolve) => (release = resolve)));
		await sleep(10);
		await assert.rejects(
			waiter.run('pr#3', async () => undefined),
			LockTimeoutError,
		);
		release();
		await held;
	});
});
