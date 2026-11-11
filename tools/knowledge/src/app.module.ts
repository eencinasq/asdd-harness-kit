import { Module, UseGuards } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { McpModule } from '@nestjs/mcp';

import { APP_NAME, APP_VERSION } from './app.constants.ts';
import { ApiKeyGuard } from './common/http/api-key.guard.ts';
import { LoopbackHostGuard } from './common/http/loopback-host.guard.ts';
import { McpErrorsInterceptor } from './common/mcp/mcp-errors.interceptor.ts';
import { type Env, validateEnv } from './config/env.schema.ts';
import { HealthModule } from './health/health.module.ts';
import { KnowledgeModule } from './knowledge/knowledge.module.ts';

const LOCAL_NAMES = ['localhost', '127.0.0.1', '[::1]'];

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			cache: true,
			validate: validateEnv,
			// MCP clients pass env in their server config; the harness's env-loader reads .env itself.
			ignoreEnvFile: true,
		}),
		McpModule.forRootAsync({
			// Streamable HTTP at /mcp: DNS-rebinding protection on loopback, API key when MCP_API_KEY is set.
			path: 'mcp',
			decorators: [UseGuards(LoopbackHostGuard, ApiKeyGuard)],
			inject: [ConfigService],
			useFactory: (config: ConfigService<Env, true>) => ({
				name: APP_NAME,
				version: APP_VERSION,
				instructions:
					'Process memory of this harness: what the squad already decided, specified, and learned. ' +
					'knowledge_status first; knowledge_slice for one slice, knowledge_trace for REQ → feature → file, ' +
					'knowledge_search otherwise, knowledge_patterns before proposing a guide or sensor change.',
				http: {
					allowedOrigins: [...LOCAL_NAMES, ...(config.get('MCP_ALLOWED_ORIGINS', { infer: true }) ?? [])],
				},
			}),
		}),
		HealthModule,
		KnowledgeModule,
	],
	providers: [{ provide: APP_INTERCEPTOR, useClass: McpErrorsInterceptor }],
})
export class AppModule {}
