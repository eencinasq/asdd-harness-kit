import { type DynamicModule, Module, type Type } from '@nestjs/common';

import { whenToolset } from '../config/toolsets.ts';
import { AnalysisPrompts } from './analysis.prompts.ts';
import { AnalysisService } from './analysis.service.ts';
import { AnalysisTools } from './analysis.tools.ts';
import { SemgrepEngineModule } from './engines/semgrep/semgrep-engine.module.ts';
import { AnalysisJobs } from './jobs/analysis-jobs.ts';

export type AnalysisModuleOptions = {
	/**
	 * Module that provides and exports `CODE_ANALYZER` (see ports/code-analyzer.port.ts).
	 * Defaults to Semgrep; swap in e.g. a `CodeqlEngineModule` without touching tools, dashboards or
	 * the PR review.
	 */
	readonly engine?: Type | DynamicModule;
};

/**
 * Static-analysis feature: spec-drift tools + dashboard on top of a pluggable engine. Global, so
 * other features (PR review) can inject `AnalysisService` or `CODE_ANALYZER` directly.
 */
@Module({})
export class AnalysisModule {
	static forRoot(options: AnalysisModuleOptions = {}): DynamicModule {
		const engine = options.engine ?? SemgrepEngineModule;
		return {
			module: AnalysisModule,
			global: true,
			imports: [engine],
			providers: [
				AnalysisService,
				// Background scans live in this process (spec-drift-depth REQ-004).
				{ provide: AnalysisJobs, useFactory: () => new AnalysisJobs() },
				...whenToolset('analysis', [AnalysisTools, AnalysisPrompts]),
			],
			exports: [AnalysisService, engine],
		};
	}
}
