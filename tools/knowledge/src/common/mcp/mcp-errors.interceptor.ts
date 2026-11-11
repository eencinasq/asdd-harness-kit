import {
	type CallHandler,
	type ExecutionContext,
	HttpException,
	Injectable,
	InternalServerErrorException,
	Logger,
	type NestInterceptor,
} from '@nestjs/common';
import { McpExecutionContext } from '@nestjs/mcp';
import { catchError, type Observable, throwError } from 'rxjs';

/**
 * `@nestjs/mcp` reports only HttpException messages to the client; any other error becomes a bare
 * "Internal server error". Tools here surface actionable failures from git / gh / semgrep and from
 * pure libraries (e.g. a malformed comments.md), so wrap those messages instead of hiding them.
 */
@Injectable()
export class McpErrorsInterceptor implements NestInterceptor {
	private readonly logger = new Logger('Mcp');

	intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
		if (context.getType<string>() !== 'mcp') return next.handle();
		const mcp = McpExecutionContext.create(context);

		return next.handle().pipe(
			catchError((error: unknown) => {
				if (error instanceof HttpException) return throwError(() => error);
				const message = error instanceof Error ? error.message : String(error);
				this.logger.error(
					`${mcp.getKind() ?? 'call'} ${mcp.getName() ?? ''} failed: ${message}`,
					error instanceof Error ? error.stack : undefined,
				);
				return throwError(() => new InternalServerErrorException(message, { cause: error }));
			}),
		);
	}
}
