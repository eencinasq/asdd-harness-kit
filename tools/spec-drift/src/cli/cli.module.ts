import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AnalysisModule } from '../analysis/analysis.module.ts';
import { CommonModule } from '../common/common.module.ts';
import { validateEnv } from '../config/env.schema.ts';

/** The analysis services for the CLI commands: no MCP transport, no tools. */
@Module({
	imports: [
		ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv, ignoreEnvFile: true }),
		CommonModule,
		AnalysisModule.forRoot(),
	],
})
export class CliModule {}
