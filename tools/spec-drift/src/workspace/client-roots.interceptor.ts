import {
	type CallHandler,
	type ExecutionContext,
	Inject,
	Injectable,
	Logger,
	type NestInterceptor,
} from '@nestjs/common';
import { type McpContext, McpExecutionContext } from '@nestjs/mcp';
import { from, type Observable, switchMap } from 'rxjs';

import { type ClientRoot, WorkspaceRoot } from './workspace-root.ts';

/** How long a call waits for the client's `roots/list` before running on the current root. */
const ROOTS_TIMEOUT_MS = 2_000;

/** The slice of an MCP call's context a roots request needs. */
export interface RootsRequestContext {
	readonly transport: 'http' | 'stdio';
	readonly era: 'legacy' | 'modern';
	readonly server: {
		readonly mcpReq: {
			send(
				request: { method: 'roots/list' },
				options?: { timeout?: number },
			): Promise<{ roots: readonly ClientRoot[] }>;
		};
	};
}

/**
 * Keeps WorkspaceRoot on the client's project. One stdio server is shared by every project its client opens, so
 * each call asks the client for its roots first (a local round trip). Only stdio on the 2024–2025 era has a
 * server→client `roots/list`; elsewhere, or once a client has shown it has no roots, the call runs on the env or
 * working-directory root.
 */
export class ClientRootsSync {
	private unsupported = false;

	constructor(
		private readonly workspace: WorkspaceRoot,
		private readonly logger: Pick<Logger, 'warn'>,
	) {}

	async refresh(ctx: RootsRequestContext): Promise<void> {
		if (this.unsupported || ctx.transport !== 'stdio' || ctx.era !== 'legacy') return;
		const result = await ctx.server.mcpReq
			.send({ method: 'roots/list' }, { timeout: ROOTS_TIMEOUT_MS })
			.catch((error: unknown) => {
				this.unsupported = true;
				this.logger.warn(
					`The client did not answer roots/list (${String(error)}); using ${this.workspace.analysisRoot()}. ` +
						'Set ANALYSIS_REPO_ROOT / HARNESS_ROOT to pin a repo.',
				);
				return undefined;
			});
		if (result) this.workspace.adoptClientRoots(result.roots);
	}
}

@Injectable()
export class ClientRootsInterceptor implements NestInterceptor {
	private readonly sync: ClientRootsSync;

	constructor(@Inject(WorkspaceRoot) workspace: WorkspaceRoot) {
		this.sync = new ClientRootsSync(workspace, new Logger('Workspace'));
	}

	intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
		if (context.getType<string>() !== 'mcp') return next.handle();
		const ctx = McpExecutionContext.create(context).getContext() as McpContext | undefined;
		if (!ctx) return next.handle();
		return from(this.sync.refresh(ctx as unknown as RootsRequestContext)).pipe(switchMap(() => next.handle()));
	}
}
