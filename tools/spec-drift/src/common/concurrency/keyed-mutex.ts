/**
 * Serializes async work per key (in-process). Calls with the same key run one at a time in arrival
 * order; different keys run concurrently. Used to make read-modify-write of on-disk review state
 * safe when the agent and the dashboard call tools at the same time.
 */
export class KeyedMutex {
	private readonly tails = new Map<string, Promise<unknown>>();

	async run<T>(key: string, task: () => Promise<T>): Promise<T> {
		const previous = this.tails.get(key) ?? Promise.resolve();
		const current = previous.catch(() => undefined).then(task);
		this.tails.set(key, current);
		try {
			return await current;
		} finally {
			// Drop the entry once nothing is queued behind this call.
			if (this.tails.get(key) === current) this.tails.delete(key);
		}
	}
}
