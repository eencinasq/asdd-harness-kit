import { Module } from '@nestjs/common';

import { CODE_ANALYZER } from '../../ports/code-analyzer.port.ts';
import { CompositeAnalyzer } from '../composite.analyzer.ts';
import { DependencyAnalyzer } from '../dependencies/dependency.analyzer.ts';
import { CodeqlAnalyzer } from './codeql.analyzer.ts';

/** CodeQL as the CodeAnalyzer engine (`SPEC_DRIFT_ENGINE=codeql`), with the dependency-graph rules next to it. */
@Module({
	providers: [
		CodeqlAnalyzer,
		DependencyAnalyzer,
		{
			provide: CODE_ANALYZER,
			useFactory: (codeql: CodeqlAnalyzer, dependencies: DependencyAnalyzer) =>
				new CompositeAnalyzer(codeql, [{ analyzer: dependencies, owns: DependencyAnalyzer.owns }]),
			inject: [CodeqlAnalyzer, DependencyAnalyzer],
		},
	],
	exports: [CODE_ANALYZER],
})
export class CodeqlEngineModule {}
