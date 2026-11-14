import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.schema.ts';
import { whenToolset } from '../config/toolsets.ts';
import { AuditPrompts } from './audit.prompts.ts';
import { AUDIT_OPTIONS, type AuditOptions, AuditService } from './audit.service.ts';
import { AuditTools } from './audit.tools.ts';
import { AuditInsightTools } from './audit-insight.tools.ts';

/**
 * Harness governance feature (formerly the spec-drift-auditor server): spec drift, architecture rules, spec
 * compliance, CI gate text and audit reports over the repo at HARNESS_ROOT, plus the audit dashboard.
 */
@Module({
	providers: [
		{
			provide: AUDIT_OPTIONS,
			inject: [ConfigService],
			useFactory: (config: ConfigService<Env, true>): AuditOptions => {
				return {
					root: config.get('HARNESS_ROOT', { infer: true }),
					semgrepBin: config.get('HARNESS_SEMGREP', { infer: true }),
					gateTimeoutMs: config.get('HARNESS_GATE_TIMEOUT_SECONDS', { infer: true }) * 1000,
				};
			},
		},
		AuditService,
		...whenToolset('audit', [AuditTools, AuditInsightTools, AuditPrompts]),
	],
	exports: [AuditService],
})
export class AuditModule {}
