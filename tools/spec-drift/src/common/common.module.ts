import { Global, Module } from '@nestjs/common';

import { ProcessRunner } from './process/process-runner.service.ts';

/** Cross-cutting infrastructure shared by every feature module. */
@Global()
@Module({
	providers: [ProcessRunner],
	exports: [ProcessRunner],
})
export class CommonModule {}
