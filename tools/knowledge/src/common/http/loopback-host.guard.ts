import { type CanActivate, type ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import { type Env, isLoopbackHost } from '../../config/env.schema.ts';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** Hostname of a Host header (`[::1]:3010` → `[::1]`, `localhost:3010` → `localhost`). */
const hostnameOf = (host: string): string =>
	host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : (host.split(':')[0] ?? '');

/**
 * DNS-rebinding protection: while the server is bound to loopback, only accept requests whose
 * Host header names localhost. A malicious site that re-points its own domain at 127.0.0.1 then
 * gets 403 instead of driving the tools.
 */
@Injectable()
export class LoopbackHostGuard implements CanActivate {
	private readonly enforce: boolean;

	constructor(@Inject(ConfigService) config: ConfigService<Env, true>) {
		this.enforce = isLoopbackHost(config.get('HOST', { infer: true }));
	}

	canActivate(context: ExecutionContext): boolean {
		if (!this.enforce || context.getType() !== 'http') return true;
		const host = context.switchToHttp().getRequest<Request>().headers.host ?? '';
		if (LOCAL_HOSTNAMES.has(hostnameOf(host))) return true;
		throw new ForbiddenException(`Host '${host}' is not allowed`);
	}
}
