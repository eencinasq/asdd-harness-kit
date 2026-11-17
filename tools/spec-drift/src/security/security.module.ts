import path from 'node:path';

import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.schema.ts';
import { whenToolset } from '../config/toolsets.ts';
import { SECURITY_OPTIONS, SecurityAuditService, type SecurityOptions } from './security.service.ts';
import { SecurityTools } from './security.tools.ts';

/**
 * Security audit (security-review): the service always loads; the MCP tools and the dashboard only under the
 * `security` toolset. Run state lives under `$XDG_STATE_HOME/spec-drift/security/` (design ADR-002).
 */
@Module({
	providers: [
		{
			provide: SECURITY_OPTIONS,
			inject: [ConfigService],
			useFactory: (config: ConfigService<Env, true>): SecurityOptions => ({
				repoRoot: config.get('ANALYSIS_REPO_ROOT', { infer: true }),
				stateRoot: path.join(config.get('XDG_STATE_HOME', { infer: true }), 'spec-drift', 'security'),
			}),
		},
		SecurityAuditService,
		...whenToolset('security', [SecurityTools]),
	],
	exports: [SecurityAuditService],
})
export class SecurityModule {}
