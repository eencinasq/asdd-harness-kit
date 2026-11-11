import { Module } from '@nestjs/common';

import { CODE_ANALYZER } from '../../ports/code-analyzer.port.ts';
import { SemgrepAnalyzer } from './semgrep.analyzer.ts';

/** Semgrep as the CodeAnalyzer engine: `AnalysisModule.forRoot({ engine: SemgrepEngineModule })`. */
@Module({
	providers: [SemgrepAnalyzer, { provide: CODE_ANALYZER, useExisting: SemgrepAnalyzer }],
	exports: [CODE_ANALYZER],
})
export class SemgrepEngineModule {}
