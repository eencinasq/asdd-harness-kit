import 'reflect-metadata';

import path from 'node:path';

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { McpStdioLogger, McpStdioServer } from '@nestjs/mcp';
import type { NestExpressApplication } from '@nestjs/platform-express';

import type { Env } from './config/env.schema.ts';

/**
 * Entry point.
 *   tsx src/main.ts           Streamable HTTP on http://HOST:PORT/mcp (+ GET /health)
 *   tsx src/main.ts --stdio   stdio transport, for clients that launch the server
 *
 * Logs always go to stderr (McpStdioLogger) so stdout stays clean for the stdio protocol.
 */

// The harness's knowledge scripts resolve .harness/ and .env from the working directory.
if (process.env['HARNESS_ROOT']) process.chdir(path.resolve(process.env['HARNESS_ROOT']));

const { AppModule } = await import('./app.module.ts');

const hostnameOf = (origin: string): string => {
	try {
		return new URL(origin).hostname;
	} catch {
		return '';
	}
};

const bootstrapHttp = async (): Promise<void> => {
	const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: new McpStdioLogger() });
	const config = app.get<ConfigService<Env, true>>(ConfigService);
	const allowed = new Set([
		'localhost',
		'127.0.0.1',
		'[::1]',
		...(config.get('MCP_ALLOWED_ORIGINS', { infer: true }) ?? []),
	]);
	app.enableCors({
		origin: (origin, callback) => callback(null, !origin || allowed.has(hostnameOf(origin))),
		allowedHeaders: [
			'Authorization',
			'Content-Type',
			'X-Api-Key',
			'Mcp-Protocol-Version',
			'Mcp-Session-Id',
			'Mcp-Method',
			'Mcp-Name',
			'Last-Event-ID',
		],
		exposedHeaders: ['WWW-Authenticate'],
	});
	app.enableShutdownHooks();
	const port = config.get('PORT', { infer: true });
	const host = config.get('HOST', { infer: true });
	await app.listen(port, host);
	const auth = config.get('MCP_API_KEY', { infer: true }) ? 'API key required' : 'no API key (loopback only)';
	Logger.log(`MCP listening on http://${host}:${port}/mcp (${auth})`, 'Bootstrap');
};

const bootstrapStdio = async (): Promise<void> => {
	const app = await NestFactory.createApplicationContext(AppModule, { logger: new McpStdioLogger() });
	await app.get(McpStdioServer).listen();
	await app.close();
};

const bootstrap = process.argv.includes('--stdio') ? bootstrapStdio : bootstrapHttp;

bootstrap().catch((error: unknown) => {
	console.error(error);
	process.exit(1);
});
