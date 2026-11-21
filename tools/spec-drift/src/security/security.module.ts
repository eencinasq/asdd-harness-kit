import path from 'node:path';

import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.schema.ts';
import { whenToolset } from '../config/toolsets.ts';
import { WorkspaceModule } from '../workspace/workspace.module.ts';
import { WorkspaceRoot } from '../workspace/workspace-root.ts';
import { SECURITY_OPTIONS, SecurityAuditService, type SecurityOptions } from './security.service.ts';
import { SecurityTools } from './security.tools.ts';

/**
 * Security audit (security-review): the service always loads; the MCP tools and the dashboard only under the
 * `security` toolset. Run state lives under `$XDG_STATE_HOME/spec-drift/security/` (design ADR-002).
 */
@Module({
	imports: [WorkspaceModule],
	providers: [
		{
			provide: SECURITY_OPTIONS,
			inject: [ConfigService, WorkspaceRoot],
			useFactory: (config: ConfigService<Env, true>, workspace: WorkspaceRoot): SecurityOptions => ({
				// A getter: the repo is the client's current project, which can change after startup.
				get repoRoot() {
					return workspace.analysisRoot();
				},
				stateRoot: path.join(config.get('XDG_STATE_HOME', { infer: true }), 'spec-drift', 'security'),
			}),
		},
		SecurityAuditService,
		...whenToolset('security', [SecurityTools]),
	],
	exports: [SecurityAuditService],
})
export class SecurityModule {}
