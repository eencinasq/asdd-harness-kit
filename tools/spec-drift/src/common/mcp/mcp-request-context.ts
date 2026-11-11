import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-call MCP context (cancellation + progress) available anywhere below a tool handler,
 * without threading it through every service method. Set by McpRequestContextInterceptor.
 */
export type McpRequestContext = {
	/** Aborted when the client cancels the call or disconnects. */
	readonly signal?: AbortSignal;
	reportProgress(progress: number, total?: number, message?: string): Promise<void>;
};

const storage = new AsyncLocalStorage<McpRequestContext>();

const NO_CONTEXT: McpRequestContext = { reportProgress: async () => undefined };

export const mcpRequestContext = {
	run<T>(context: McpRequestContext, fn: () => T): T {
		return storage.run(context, fn);
	},
	/** The current call's context, or a no-op one outside an MCP call (scripts, tests). */
	current(): McpRequestContext {
		return storage.getStore() ?? NO_CONTEXT;
	},
};
