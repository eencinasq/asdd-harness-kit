import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.schema.ts';
import { KNOWLEDGE_OPTIONS, type KnowledgeOptions, KnowledgeService } from './knowledge.service.ts';
import { KnowledgeTools } from './knowledge.tools.ts';

/** Knowledge index and learning patterns (formerly .agents/mcp/knowledge-server.mjs) for the harness at HARNESS_ROOT. */
@Module({
	providers: [
		{
			provide: KNOWLEDGE_OPTIONS,
			inject: [ConfigService],
			useFactory: (config: ConfigService<Env, true>): KnowledgeOptions => {
				return { root: config.get('HARNESS_ROOT', { infer: true }) };
			},
		},
		KnowledgeService,
		KnowledgeTools,
	],
})
export class KnowledgeModule {}
