import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.schema.ts';
import { JEV_OPTIONS, type JevOptions, JevService } from './jev.service.ts';
import { JevTools } from './jev.tools.ts';

/** Jev gates (formerly .agents/mcp/jev-gate-server.mjs) over the harness at HARNESS_ROOT. */
@Module({
	providers: [
		{
			provide: JEV_OPTIONS,
			inject: [ConfigService],
			useFactory: (config: ConfigService<Env, true>): JevOptions => {
				return { root: config.get('HARNESS_ROOT', { infer: true }) };
			},
		},
		JevService,
		JevTools,
	],
})
export class JevModule {}
