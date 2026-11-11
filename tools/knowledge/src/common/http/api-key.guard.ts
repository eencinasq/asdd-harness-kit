import { timingSafeEqual } from 'node:crypto';

import { type CanActivate, type ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import type { Env } from '../../config/env.schema.ts';

const sameSecret = (a: string, b: string): boolean => {
	const left = Buffer.from(a);
	const right = Buffer.from(b);
	return left.length === right.length && timingSafeEqual(left, right);
};

/**
 * Protects the HTTP MCP endpoint when MCP_API_KEY is set (`X-Api-Key: <key>` or
 * `Authorization: Bearer <key>`). Without a key it allows the request: the server then only
 * listens on loopback (enforced by the env schema).
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
	private readonly apiKey?: string;

	constructor(@Inject(ConfigService) config: ConfigService<Env, true>) {
		this.apiKey = config.get('MCP_API_KEY', { infer: true });
	}

	canActivate(context: ExecutionContext): boolean {
		if (!this.apiKey || context.getType() !== 'http') return true;
		const request = context.switchToHttp().getRequest<Request>();
		const header = request.headers['x-api-key'];
		const bearer = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
		const provided = (Array.isArray(header) ? header[0] : header) ?? bearer;
		if (provided && sameSecret(provided, this.apiKey)) return true;
		throw new UnauthorizedException('Missing or invalid API key');
	}
}
