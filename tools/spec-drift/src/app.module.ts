import { Module, UseGuards } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { McpModule } from '@nestjs/mcp';
import { AnalysisModule } from './analysis/analysis.module.ts';
import { APP_NAME, APP_VERSION } from './app.constants.ts';
import { AuditModule } from './audit/audit.module.ts';
import { CommonModule } from './common/common.module.ts';
import { ApiKeyGuard } from './common/http/api-key.guard.ts';
import { LoopbackHostGuard } from './common/http/loopback-host.guard.ts';
import { McpErrorsInterceptor } from './common/mcp/mcp-errors.interceptor.ts';
import { McpRequestContextInterceptor } from './common/mcp/mcp-request-context.interceptor.ts';
import { type Env, validateEnv } from './config/env.schema.ts';
import { HealthModule } from './health/health.module.ts';
import { PrReviewModule } from './pr-review/pr-review.module.ts';

const LOCAL_NAMES = ['localhost', '127.0.0.1', '[::1]'];

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			cache: true,
			validate: validateEnv,
			// MCP clients pass env in their server config; no .env loading (and nothing on stdout).
			ignoreEnvFile: true,
		}),
		McpModule.forRootAsync({
			// Streamable HTTP at /mcp: DNS-rebinding protection on loopback, API key when MCP_API_KEY is set.
			path: 'mcp',
			decorators: [UseGuards(LoopbackHostGuard, ApiKeyGuard)],
			inject: [ConfigService],
			useFactory: (config: ConfigService<Env, true>) => {
				return {
					name: APP_NAME,
					version: APP_VERSION,
					instructions:
						'Static-analysis architecture/standards scans (spec drift, Semgrep by default) and interactive GitHub PR review. ' +
						'For a PR review: pr_review_start, then pr_review_submit_findings once per group until ' +
						'coverage is complete, then pr_review_status for the human to edit in the dashboard. ' +
						'Harness governance (asdd-harness-kit at HARNESS_ROOT): audit_diff, verify_architecture_rules, ' +
						'verify_spec_compliance, audit_report, audit_finding and generate_ci_gate are read-only.',
					http: {
						// Browsers on other sites must not drive the tools (they act with your gh credentials).
						allowedOrigins: [...LOCAL_NAMES, ...(config.get('MCP_ALLOWED_ORIGINS', { infer: true }) ?? [])],
					},
				};
			},
		}),
		CommonModule,
		HealthModule,
		AnalysisModule.forRoot(),
		PrReviewModule,
		AuditModule,
	],
	providers: [
		// Order matters: the request context must wrap error handling and the handler.
		{ provide: APP_INTERCEPTOR, useClass: McpRequestContextInterceptor },
		{ provide: APP_INTERCEPTOR, useClass: McpErrorsInterceptor },
	],
})
export class AppModule {}
