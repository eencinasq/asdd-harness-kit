import { Module } from '@nestjs/common';

import { CODE_ANALYZER } from '../../ports/code-analyzer.port.ts';
import { CompositeAnalyzer } from '../composite.analyzer.ts';
import { DependencyAnalyzer } from '../dependencies/dependency.analyzer.ts';
import { SemgrepAnalyzer } from './semgrep.analyzer.ts';

/**
 * Semgrep as the CodeAnalyzer engine: `AnalysisModule.forRoot({ engine: SemgrepEngineModule })`. The dependency-graph
 * rules of `domain-layer.project.md` run next to it behind the same port (spec-drift-depth REQ-003, ADR-003).
 */
@Module({
	providers: [
		SemgrepAnalyzer,
		DependencyAnalyzer,
		{
			provide: CODE_ANALYZER,
			useFactory: (semgrep: SemgrepAnalyzer, dependencies: DependencyAnalyzer) =>
				new CompositeAnalyzer(semgrep, [{ analyzer: dependencies, owns: DependencyAnalyzer.owns }]),
			inject: [SemgrepAnalyzer, DependencyAnalyzer],
		},
	],
	exports: [CODE_ANALYZER],
})
export class SemgrepEngineModule {}
