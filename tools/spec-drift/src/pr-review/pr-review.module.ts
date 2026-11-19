import { Module } from '@nestjs/common';

import { whenToolset } from '../config/toolsets.ts';
import { WorkspaceModule } from '../workspace/workspace.module.ts';
import { ArchitectureScanService } from './architecture/architecture-scan.service.ts';
import { CodeCoverageScanService } from './code-coverage/code-coverage-scan.service.ts';
import { CommentsService } from './comments/comments.service.ts';
import { GithubService } from './github/github.service.ts';
import { PrReviewPrompts } from './pr-review.prompts.ts';
import { PrReviewService } from './pr-review.service.ts';
import { PrReviewTools } from './pr-review.tools.ts';
import { TicketService } from './requirements/ticket.service.ts';
import { ReviewArtifactsRepository } from './workspace/review-artifacts.repository.ts';
import { ReviewWorkspaceService } from './workspace/review-workspace.service.ts';

@Module({
	imports: [WorkspaceModule],
	providers: [
		// MCP entry points (spec-drift-adoption REQ-003: only with the review toolset)
		...whenToolset('review', [PrReviewTools, PrReviewPrompts]),
		// application service (the review workflow)
		PrReviewService,
		// infrastructure
		GithubService,
		ReviewWorkspaceService,
		ReviewArtifactsRepository,
		CommentsService,
		ArchitectureScanService,
		CodeCoverageScanService,
		TicketService,
	],
	exports: [PrReviewService],
})
export class PrReviewModule {}
