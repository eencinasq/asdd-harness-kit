import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import { type McpContext, McpExecutionContext } from '@nestjs/mcp';
import { Observable } from 'rxjs';

import { mcpRequestContext } from './mcp-request-context.ts';

/** Makes the MCP call's cancellation signal and progress reporter available via `mcpRequestContext`. */
@Injectable()
export class McpRequestContextInterceptor implements NestInterceptor {
	intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
		if (context.getType<string>() !== 'mcp') return next.handle();
		const ctx = McpExecutionContext.create(context).getContext() as McpContext | undefined;
		if (!ctx) return next.handle();

		const requestContext = {
			signal: ctx.signal,
			// Progress is best effort: a client without a progress token simply ignores it.
			reportProgress: (progress: number, total?: number, message?: string) =>
				ctx.reportProgress(progress, total, message).catch(() => undefined),
		};
		return new Observable((subscriber) =>
			mcpRequestContext.run(requestContext, () => next.handle().subscribe(subscriber)),
		);
	}
}
