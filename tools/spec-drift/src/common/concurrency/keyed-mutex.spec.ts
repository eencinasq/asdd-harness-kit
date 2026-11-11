import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';

import { KeyedMutex } from './keyed-mutex.ts';

describe('KeyedMutex', () => {
	test('runs tasks with the same key one at a time, in order', async () => {
		const mutex = new KeyedMutex();
		const log: string[] = [];
		const task = (id: string, ms: number) => async () => {
			log.push(`start ${id}`);
			await sleep(ms);
			log.push(`end ${id}`);
			return id;
		};
		const results = await Promise.all([mutex.run('pr', task('a', 20)), mutex.run('pr', task('b', 1))]);
		assert.deepEqual(results, ['a', 'b']);
		assert.deepEqual(log, ['start a', 'end a', 'start b', 'end b']);
	});

	test('runs different keys concurrently', async () => {
		const mutex = new KeyedMutex();
		const log: string[] = [];
		await Promise.all([
			mutex.run('x', async () => {
				log.push('start x');
				await sleep(20);
				log.push('end x');
			}),
			mutex.run('y', async () => {
				log.push('start y');
			}),
		]);
		assert.deepEqual(log.slice(0, 2), ['start x', 'start y']);
	});

	test('a failing task does not block the next one', async () => {
		const mutex = new KeyedMutex();
		await assert.rejects(
			mutex.run('k', async () => Promise.reject(new Error('boom'))),
			/boom/,
		);
		assert.equal(await mutex.run('k', async () => 'ok'), 'ok');
	});
});
