import { Global, Module } from '@nestjs/common';

import { WorkspaceRoot, workspaceRootProvider } from './workspace-root.ts';

/** One WorkspaceRoot per process: the stdio bootstrap feeds it the client's roots, every feature reads from it. */
@Global()
@Module({
	providers: [workspaceRootProvider],
	exports: [WorkspaceRoot],
})
export class WorkspaceModule {}
